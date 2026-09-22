/**
 * Rate limiting en memoria (ventana deslizante simple) para rutas sensibles.
 * Suficiente para una instancia. Con varias instancias, sustituir por Redis u otro almacén compartido.
 */
const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retryAfterSec = Math.ceil((windowMs - (now - hits[0])) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfterSec };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clientKeyFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? headers.get("x-real-ip") ?? "local").trim();
}
