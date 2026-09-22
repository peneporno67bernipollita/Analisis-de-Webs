import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { apiError, guard } from "@/server/http";

const Body = z.object({ content: z.string().trim().min(1, "La nota está vacía").max(5000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guard(req, { mutate: true });
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const { content } = Body.parse(await req.json());
    const note = await prisma.manualNote.create({ data: { businessId: id, content } });
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
