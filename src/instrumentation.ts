/**
 * Arranca el worker de jobs dentro del servidor Next.js (WORKER_MODE=inprocess, por defecto),
 * de modo que `npm run dev` / `npm start` es suficiente para procesar escaneos.
 * Con WORKER_MODE=external se usa `npm run worker` en otro proceso.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const mode = process.env.WORKER_MODE || "inprocess";
  if (mode !== "inprocess") return;
  const g = globalThis as unknown as { __bosWorker?: boolean };
  if (g.__bosWorker) return;
  g.__bosWorker = true;
  const { startWorker } = await import("./jobs/worker");
  const concurrency = Number(process.env.WORKER_CONCURRENCY || 3);
  startWorker({ concurrency, label: "web" });
}
