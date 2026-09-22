/**
 * Uso:
 *   npm run audit -- <businessId>          Re-analiza un negocio guardado (encola y procesa ahora)
 *   npm run audit -- --url https://web.es  Audita una URL suelta (sin guardar), útil para desarrollo
 *   npm run audit -- --url https://web.es --category restaurantes --json
 */
import "dotenv/config";
import { HttpWebsiteAnalyzer } from "@/analysis/website/analyzer";
import { SEVERITY_LABEL, WEBSITE_STATUS_LABEL } from "@/domain/labels";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function auditUrl(url: string) {
  const analyzer = new HttpWebsiteAnalyzer();
  const started = Date.now();
  const res = await analyzer.analyze(url, {
    businessName: flag("name") ?? "",
    city: flag("city"),
    countryCode: flag("country") ?? "ES",
    categoryKey: flag("category"),
    language: "es",
  });
  if (args.includes("--json")) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  console.log(`\n${url}  →  ${WEBSITE_STATUS_LABEL[res.status]} (${res.statusReason})`);
  console.log(
    `Final: ${res.finalUrl ?? "-"} | HTTP ${res.httpStatus ?? "-"} | ${res.responseTimeMs ?? "-"} ms | score técnico ${res.technicalScore ?? "N/A"} | ${Date.now() - started} ms`,
  );
  console.log(`Páginas: ${res.pages.map((p) => `${p.kind}:${p.status ?? p.error}`).join(", ")}`);
  for (const f of res.findings) {
    console.log(
      `  [${SEVERITY_LABEL[f.severity]}] ${f.code} — ${f.title}${f.provenance === "INFERRED" ? " (inferencia)" : ""}`,
    );
    for (const e of f.evidence.slice(0, 2))
      console.log(`       · ${e.label}: ${e.value ?? ""} ${e.url ?? ""}`);
  }
  const x = res.extraction;
  if (x) {
    console.log(
      `Teléfonos: ${x.phones.map((p) => `${p.national}${p.clickable ? " (clicable)" : ""}`).join(", ") || "no encontrado"}`,
    );
    console.log(`Emails: ${x.emails.map((e) => e.value).join(", ") || "no encontrado"}`);
    console.log(`Redes: ${x.socials.map((s) => s.url).join(", ") || "no encontrado"}`);
    console.log(
      `WhatsApp: ${x.whatsapp.map((w) => w.url).join(", ") || "no encontrado"} | Formularios: ${x.contactForms.length} | Reservas: ${x.bookingLinks.length} | Carta: ${x.menuLinks.length}`,
    );
    console.log(
      `Horarios (texto): ${x.hoursTexts[0] ?? "-"} | schema.org: ${x.schemaOrg.types.join(", ") || "-"} | sitemap lastmod: ${x.latestSitemapLastmod ?? "-"}`,
    );
  }
  if (res.unverified.length) console.log(`No verificado:\n  - ${res.unverified.join("\n  - ")}`);
}

async function auditBusiness(id: string) {
  const { reanalyzeBusinessNow } = await import("@/jobs/handlers/analyze-business");
  const out = await reanalyzeBusinessNow(id);
  console.log(
    `Negocio ${id} re-analizado: ${WEBSITE_STATUS_LABEL[out.websiteStatus]} · Opportunity ${out.score.opportunityScore} (${out.score.level})`,
  );
  const { prisma } = await import("@/db/client");
  await prisma.$disconnect();
}

const url = flag("url");
if (url) await auditUrl(url);
else if (args[0] && !args[0].startsWith("--")) await auditBusiness(args[0]);
else {
  console.error("Uso: npm run audit -- <businessId>  |  npm run audit -- --url https://ejemplo.es");
  process.exit(1);
}
