import os from "node:os";
import { prisma } from "@/db/client";
import { notifyDueFollowUps } from "@/server/push";
import { sleep } from "@/shared/async";
import { NotFoundError, ProviderError, errorMessage } from "@/shared/errors";
import { createLogger } from "@/shared/logger";
import { claimNext, completeJob, failJob, recoverStaleJobs, type ClaimedJob } from "./queue";
import { handleDiscover } from "./handlers/discover";
import { runBusinessAnalysis } from "./handlers/analyze-business";
import { recordBusinessOutcome } from "./scan-progress";
import type { ReviewInput } from "@/domain/types";

const log = createLogger("worker");

function isRetryable(err: unknown): boolean {
  if (err instanceof NotFoundError) return false;
  if (err instanceof ProviderError) return err.retryable;
  // Errores inesperados (red, base de datos…): se reintentan hasta maxAttempts
  return true;
}

async function runJob(job: ClaimedJob) {
  if (job.type === "DISCOVER") {
    if (!job.scanId) throw new NotFoundError("Job DISCOVER sin scanId");
    await handleDiscover(job.scanId);
    return;
  }
  if (job.type === "ANALYZE_BUSINESS") {
    if (!job.businessId) throw new NotFoundError("Job ANALYZE_BUSINESS sin businessId");
    if (job.scanId) {
      const scan = await prisma.scan.findUnique({ where: { id: job.scanId }, select: { status: true } });
      if (scan?.status === "CANCELLED") return;
    }
    const payload = job.payload ?? {};
    await runBusinessAnalysis(job.businessId, {
      scanId: job.scanId,
      reviews: (payload.reviews as ReviewInput[] | undefined) ?? undefined,
      refreshProvider: Boolean(payload.refreshProvider),
    });
  }
}

async function onJobFinished(job: ClaimedJob, ok: boolean) {
  if (job.type === "ANALYZE_BUSINESS" && job.scanId) await recordBusinessOutcome(job.scanId, ok);
  if (job.type === "DISCOVER" && !ok && job.scanId) {
    await prisma.scan.update({
      where: { id: job.scanId },
      data: { status: "FAILED", finishedAt: new Date() },
    });
  }
}

export interface WorkerHandle {
  id: string;
  stop: () => Promise<void>;
}

export function startWorker(opts: { concurrency: number; label?: string }): WorkerHandle {
  const id = `${opts.label ?? "worker"}:${os.hostname()}:${process.pid}`;
  let stopped = false;
  log.info("worker started", { id, concurrency: opts.concurrency });

  const loop = async (slot: number) => {
    while (!stopped) {
      let job: ClaimedJob | null = null;
      try {
        job = await claimNext(`${id}#${slot}`);
      } catch (err) {
        log.error("claim failed", { error: err });
        await sleep(5000);
        continue;
      }
      if (!job) {
        await sleep(2000);
        continue;
      }
      try {
        await runJob(job);
        await completeJob(job.id);
        await onJobFinished(job, true);
      } catch (err) {
        const msg = errorMessage(err);
        log.warn("job failed", { jobId: job.id, type: job.type, attempt: job.attempts, error: msg });
        try {
          const rescheduled = await failJob(job, msg, isRetryable(err));
          if (!rescheduled) {
            if (job.type === "DISCOVER" && job.scanId) {
              await prisma.scan.update({
                where: { id: job.scanId },
                data: { errorMessage: msg.slice(0, 500) },
              });
            }
            await onJobFinished(job, false);
          }
        } catch (inner) {
          log.error("failJob failed", { error: inner });
        }
      }
    }
  };

  const loops = Array.from({ length: opts.concurrency }, (_, i) => loop(i));

  const heartbeat = async () => {
    try {
      await prisma.workerHeartbeat.upsert({
        where: { id },
        create: { id, lastBeatAt: new Date(), info: { concurrency: opts.concurrency, pid: process.pid } },
        update: { lastBeatAt: new Date() },
      });
    } catch (err) {
      log.warn("heartbeat failed", { error: err });
    }
  };
  void heartbeat();
  const hb = setInterval(heartbeat, 15_000);
  const maintenance = setInterval(async () => {
    try {
      const n = await recoverStaleJobs();
      if (n) log.warn("recovered stale jobs", { n });
      await notifyDueFollowUps();
    } catch (err) {
      log.warn("maintenance failed", { error: err });
    }
  }, 60_000);

  return {
    id,
    async stop() {
      stopped = true;
      clearInterval(hb);
      clearInterval(maintenance);
      await Promise.allSettled(loops);
      await prisma.workerHeartbeat.delete({ where: { id } }).catch(() => undefined);
      log.info("worker stopped", { id });
    },
  };
}
