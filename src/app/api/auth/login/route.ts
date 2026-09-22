import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/auth/password";
import { SESSION_COOKIE, createSessionToken } from "@/auth/session";
import { getEnv, isAuthConfigured } from "@/config/env";
import { checkRateLimit, clientKeyFromHeaders } from "@/shared/rate-limit";
import crypto from "node:crypto";

const Body = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
  next: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const env = getEnv();
  if (!isAuthConfigured(env))
    return NextResponse.json({ error: "Autenticación no configurada en el servidor" }, { status: 503 });
  // Límite por IP y global (el global protege aunque se falsee X-Forwarded-For)
  const ip = checkRateLimit(`login:${clientKeyFromHeaders(req.headers)}`, 10, 15 * 60_000);
  const global = checkRateLimit("login:global", 50, 15 * 60_000);
  if (!ip.ok || !global.ok)
    return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });

  const form = req.headers.get("content-type")?.includes("application/json")
    ? await req.json().catch(() => ({}))
    : Object.fromEntries(await req.formData());
  const parsed = Body.safeParse(form);
  if (!parsed.success) return NextResponse.json({ error: "Credenciales no válidas" }, { status: 400 });
  const { username, password } = parsed.data;
  const userOk = crypto.timingSafeEqual(
    crypto.createHash("sha256").update(username).digest(),
    crypto.createHash("sha256").update(env.AUTH_USERNAME!).digest(),
  );
  const passOk = verifyPassword(password, env.AUTH_PASSWORD_HASH!);
  if (!userOk || !passOk)
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });

  const { token, expires } = createSessionToken(username, env.AUTH_SECRET!, env.AUTH_SESSION_DAYS);
  const next =
    parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//")
      ? parsed.data.next
      : "/";
  const res = NextResponse.json({ ok: true, next });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return res;
}
