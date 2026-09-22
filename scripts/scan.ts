/**
 * Lanza un escaneo desde la terminal y (por defecto) lo procesa en este mismo proceso.
 *
 *   npm run scan -- Sevilla Sevilla España
 *   npm run scan -- Sevilla Sevilla España --radius 3 --categories restaurantes,peluquerias_estetica --max 40
 *   npm run scan -- Madrid Madrid España --provider osm --no-wait
 *
 * Categorías del catálogo: restaurantes, bares_cafeterias, peluquerias_estetica, gimnasios, clinicas,
 * talleres, tiendas, abogados_asesorias, alojamientos, inmobiliarias, veterinarios, autoescuelas
 * (también se admite texto libre con el proveedor Google).
 */
import "dotenv/config";
import { getEnv } from "@/config/env";
import { prisma } from "@/db/client";
import { startWorker } from "@/jobs/worker";
import { createScan } from "@/server/scans";
import { sleep } from "@/shared/async";

const args = process.argv.slice(2);
const positional = args.filter(
  (a, i) =>
    !a.startsWith("--") &&
    !(i > 0 && args[i - 1].startsWith("--") && !["--no-wait", "--all"].includes(args[i - 1])),
);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const [city, region, country] = positional;
if (!city || !country) {
  console.error(
    "Uso: npm run scan -- <ciudad> <provincia> <país> [--radius 5] [--categories a,b] [--max 60] [--provider google|osm] [--lang es] [--no-wait]",
  );
  process.exit(1);
}
const categories = (flag("categories") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const scan = await createScan({
  city,
  region: country ? region : "",
  country: country ?? region,
  radiusKm: Number(flag("radius") ?? 5),
  categories,
  allCategories: args.includes("--all") || categories.length === 0,
  maxResults: Number(flag("max") ?? 30),
  language: flag("lang") ?? "es",
  provider: flag("provider") as "google" | "osm" | undefined,
});
console.log(
  `Escaneo creado: ${scan.id} (${scan.providerKey}) — ${scan.city}, ${scan.country}, ${scan.radiusKm} km`,
);

if (args.includes("--no-wait")) {
  console.log("Encolado. Lo procesará el worker (servidor con WORKER_MODE=inprocess o `npm run worker`).");
  await prisma.$disconnect();
  process.exit(0);
}

const worker = startWorker({ concurrency: getEnv().WORKER_CONCURRENCY, label: "cli-scan" });
let last = "";
while (true) {
  const s = await prisma.scan.findUnique({ where: { id: scan.id } });
  if (!s) break;
  const line = `${s.status} · ${s.totalAnalyzed + s.totalFailed}/${s.totalFound} analizados (${s.totalFailed} con error)`;
  if (line !== last) console.log(line);
  last = line;
  if (["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"].includes(s.status)) {
    if (s.errorMessage) console.log(`Error: ${s.errorMessage}`);
    for (const w of (s.warnings as string[] | null) ?? []) console.log(`Aviso: ${w}`);
    console.log(
      `Coste estimado: $${(s.estimatedCostUsd ?? 0).toFixed(3)} · uso: ${JSON.stringify(s.apiUsage ?? {})}`,
    );
    const top = await prisma.business.findMany({
      where: { scans: { some: { scanId: scan.id } } },
      orderBy: [{ opportunityScore: { sort: "desc", nulls: "last" } }],
      take: 10,
    });
    console.log("\nTop oportunidades:");
    for (const b of top)
      console.log(
        `  ${String(b.opportunityScore ?? "-").padStart(3)}  ${b.opportunityLevel ?? "-"}  ${b.websiteStatus ?? "-"}  ${b.name}  (${b.opportunityReason ?? ""})`,
      );
    break;
  }
  await sleep(2000);
}
await worker.stop();
await prisma.$disconnect();
process.exit(0);
