import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { apiError, guard } from "@/server/http";

export async function POST(req: Request) {
  const denied = await guard(req, { mutate: true });
  if (denied) return denied;
  try {
    const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(await req.json());
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
