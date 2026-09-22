import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { apiError, guard } from "@/server/http";

/** Anti-SSRF: web-push hace POST al endpoint, así que solo se aceptan servicios push conocidos. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /\.notify\.windows\.com$/,
  /^android\.googleapis\.com$/,
];
const isPushEndpoint = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
};

const Sub = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint, "Endpoint de notificaciones no permitido"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export async function POST(req: Request) {
  const denied = await guard(req, {
    mutate: true,
    rate: { key: "push-sub", limit: 20, windowMs: 60 * 60_000 },
  });
  if (denied) return denied;
  try {
    const s = Sub.parse(await req.json());
    await prisma.pushSubscription.upsert({
      where: { endpoint: s.endpoint },
      create: {
        endpoint: s.endpoint,
        p256dh: s.keys.p256dh,
        auth: s.keys.auth,
        userAgent: req.headers.get("user-agent")?.slice(0, 200),
      },
      update: { p256dh: s.keys.p256dh, auth: s.keys.auth },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
