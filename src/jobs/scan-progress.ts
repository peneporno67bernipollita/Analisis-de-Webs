import { prisma } from "@/db/client";
import { estimateCostUsd } from "@/config/pricing";
import { notifyAll } from "@/server/push";
import { createLogger } from "@/shared/logger";

const log = createLogger("scan-progress");

/** Suma contadores de uso de API al escaneo de forma atómica (jsonb). */
export async function addScanUsage(scanId: string, usage: Record<string, number>) {
  for (const [sku, n] of Object.entries(usage)) {
    if (!n) continue;
    await prisma.$executeRaw`
      UPDATE scans
         SET api_usage = COALESCE(api_usage, '{}'::jsonb) || jsonb_build_object(${sku}::text, COALESCE((api_usage->>${sku}::text)::int, 0) + ${n}::int),
             updated_at = now()
       WHERE id = ${scanId}`;
  }
  const scan = await prisma.scan.findUnique({ where: { id: scanId }, select: { apiUsage: true } });
  await prisma.scan.update({
    where: { id: scanId },
    data: { estimatedCostUsd: estimateCostUsd(scan?.apiUsage as Record<string, number> | null) },
  });
}

/** Registra el resultado de un negocio y cierra el escaneo cuando ya no quedan pendientes. */
export async function recordBusinessOutcome(scanId: string, ok: boolean) {
  const scan = await prisma.scan.update({
    where: { id: scanId },
    data: ok ? { totalAnalyzed: { increment: 1 } } : { totalFailed: { increment: 1 } },
  });
  await maybeCompleteScan(scanId, scan);
}

export async function maybeCompleteScan(
  scanId: string,
  scan?: { totalAnalyzed: number; totalFailed: number; totalFound: number; status: string },
) {
  const s = scan ?? (await prisma.scan.findUnique({ where: { id: scanId } }));
  if (!s || s.status !== "ANALYZING") return;
  if (s.totalAnalyzed + s.totalFailed < s.totalFound) return;
  const res = await prisma.scan.updateMany({
    where: { id: scanId, status: "ANALYZING" },
    data: { status: s.totalFailed > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED", finishedAt: new Date() },
  });
  if (res.count === 1) {
    const full = await prisma.scan.findUnique({ where: { id: scanId } });
    const high = await prisma.business.count({
      where: { scans: { some: { scanId } }, opportunityLevel: "HIGH" },
    });
    log.info("scan completed", { scanId, analyzed: full?.totalAnalyzed, failed: full?.totalFailed });
    await notifyAll({
      title: "Escaneo completado",
      body: `${full?.city ?? ""}: ${full?.totalAnalyzed ?? 0} negocios analizados · ${high} oportunidades altas`,
      url: `/scans/${scanId}`,
    }).catch(() => undefined);
  }
}
