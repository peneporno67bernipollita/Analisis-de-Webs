import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { enqueue } from "@/jobs/queue";
import { apiError, guard } from "@/server/http";

const Body = z.object({ refreshProvider: z.boolean().optional() }).default({});

/** Encola un nuevo análisis. refreshProvider=true vuelve a pedir los datos al proveedor (puede tener coste). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard(req, {
    mutate: true,
    rate: { key: "reanalyze", limit: 60, windowMs: 60 * 60_000 },
  });
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = Body.parse(await req.json().catch(() => ({})));
    const exists = await prisma.business.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
    const pending = await prisma.scanJob.findFirst({
      where: { businessId: id, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (pending) return NextResponse.json({ ok: true, jobId: pending.id, alreadyQueued: true });
    const job = await enqueue("ANALYZE_BUSINESS", {
      businessId: id,
      payload: { refreshProvider: Boolean(body.refreshProvider) },
      maxAttempts: 2,
    });
    return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const pending = await prisma.scanJob.findFirst({
    where: { businessId: id, status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true, status: true },
  });
  return NextResponse.json({ pending });
}
