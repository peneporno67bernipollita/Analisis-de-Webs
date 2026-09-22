import { NextResponse } from "next/server";
import { prisma } from "@/db/client";
import { apiError, guard } from "@/server/http";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard(req, { mutate: true });
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    await prisma.manualNote.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
