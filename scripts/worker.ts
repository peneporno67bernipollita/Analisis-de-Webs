/** Worker independiente: `npm run worker` (usa WORKER_MODE=external en el servidor web). */
import "dotenv/config";
import { getEnv } from "@/config/env";
import { startWorker } from "@/jobs/worker";
import { prisma } from "@/db/client";

const env = getEnv();
const worker = startWorker({ concurrency: env.WORKER_CONCURRENCY, label: "cli-worker" });

async function shutdown() {
  console.log("Deteniendo worker…");
  await worker.stop();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
