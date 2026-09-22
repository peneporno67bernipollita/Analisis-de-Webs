/**
 *   npm run export                         → exports/negocios-<fecha>.csv (todos)
 *   npm run export -- --format json --level HIGH --scanId <id> --websiteStatus SIN_WEB
 * Acepta los mismos filtros que la tabla (ver src/server/business-query.ts).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/db/client";
import { buildExportRows } from "@/export/build-rows";
import { EXPORTERS } from "@/export/exporters";
import { parseFilters } from "@/server/business-query";

const args = process.argv.slice(2);
const params = new URLSearchParams();
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    params.set(args[i].slice(2), args[i + 1] ?? "");
    i++;
  }
}
const format = params.get("format") ?? "csv";
params.delete("format");
const exporter = EXPORTERS[format];
if (!exporter || !exporter.implemented) {
  console.error(
    `Formato no disponible: ${format}. Disponibles: ${Object.values(EXPORTERS)
      .filter((e) => e.implemented)
      .map((e) => e.format)
      .join(", ")}`,
  );
  process.exit(1);
}
const rows = await buildExportRows(parseFilters(params));
const dir = path.resolve("exports");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(
  dir,
  `negocios-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${exporter.extension}`,
);
fs.writeFileSync(file, exporter.export(rows));
console.log(`${rows.length} negocios exportados → ${file}`);
await prisma.$disconnect();
