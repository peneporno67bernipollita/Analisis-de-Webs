import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { checkSameOrigin, requireSession } from "@/auth/guard";
import { ConfigurationError, NotFoundError } from "@/shared/errors";
import { checkRateLimit, clientKeyFromHeaders } from "@/shared/rate-limit";
import { createLogger } from "@/shared/logger";

const log = createLogger("api");

/** Respuesta de error sin filtrar detalles internos. */
export function apiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Datos no válidos",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  if (err instanceof ConfigurationError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  log.error("unhandled api error", { error: err });
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}

/** Guardas comunes: sesión, mismo origen (en mutaciones) y rate limit opcional. */
export async function guard(
  req: Request,
  opts: { mutate?: boolean; rate?: { key: string; limit: number; windowMs: number } } = {},
) {
  const session = await requireSession();
  if (session) return session;
  if (opts.mutate) {
    const origin = checkSameOrigin(req);
    if (origin) return origin;
  }
  if (opts.rate) {
    const r = checkRateLimit(
      `${opts.rate.key}:${clientKeyFromHeaders(req.headers)}`,
      opts.rate.limit,
      opts.rate.windowMs,
    );
    if (!r.ok)
      return NextResponse.json(
        { error: "Demasiadas peticiones, espera un momento" },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } },
      );
  }
  return null;
}
