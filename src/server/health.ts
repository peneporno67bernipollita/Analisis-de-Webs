import { getEnv, isAuthConfigured } from "@/config/env";
import { prisma } from "@/db/client";
import { listPlaceProviders, getSearchProvider } from "@/providers";
import { pushConfigured } from "./push";

export interface HealthReport {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

/** Estado del sistema. Nunca incluye valores de secretos, solo si están configurados. */
export async function getHealth(): Promise<HealthReport> {
  const checks: HealthReport["checks"] = [];
  let env;
  try {
    env = getEnv();
    checks.push({ name: "Configuración (.env)", ok: true, detail: "Variables válidas" });
  } catch (err) {
    checks.push({ name: "Configuración (.env)", ok: false, detail: (err as Error).message });
    return { ok: false, checks };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    const migrations = await prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*)::bigint AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    checks.push({
      name: "Base de datos",
      ok: true,
      detail: `Conectada · ${Number(migrations[0]?.n ?? 0)} migraciones aplicadas`,
    });
  } catch (err) {
    checks.push({
      name: "Base de datos",
      ok: false,
      detail: `Sin conexión: ${(err as Error).message.slice(0, 160)}`,
    });
  }
  try {
    const beats = await prisma.workerHeartbeat.findMany({
      where: { lastBeatAt: { gte: new Date(Date.now() - 60_000) } },
    });
    const queued = await prisma.scanJob.count({ where: { status: "QUEUED" } });
    const running = await prisma.scanJob.count({ where: { status: "RUNNING" } });
    const failed = await prisma.scanJob.count({
      where: { status: "FAILED", finishedAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    checks.push({
      name: "Worker de jobs",
      ok: beats.length > 0 || env.WORKER_MODE === "off",
      detail: `${beats.length} activo(s) · modo ${env.WORKER_MODE ?? "inprocess"} · cola: ${queued} en espera, ${running} en curso, ${failed} fallidos (24 h)`,
    });
  } catch {
    checks.push({ name: "Worker de jobs", ok: false, detail: "No se pudo consultar" });
  }
  for (const p of listPlaceProviders()) {
    checks.push({
      name: `Proveedor: ${p.label}`,
      ok: p.configured,
      detail: `${p.configured ? "Configurado" : "No configurado"}${p.isDefault ? " · por defecto" : ""}${p.supportsReviews ? " · con reseñas" : ""}`,
    });
  }
  const search = getSearchProvider();
  checks.push({
    name: "Buscador (web oficial)",
    ok: true,
    detail: search ? `Configurado (${search.key})` : "No configurado (opcional)",
  });
  checks.push({
    name: "Autenticación",
    ok: isAuthConfigured(env) || env.NODE_ENV !== "production",
    detail: isAuthConfigured(env)
      ? "Login activado"
      : env.NODE_ENV === "production"
        ? "FALTA configurar (obligatorio en producción)"
        : "Desactivada en desarrollo",
  });
  checks.push({
    name: "Notificaciones push",
    ok: true,
    detail: pushConfigured() ? "Configuradas (VAPID)" : "No configuradas (opcional)",
  });
  checks.push({
    name: "Renderizado con navegador",
    ok: true,
    detail: env.ENABLE_BROWSER_RENDERING ? "Activado" : "Desactivado (opcional)",
  });
  return { ok: checks.every((c) => c.ok), checks };
}
