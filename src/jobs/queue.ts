import { prisma } from "@/db/client";
import { Prisma, type JobType } from "@/generated/prisma/client";

/**
 * Cola de trabajos persistida en PostgreSQL (tabla scan_jobs).
 * - Reclamación atómica con `FOR UPDATE SKIP LOCKED`: varios workers pueden trabajar a la vez.
 * - Reintentos con backoff exponencial para errores transitorios.
 * - Recuperación de trabajos bloqueados (worker caído) por timeout de lock.
 */

export interface ClaimedJob {
  id: string;
  scanId: string | null;
  businessId: string | null;
  type: JobType;
  payload: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
}

export async function enqueue(
  type: JobType,
  data: {
    scanId?: string | null;
    businessId?: string | null;
    payload?: Prisma.InputJsonValue;
    maxAttempts?: number;
    runAfter?: Date;
  },
) {
  return prisma.scanJob.create({
    data: {
      type,
      scanId: data.scanId ?? null,
      businessId: data.businessId ?? null,
      payload: data.payload,
      maxAttempts: data.maxAttempts ?? 3,
      runAfter: data.runAfter ?? new Date(),
    },
  });
}

export async function claimNext(workerId: string): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      scan_id: string | null;
      business_id: string | null;
      type: JobType;
      payload: unknown;
      attempts: number;
      max_attempts: number;
    }[]
  >`
    UPDATE scan_jobs
       SET status = 'RUNNING', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM scan_jobs
        WHERE status = 'QUEUED' AND run_after <= now()
        ORDER BY (CASE WHEN type = 'DISCOVER' THEN 0 ELSE 1 END), created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id, scan_id, business_id, type, payload, attempts, max_attempts`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    scanId: r.scan_id,
    businessId: r.business_id,
    type: r.type,
    payload: (r.payload as Record<string, unknown> | null) ?? null,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
  };
}

export async function completeJob(id: string) {
  // payload se vacía: puede contener datos transitorios de terceros (p. ej. reseñas)
  await prisma.scanJob.update({
    where: { id },
    data: { status: "DONE", finishedAt: new Date(), lockedAt: null, payload: Prisma.DbNull },
  });
}

/** Devuelve true si el job se reprogramó, false si quedó definitivamente FAILED. */
export async function failJob(job: ClaimedJob, error: string, retryable: boolean): Promise<boolean> {
  const safeError = error.slice(0, 1000);
  if (retryable && job.attempts < job.maxAttempts) {
    const delayMs = Math.min(15 * 60_000, 20_000 * 2 ** (job.attempts - 1));
    await prisma.scanJob.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        lastError: safeError,
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(Date.now() + delayMs),
      },
    });
    return true;
  }
  await prisma.scanJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      lastError: safeError,
      finishedAt: new Date(),
      lockedAt: null,
      payload: Prisma.DbNull,
    },
  });
  return false;
}

/** Re-encola trabajos RUNNING cuyo worker dejó de responder. */
export async function recoverStaleJobs(staleAfterMs = 10 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const requeued = await prisma.scanJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: {
      status: "QUEUED",
      lockedAt: null,
      lockedBy: null,
      lastError: "Recuperado tras bloqueo (worker detenido)",
    },
  });
  return requeued.count;
}

export async function cancelScanJobs(scanId: string) {
  await prisma.scanJob.updateMany({
    where: { scanId, status: "QUEUED" },
    data: { status: "CANCELLED", finishedAt: new Date(), payload: Prisma.DbNull },
  });
}
