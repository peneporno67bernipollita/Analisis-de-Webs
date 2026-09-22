import type {
  ContactDiscoveryProvider,
  ReviewAnalyzer,
  ScoringEngine,
  SearchProvider,
  UsageRecorder,
  WebsiteAnalyzer,
  WebsiteAuditResult,
} from "@/domain/ports";
import type {
  ContactPoint,
  Finding,
  NormalizedPlace,
  RecommendationItem,
  ReviewSignal,
  ScoreBreakdown,
  WebsiteStatus,
} from "@/domain/types";
import { WEBSITE_STATUS_LABEL } from "@/domain/labels";
import { finding, dedupeFindings } from "./findings";
import { analyzeConsistency, type FieldComparison } from "./freshness/consistency";
import { buildRecommendations } from "./recommendations/engine";
import { findOfficialWebsite } from "./website/detect";
import { errorMessage } from "@/shared/errors";

/**
 * Pipeline de análisis de UN negocio (sin acceso a base de datos):
 * detección de web → auditoría → consistencia/frescura → reseñas → contactos → scoring → recomendaciones.
 * Cualquier fallo parcial se registra en `errors` y el análisis continúa.
 */

/** Servicios públicos habituales (no suelen ser clientes de un desarrollador web local). */
export const PUBLIC_ENTITY_RE =
  /^(centro de salud|consultorio( local| auxiliar)?|hospital (universitario|general|provincial|comarcal)|ambulatorio|centro de atenci[oó]n primaria|cap |ayuntamiento|excmo\.? ayuntamiento|junta de|diputaci[oó]n|delegaci[oó]n (del gobierno|provincial)|ceip|cp |ies |colegio p[uú]blico|instituto de educaci[oó]n secundaria|biblioteca (municipal|p[uú]blica)|polideportivo municipal|comisar[ií]a|guardia civil|polic[ií]a (local|nacional)|juzgado|registro civil|oficina de correos|correos$)/i;

export interface PipelineDeps {
  websiteAnalyzer: WebsiteAnalyzer;
  contactDiscovery: ContactDiscoveryProvider;
  reviewAnalyzer: ReviewAnalyzer;
  scoring: ScoringEngine;
  searchProvider: SearchProvider | null;
  providerWebsiteReliability: number;
  providerSupportsReviews: boolean;
  usage: UsageRecorder;
}

export interface BusinessAnalysisResult {
  status: "COMPLETED" | "PARTIAL";
  websiteStatus: WebsiteStatus;
  websiteStatusReason: string;
  websiteUrl?: string;
  websiteSource: "provider" | "search" | "none";
  audit: WebsiteAuditResult | null;
  findings: Finding[];
  comparisons: FieldComparison[];
  consistencyScore: number | null;
  contacts: ContactPoint[];
  reviewSignals: ReviewSignal[];
  reviewsAnalyzed: number;
  score: ScoreBreakdown;
  recommendations: RecommendationItem[];
  unverified: string[];
  summary: string;
  errors: string[];
}

export async function analyzeBusiness(
  place: NormalizedPlace,
  ctx: { categoryKey?: string; language: string },
  deps: PipelineDeps,
): Promise<BusinessAnalysisResult> {
  const errors: string[] = [];
  const unverified: string[] = [];
  const extraFindings: Finding[] = [];
  const pname = place.provider === "google_places" ? "Google" : "OpenStreetMap";
  const analyzerCtx = {
    businessName: place.name,
    city: place.city,
    countryCode: place.countryCode,
    categoryKey: ctx.categoryKey,
    language: ctx.language,
  };

  // 1) Detección + auditoría de la web
  let audit: WebsiteAuditResult | null = null;
  let websiteSource: BusinessAnalysisResult["websiteSource"] = "none";
  if (place.websiteUri) {
    try {
      audit = await deps.websiteAnalyzer.analyze(place.websiteUri, analyzerCtx);
      websiteSource = "provider";
    } catch (err) {
      errors.push(`Auditoría web: ${errorMessage(err)}`);
    }
  }

  let searchChecked = false;
  if ((!audit || audit.status === "SIN_WEB") && deps.searchProvider) {
    try {
      const found = await findOfficialWebsite(place, deps.searchProvider, deps.usage, ctx.language);
      searchChecked = found.queried;
      if (found.url) {
        const previous = audit;
        audit = await deps.websiteAnalyzer.analyze(found.url, analyzerCtx);
        websiteSource = "search";
        if (previous)
          extraFindings.push(...previous.findings.map((f) => ({ ...f, severity: "INFO" as const })));
        extraFindings.push(
          finding(
            "GOOGLE_LISTING_MISSING_WEBSITE",
            "CONSISTENCY",
            "MEDIUM",
            `La ficha de ${pname} no enlaza la web del negocio`,
            `La web se ha encontrado mediante buscador y se ha verificado por ${found.verification === "phone" ? "coincidencia de teléfono" : "coincidencia de nombre y ubicación"}.`,
            [{ label: "Web encontrada", value: found.url, source: "search", url: found.url }],
            { confidence: found.verification === "phone" ? "HIGH" : "MEDIUM" },
          ),
        );
      } else if (found.candidates.length) {
        unverified.push(
          `Posibles webs encontradas en buscador pero NO verificadas: ${found.candidates.map((c) => `${c.url} (${c.reason})`).join("; ")}`,
        );
      }
    } catch (err) {
      errors.push(`Búsqueda de web oficial: ${errorMessage(err)}`);
    }
  } else if (!audit || audit.status === "SIN_WEB") {
    unverified.push(
      "No se ha comprobado en buscadores si existe una web no enlazada en la ficha (SEARCH_PROVIDER no configurado).",
    );
  }

  let websiteStatus: WebsiteStatus;
  let websiteStatusReason: string;
  if (audit) {
    websiteStatus = audit.status;
    websiteStatusReason = audit.statusReason;
  } else if (place.websiteUri) {
    websiteStatus = "WEB_NO_VERIFICABLE";
    websiteStatusReason = "Error interno al analizar la web";
  } else {
    websiteStatus = "SIN_WEB";
    websiteStatusReason = `La ficha de ${pname} no publica web${searchChecked ? " y no se ha encontrado una web verificable en buscador" : ""}`;
    extraFindings.push(
      finding(
        "NO_WEBSITE",
        "PRESENCE",
        "HIGH",
        "No se ha encontrado web oficial verificable",
        websiteStatusReason,
        [
          { label: `Web en la ficha de ${pname}`, value: "No publicada", source: place.provider },
          {
            label: "Búsqueda en buscador",
            value: searchChecked ? "Sin resultados verificables" : "No realizada (no configurado)",
            source: "system",
          },
        ],
        {
          provenance: "ANALYZED",
          confidence: searchChecked ? "HIGH" : deps.providerWebsiteReliability >= 0.7 ? "MEDIUM" : "LOW",
        },
      ),
    );
  }
  if (audit) unverified.push(...audit.unverified);

  // 2) Consistencia y frescura
  let consistency: ReturnType<typeof analyzeConsistency> = {
    findings: [],
    comparisons: [],
    score: null,
    unverified: [],
  };
  try {
    consistency = analyzeConsistency(place, audit?.extraction);
    unverified.push(...consistency.unverified);
  } catch (err) {
    errors.push(`Consistencia: ${errorMessage(err)}`);
  }

  // 3) Reseñas
  let reviewSignals: ReviewSignal[] = [];
  let reviewFindings: Finding[] = [];
  let reviewsAnalyzed = 0;
  if (place.reviews?.length) {
    try {
      const r = deps.reviewAnalyzer.analyze(place.reviews, ctx.language);
      reviewSignals = r.signals;
      reviewFindings = r.findings;
      reviewsAnalyzed = r.reviewsAnalyzed;
    } catch (err) {
      errors.push(`Reseñas: ${errorMessage(err)}`);
    }
  } else {
    unverified.push(
      deps.providerSupportsReviews
        ? "Reseñas: no disponibles para este negocio o no solicitadas (GOOGLE_PLACES_FETCH_REVIEWS)."
        : "Reseñas: el proveedor utilizado no ofrece reseñas.",
    );
  }

  // 4) Estado del negocio / tipo de entidad
  if (PUBLIC_ENTITY_RE.test(place.name.trim())) {
    extraFindings.push(
      finding(
        "PROBABLE_PUBLIC_ENTITY",
        "PRESENCE",
        "INFO",
        "Posible entidad pública",
        "Por su nombre parece un servicio público (centro de salud, ayuntamiento, colegio público…), que no suele contratar servicios web de esta forma. (Inferido por el nombre.)",
        [{ label: "Nombre", value: place.name, source: place.provider }],
        { provenance: "INFERRED", confidence: "MEDIUM" },
      ),
    );
  }
  if (place.businessStatus === "CLOSED_PERMANENTLY") {
    extraFindings.push(
      finding(
        "BUSINESS_CLOSED_PERMANENTLY",
        "PRESENCE",
        "INFO",
        "Negocio cerrado permanentemente según el proveedor",
        "No es una oportunidad comercial.",
        [{ label: "Estado", value: place.businessStatus, source: place.provider }],
        { provenance: "OBSERVED" },
      ),
    );
  } else if (place.businessStatus === "CLOSED_TEMPORARILY") {
    extraFindings.push(
      finding(
        "BUSINESS_CLOSED_TEMPORARILY",
        "PRESENCE",
        "INFO",
        "Negocio cerrado temporalmente según el proveedor",
        "Conviene esperar a su reapertura.",
        [{ label: "Estado", value: place.businessStatus, source: place.provider }],
        { provenance: "OBSERVED" },
      ),
    );
  }

  const findings = dedupeFindings([
    ...(audit?.findings ?? []),
    ...extraFindings,
    ...consistency.findings,
    ...reviewFindings,
  ]);

  // 5) Contactos
  const contacts = deps.contactDiscovery.discover(place, audit);
  if (!contacts.some((c) => c.type === "EMAIL"))
    unverified.push(
      "Email empresarial: no encontrado en fuentes públicas (no se generan emails por patrón).",
    );
  if (!contacts.some((c) => c.type === "PHONE")) unverified.push("Teléfono: no encontrado.");

  // 6) Scoring + recomendaciones
  const score = deps.scoring.score({
    place,
    categoryKey: ctx.categoryKey,
    websiteStatus,
    websiteSource,
    audit,
    findings,
    contacts,
    reviewsAnalyzed,
    searchChecked,
    providerWebsiteReliability: deps.providerWebsiteReliability,
    consistencyScore: consistency.score,
  });
  const recommendations = buildRecommendations(websiteStatus, findings, ctx.categoryKey);

  // 7) Resumen legible
  const parts = [`${WEBSITE_STATUS_LABEL[websiteStatus]}: ${websiteStatusReason}.`];
  const serious = findings.filter(
    (f) =>
      ["CRITICAL", "HIGH"].includes(f.severity) &&
      f.code !== "NO_WEBSITE" &&
      f.code !== "WEBSITE_IS_THIRD_PARTY",
  );
  if (serious.length)
    parts.push(
      `Problemas importantes: ${serious
        .slice(0, 3)
        .map((f) => f.title.toLowerCase())
        .join("; ")}.`,
    );
  const cons = findings.filter((f) => f.category === "CONSISTENCY" || f.category === "FRESHNESS");
  if (cons.length)
    parts.push(`Señales de información posiblemente desactualizada o inconsistente: ${cons.length}.`);
  if (place.userRatingCount) parts.push(`${place.userRatingCount} reseñas en ${pname}.`);

  return {
    status: errors.length || (audit && !audit.analysisComplete) ? "PARTIAL" : "COMPLETED",
    websiteStatus,
    websiteStatusReason,
    websiteUrl: audit?.finalUrl ?? audit?.requestedUrl ?? place.websiteUri,
    websiteSource,
    audit,
    findings,
    comparisons: consistency.comparisons,
    consistencyScore: consistency.score,
    contacts,
    reviewSignals,
    reviewsAnalyzed,
    score,
    recommendations,
    unverified: [...new Set(unverified)],
    summary: parts.join(" "),
    errors,
  };
}
