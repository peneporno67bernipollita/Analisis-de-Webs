import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv, isAuthConfigured } from "@/config/env";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Comprobación de sesión dentro de Route Handlers (defensa en profundidad además del proxy).
 * Devuelve una respuesta 401/503 si no hay acceso, o null si se puede continuar.
 */
export async function requireSession(): Promise<NextResponse | null> {
  const env = getEnv();
  if (!isAuthConfigured(env)) {
    if (env.NODE_ENV === "production")
      return NextResponse.json({ error: "Autenticación no configurada" }, { status: 503 });
    return null;
  }
  const store = await cookies();
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value, env.AUTH_SECRET);
  return session ? null : NextResponse.json({ error: "No autenticado" }, { status: 401 });
}

/** Rechaza peticiones mutantes de otro origen (protección CSRF adicional a SameSite=Lax). */
export function checkSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch {
    /* origin inválido */
  }
  return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
}
