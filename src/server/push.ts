import webpush from "web-push";
import { getEnv } from "@/config/env";
import { prisma } from "@/db/client";
import { createLogger } from "@/shared/logger";

/**
 * Notificaciones Web Push (PWA instalada en el móvil).
 * Se usan solo para avisarte a TI (seguimientos pendientes, escaneos terminados).
 * La aplicación nunca envía mensajes a los negocios.
 */

const log = createLogger("push");
let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const env = getEnv();
  if (env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT ?? "mailto:admin@example.invalid",
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );
    configured = true;
  } else configured = false;
  return configured;
}

export async function notifyAll(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<number> {
  if (!pushConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany();
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 12 },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410)
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      else log.warn("push failed", { status });
    }
  }
  return sent;
}

/** Envía un aviso por cada seguimiento vencido que aún no se haya notificado. */
export async function notifyDueFollowUps(): Promise<number> {
  if (!pushConfigured()) return 0;
  const due = await prisma.business.findMany({
    where: {
      nextFollowUpAt: { lte: new Date() },
      followUpNotifiedAt: null,
      leadStatus: { notIn: ["WON", "LOST", "DISCARDED"] },
    },
    select: { id: true, name: true, city: true },
    take: 20,
  });
  if (!due.length) return 0;
  const body =
    due.length === 1
      ? `${due[0].name}${due[0].city ? ` (${due[0].city})` : ""}`
      : `${due.length} negocios: ${due
          .slice(0, 3)
          .map((d) => d.name)
          .join(", ")}${due.length > 3 ? "…" : ""}`;
  await notifyAll({
    title: "Seguimiento pendiente",
    body,
    url: due.length === 1 ? `/businesses/${due[0].id}` : "/followups",
    tag: "followups",
  });
  await prisma.business.updateMany({
    where: { id: { in: due.map((d) => d.id) } },
    data: { followUpNotifiedAt: new Date() },
  });
  return due.length;
}
