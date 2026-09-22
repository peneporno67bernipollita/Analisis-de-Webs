import { NextResponse } from "next/server";
import { getHealth } from "@/server/health";
import { guard } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const report = await getHealth();
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
