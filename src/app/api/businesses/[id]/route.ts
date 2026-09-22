import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { apiError, guard } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: { contacts: true, notes: { orderBy: { createdAt: "desc" } } },
  });
  if (!business) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  const analysis = business.latestAnalysisId
    ? await prisma.analysis.findUnique({
        where: { id: business.latestAnalysisId },
        include: { audit: true, evidence: true, recommendations: true },
      })
    : null;
  return NextResponse.json({ business, analysis });
}

/** Campos de seguimiento comercial (CRM ligero). */
const Patch = z.object({
  leadStatus: z
    .enum(["NEW", "TO_CONTACT", "CONTACTED", "INTERESTED", "PROPOSAL_SENT", "WON", "LOST", "DISCARDED"])
    .optional(),
  nextFollowUpAt: z.string().datetime({ offset: true }).nullable().optional().or(z.literal("")),
  markContacted: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard(req, { mutate: true });
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = Patch.parse(await req.json());
    const data: Record<string, unknown> = {};
    if (body.leadStatus) data.leadStatus = body.leadStatus;
    if (body.nextFollowUpAt !== undefined) {
      data.nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
      data.followUpNotifiedAt = null; // nuevo seguimiento → nuevo aviso
    }
    if (body.markContacted) {
      data.lastContactedAt = new Date();
      if (!body.leadStatus) data.leadStatus = "CONTACTED";
    }
    const business = await prisma.business.update({ where: { id }, data });
    return NextResponse.json({ business });
  } catch (err) {
    return apiError(err);
  }
}
