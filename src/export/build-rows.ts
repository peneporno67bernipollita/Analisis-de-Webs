import { prisma } from "@/db/client";
import { categoryLabel } from "@/domain/categories";
import { LEAD_STATUS_LABEL, OPPORTUNITY_LABEL, WEBSITE_STATUS_LABEL } from "@/domain/labels";
import { buildOrderBy, buildWhere, type BusinessFilters } from "@/server/business-query";
import { normalizePhone } from "@/shared/phone";
import type { ExportRow } from "./types";

const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** Construye las filas exportables aplicando los mismos filtros que la tabla. */
export async function buildExportRows(filters: BusinessFilters, limit = 5000): Promise<ExportRow[]> {
  const businesses = await prisma.business.findMany({
    where: buildWhere(filters),
    orderBy: buildOrderBy(filters),
    take: limit,
  });
  const analysisIds = businesses.map((b) => b.latestAnalysisId).filter((x): x is string => Boolean(x));
  const evidence = analysisIds.length
    ? await prisma.evidence.findMany({
        where: { analysisId: { in: analysisIds }, severity: { in: ["CRITICAL", "HIGH", "MEDIUM"] } },
        select: { analysisId: true, title: true, severity: true },
        orderBy: { severity: "asc" },
      })
    : [];
  const byAnalysis = new Map<string, string[]>();
  for (const e of evidence) byAnalysis.set(e.analysisId, [...(byAnalysis.get(e.analysisId) ?? []), e.title]);
  const phones = await prisma.contact.findMany({
    where: { businessId: { in: businesses.map((b) => b.id) }, type: "PHONE" },
    select: { businessId: true, value: true, label: true },
  });
  const phoneBy = new Map<string, string>();
  for (const p of phones) if (!phoneBy.has(p.businessId)) phoneBy.set(p.businessId, p.label ?? p.value);

  return businesses.map((b) => {
    const phoneRaw = b.nationalPhone ?? phoneBy.get(b.id) ?? "";
    const phone = normalizePhone(phoneRaw, b.countryCode ?? undefined)?.national ?? phoneRaw;
    return {
      nombre: b.name,
      categoria: b.categoryKey ? categoryLabel(b.categoryKey) : (b.primaryCategoryLabel ?? ""),
      ciudad: b.city ?? "",
      direccion: b.formattedAddress ?? "",
      web: b.websiteUrl ?? b.providerWebsite ?? "",
      estado_web: b.websiteStatus ? WEBSITE_STATUS_LABEL[b.websiteStatus] : "Sin analizar",
      opportunity_score: b.opportunityScore ?? "",
      nivel_oportunidad: b.opportunityLevel ? OPPORTUNITY_LABEL[b.opportunityLevel] : "",
      website_score: b.websiteScore ?? "",
      problemas: (b.latestAnalysisId ? (byAnalysis.get(b.latestAnalysisId) ?? []) : [])
        .slice(0, 6)
        .join(" | "),
      telefono: phone,
      email: b.primaryEmail ?? "",
      whatsapp: b.whatsappUrl ?? "",
      instagram: b.instagramUrl ?? "",
      facebook: b.facebookUrl ?? "",
      maps: b.mapsUrl ?? "",
      // "(40) motivo" en lugar de "+40 motivo": evita que Excel lo interprete como fórmula
      motivo_oportunidad: (b.opportunityReason ?? "").replace(/(^|;\s*)\+(\d+)\s/g, "$1($2) "),
      estado_comercial: LEAD_STATUS_LABEL[b.leadStatus],
      proximo_seguimiento: fmtDate(b.nextFollowUpAt),
      fecha_analisis: fmtDate(b.lastAnalyzedAt),
    };
  });
}
