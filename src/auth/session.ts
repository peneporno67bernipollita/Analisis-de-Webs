import crypto from "node:crypto";

/**
 * Sesión sin estado: cookie httpOnly con payload firmado (HMAC-SHA256).
 * Formato: base64url(JSON{u, exp}).base64url(firma)
 */
export const SESSION_COOKIE = "bos_session";

export interface SessionPayload {
  u: string;
  exp: number; // epoch ms
}

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(
  username: string,
  secret: string,
  days: number,
): { token: string; expires: Date } {
  const expires = new Date(Date.now() + days * 86_400_000);
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: expires.getTime() } satisfies SessionPayload),
  ).toString("base64url");
  return { token: `${payload}.${sign(payload, secret)}`, expires };
}

export function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
): SessionPayload | null {
  if (!token || !secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (typeof data.u !== "string" || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
