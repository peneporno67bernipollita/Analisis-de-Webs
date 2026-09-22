import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Cliente Prisma 7 (driver adapter pg). Se reutiliza entre recargas en desarrollo.
 */
const globalForPrisma = globalThis as unknown as { __bosPrisma?: PrismaClient };

function create(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está configurada");
  const adapter = new PrismaPg({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
  return new PrismaClient({
    adapter,
    log: process.env.LOG_LEVEL === "debug" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__bosPrisma) globalForPrisma.__bosPrisma = create();
  return globalForPrisma.__bosPrisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = getPrisma() as unknown as Record<string | symbol, unknown>;
    const v = client[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(client) : v;
  },
});

export type { PrismaClient };
