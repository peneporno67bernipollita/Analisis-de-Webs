/**
 * Logger mínimo con redacción de secretos.
 * Nunca debe escribir claves de API, tokens, contraseñas ni cabeceras de autorización.
 */

const SECRET_KEY_PATTERN =
  /(api[-_]?key|token|secret|password|passwd|authorization|cookie|x-goog-api-key|x-subscription-token|p256dh|auth)$/i;

export function redactString(input: string): string {
  return input
    .replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/g, "$1[REDACTED]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (typeof value === "string") return redactString(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      code: (value as { code?: unknown }).code,
    };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, scope: string, message: string, meta?: Record<string, unknown>) {
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  const line = {
    t: new Date().toISOString(),
    level,
    scope,
    msg: redactString(message),
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => log("debug", scope, msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => log("info", scope, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => log("warn", scope, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => log("error", scope, msg, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
