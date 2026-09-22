/**
 * Puertos (interfaces) de la aplicación. Las implementaciones concretas viven en
 * src/providers (fuentes externas) y src/analysis (motor de análisis). Sustituir un
 * proveedor = escribir otra implementación de la interfaz y registrarla.
 */
import type { BusinessCategory } from "./categories";
import type {
  ContactPoint,
  Finding,
  NormalizedPlace,
  OpportunityLevel,
  PlaceProviderKey,
  ReviewInput,
  ReviewSignal,
  ScoreBreakdown,
  WebsiteStatus,
} from "./types";
import type { LatLng } from "@/shared/geo";

// ---------------------------------------------------------------- uso / coste

/** Registra llamadas facturables por SKU para estimar el coste del escaneo. */
export interface UsageRecorder {
  record(sku: string, count?: number): void;
  snapshot(): Record<string, number>;
}

export function createUsageRecorder(initial?: Record<string, number>): UsageRecorder {
  const counts: Record<string, number> = { ...(initial ?? {}) };
  return {
    record(sku, count = 1) {
      counts[sku] = (counts[sku] ?? 0) + count;
    },
    snapshot: () => ({ ...counts }),
  };
}

// ---------------------------------------------------------------- PlaceProvider

export interface AreaQuery {
  city: string;
  region?: string;
  country: string;
  language: string;
}

export interface ResolvedArea {
  label: string;
  center: LatLng;
  countryCode?: string;
}

/** Área de búsqueda. v1: círculo. Preparado para polígonos (GeoJSON) en el futuro. */
export type SearchArea =
  | { type: "CIRCLE"; center: LatLng; radiusM: number }
  | { type: "POLYGON"; geojson: unknown; center: LatLng; radiusM: number };

export interface DiscoveryRequest {
  area: SearchArea;
  categories: BusinessCategory[];
  /** Categorías de texto libre introducidas por el usuario (no presentes en el catálogo). */
  freeTextCategories: string[];
  maxResults: number;
  language: "es" | "en";
  regionCode?: string;
}

export interface DiscoveredPlace {
  place: NormalizedPlace;
  matchedQuery: string;
  categoryKey?: string;
}

export interface DiscoveryResult {
  places: DiscoveredPlace[];
  warnings: string[];
}

export interface PlaceProvider {
  readonly key: PlaceProviderKey;
  readonly label: string;
  readonly attribution: string;
  readonly supportsReviews: boolean;
  /** Fiabilidad del campo "web" del proveedor (0..1). Afecta a la confianza de SIN_WEB. */
  readonly websiteFieldReliability: number;
  isConfigured(): boolean;
  resolveArea(query: AreaQuery, usage: UsageRecorder): Promise<ResolvedArea>;
  discover(request: DiscoveryRequest, usage: UsageRecorder): Promise<DiscoveryResult>;
  /** Re-obtiene los datos de un negocio por su identificador estable (refresco). */
  getDetails?(
    providerPlaceId: string,
    language: string,
    usage: UsageRecorder,
  ): Promise<NormalizedPlace | null>;
}

// ---------------------------------------------------------------- SearchProvider

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
}

export interface SearchProvider {
  readonly key: string;
  isConfigured(): boolean;
  search(
    query: string,
    opts: { countryCode?: string; language?: string; count?: number },
    usage: UsageRecorder,
  ): Promise<SearchResult[]>;
}

// ---------------------------------------------------------------- WebsiteAnalyzer

export interface WebsiteExtraction {
  phones: { e164: string; national: string; clickable: boolean; url: string }[];
  emails: { value: string; url: string; viaMailto: boolean }[];
  socials: { type: ContactPoint["type"]; url: string; foundOn: string }[];
  whatsapp: { url: string; foundOn: string }[];
  contactPages: string[];
  contactForms: { url: string; fields: number }[];
  bookingLinks: { url: string; label: string }[];
  menuLinks: { url: string; isPdf: boolean }[];
  hasMapEmbed: boolean;
  addressTexts: string[];
  postalCodes: string[];
  hoursTexts: string[];
  schemaOrg: {
    types: string[];
    telephone?: string[];
    email?: string[];
    postalCode?: string[];
    streetAddress?: string[];
    openingHours?: { day: number; open: string; close: string }[];
    sameAs?: string[];
  };
  copyrightYears: number[];
  datedMentions: { year: number; text: string; url: string }[];
  staleNotices: { text: string; url: string; kind: string }[];
  latestSitemapLastmod?: string;
  textSample?: string;
}

export interface WebsiteAuditResult {
  status: WebsiteStatus;
  statusReason: string;
  requestedUrl: string;
  finalUrl?: string;
  httpStatus?: number;
  isHttps?: boolean;
  redirectChain?: { url: string; status: number }[];
  tls?: Record<string, unknown>;
  responseTimeMs?: number;
  htmlBytes?: number;
  pages: { url: string; status?: number; ok: boolean; kind: string; error?: string }[];
  resourceStats?: Record<string, unknown>;
  linkChecks?: Record<string, unknown>;
  tech?: Record<string, unknown>;
  robots?: Record<string, unknown>;
  findings: Finding[];
  extraction?: WebsiteExtraction;
  /** Aspectos que no se han podido verificar (se muestran como "No verificado"). */
  unverified: string[];
  /** Puntuación técnica 0-100 (null si no hay web analizable). */
  technicalScore: number | null;
  renderedWithBrowser: boolean;
  analysisComplete: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface WebsiteAnalyzerContext {
  businessName: string;
  city?: string;
  countryCode?: string;
  categoryKey?: string;
  language: string;
}

export interface WebsiteAnalyzer {
  analyze(url: string, ctx: WebsiteAnalyzerContext): Promise<WebsiteAuditResult>;
}

// ---------------------------------------------------------------- ContactDiscoveryProvider

export interface ContactDiscoveryProvider {
  discover(place: NormalizedPlace, audit: WebsiteAuditResult | null): ContactPoint[];
}

// ---------------------------------------------------------------- ReviewAnalyzer

export interface ReviewAnalyzer {
  analyze(
    reviews: ReviewInput[],
    language: string,
  ): { signals: ReviewSignal[]; findings: Finding[]; reviewsAnalyzed: number };
}

// ---------------------------------------------------------------- ScoringEngine

export interface ScoringInput {
  place: NormalizedPlace;
  categoryKey?: string;
  websiteStatus: WebsiteStatus;
  websiteSource: "provider" | "search" | "none";
  audit: WebsiteAuditResult | null;
  findings: Finding[];
  contacts: ContactPoint[];
  reviewsAnalyzed: number;
  searchChecked: boolean;
  providerWebsiteReliability: number;
  /** Puntuación de consistencia/frescura (null si no hay nada comparable). */
  consistencyScore: number | null;
}

export interface ScoringEngine {
  score(input: ScoringInput): ScoreBreakdown;
}

export type { OpportunityLevel };
