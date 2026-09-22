import { z } from "zod";

/**
 * Configuración de entorno validada con zod.
 * Se evalúa de forma perezosa (getEnv) para no romper `next build`, que importa módulos
 * sin tener por qué disponer de todas las variables.
 */

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase()),
    );

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().min(min).max(max));

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseFloat(v)))
    .pipe(z.number().min(0));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),

  AUTH_USERNAME: optionalString,
  AUTH_PASSWORD_HASH: optionalString,
  AUTH_SECRET: optionalString,
  AUTH_SESSION_DAYS: int(30, 1, 365),

  GOOGLE_MAPS_API_KEY: optionalString,
  GOOGLE_PLACES_FETCH_REVIEWS: bool(true),
  GOOGLE_MAX_REQUESTS_PER_SCAN: int(60, 1, 1000),
  DEFAULT_PLACE_PROVIDER: optionalString.pipe(z.enum(["google", "osm"]).optional()),
  OSM_OVERPASS_URL: z.string().url().default("https://overpass-api.de/api/interpreter"),
  OSM_NOMINATIM_URL: z.string().url().default("https://nominatim.openstreetmap.org"),

  SEARCH_PROVIDER: optionalString.pipe(z.enum(["none", "brave"]).optional()),
  SEARCH_API_KEY: optionalString,

  CRAWLER_CONTACT: optionalString,
  CRAWLER_TIMEOUT_MS: int(15_000, 1_000, 120_000),
  CRAWLER_MAX_BYTES: int(3_000_000, 50_000, 20_000_000),
  CRAWLER_MAX_PAGES: int(6, 1, 30),
  CRAWLER_MAX_LINK_CHECKS: int(25, 0, 200),
  RESPECT_ROBOTS_TXT: bool(true),
  ENABLE_BROWSER_RENDERING: bool(false),

  WORKER_MODE: optionalString.pipe(z.enum(["inprocess", "external", "off"]).optional()),
  WORKER_CONCURRENCY: int(3, 1, 20),

  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: optionalString,

  PROVIDER_DATA_TTL_DAYS: int(30, 1, 3650),

  PRICE_GOOGLE_TEXT_SEARCH_PER_1000: num(35),
  PRICE_GOOGLE_TEXT_SEARCH_WITH_REVIEWS_PER_1000: num(40),
  PRICE_GOOGLE_GEOCODE_PER_1000: num(32),
  PRICE_SEARCH_PER_1000: num(5),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración de entorno inválida: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Solo para tests. */
export function resetEnvCache() {
  cached = null;
}

export function isAuthConfigured(env = getEnv()): boolean {
  return Boolean(
    env.AUTH_USERNAME && env.AUTH_PASSWORD_HASH && env.AUTH_SECRET && env.AUTH_SECRET.length >= 32,
  );
}

export function defaultPlaceProvider(env = getEnv()): "google" | "osm" {
  if (env.DEFAULT_PLACE_PROVIDER) return env.DEFAULT_PLACE_PROVIDER;
  return env.GOOGLE_MAPS_API_KEY ? "google" : "osm";
}

export function crawlerUserAgent(env = getEnv()): string {
  const contact = env.CRAWLER_CONTACT ? `; +${env.CRAWLER_CONTACT}` : "";
  return `BusinessOpportunityScanner/0.1 (website audit bot${contact})`;
}
