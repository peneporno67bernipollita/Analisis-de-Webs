import { NextResponse } from "next/server";
import { prisma } from "@/db/client";
import { guard } from "@/server/http";

export const dynamic = "force-dynamic";

/** Progreso del escaneo (lo consulta la UI periódicamente). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) return NextResponse.json({ error: "Escaneo no encontrado" }, { status: 404 });
  const [queued, running, failed] = await Promise.all([
    prisma.scanJob.count({ where: { scanId: id, status: "QUEUED" } }),
    prisma.scanJob.count({ where: { scanId: id, status: "RUNNING" } }),
    prisma.scanJob.count({ where: { scanId: id, status: "FAILED" } }),
  ]);
  return NextResponse.json({
    id: scan.id,
    status: scan.status,
    totalFound: scan.totalFound,
    totalAnalyzed: scan.totalAnalyzed,
    totalFailed: scan.totalFailed,
    processed: scan.totalAnalyzed + scan.totalFailed,
    jobs: { queued, running, failed },
    estimatedCostUsd: scan.estimatedCostUsd,
    errorMessage: scan.errorMessage,
    warnings: scan.warnings,
    updatedAt: scan.updatedAt,
  });
}
