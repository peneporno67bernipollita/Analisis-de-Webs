import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7: la URL de conexión vive aquí (no en schema.prisma) y .env no se carga solo.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
