import { NextResponse } from "next/server";
import { notifyAll } from "@/server/push";
import { guard } from "@/server/http";

export async function POST(req: Request) {
  const denied = await guard(req, {
    mutate: true,
    rate: { key: "push-test", limit: 10, windowMs: 60 * 60_000 },
  });
  if (denied) return denied;
  const sent = await notifyAll({
    title: "Prueba de notificación",
    body: "Las notificaciones funcionan en este dispositivo.",
    url: "/followups",
  });
  return NextResponse.json({ ok: sent > 0, sent }, { status: sent > 0 ? 200 : 400 });
}
