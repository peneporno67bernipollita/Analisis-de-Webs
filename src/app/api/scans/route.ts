import { NextResponse } from "next/server";
import { prisma } from "@/db/client";
import { createScan } from "@/server/scans";
import { apiError, guard } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const scans = await prisma.scan.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ scans });
}

export async function POST(req: Request) {
  const denied = await guard(req, {
    mutate: true,
    rate: { key: "scan-create", limit: 10, windowMs: 60 * 60_000 },
  });
  if (denied) return denied;
  try {
    const body = await req.json();
    const scan = await createScan(body);
    return NextResponse.json({ scan }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
