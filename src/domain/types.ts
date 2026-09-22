/**
 * Tipos de dominio. Sin dependencias de infraestructura (ni Prisma, ni HTTP).
 * Los enums replican los del esquema Prisma para que el dominio sea independiente del ORM.
 */

export type WebsiteStatus =
  "SIN_WEB" | "WEB_CAIDA" | "WEB_FUNCIONAL_CON_PROBLEMAS" | "WEB_ACEPTABLE" | "WEB_NO_VERIFICABLE";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
/** OBSERVED: dato obtenido tal cual de una fuente. INFERRED: deducción. ANALYZED: resultado de una comprobación técnica. */
export type Provenance = "OBSERVED" | "INFERRED" | "ANALYZED";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type OpportunityLevel = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_EVIDENCE";
export type LeadStatus =
  "NEW" | "TO_CONTACT" | "CONTACTED" | "INTERESTED" | "PROPOSAL_SENT" | "WON" | "LOST" | "DISCARDED";

export type FindingCategory =
  | "AVAILABILITY"
  | "SECURITY"
  | "PERFORMANCE"
  | "SEO"
  | "MOBILE"
  | "ACCESSIBILITY"
  | "CONTENT"
  | "CONTACT"
  | "UX"
  | "FRESHNESS"
  | "CONSISTENCY"
  | "REVIEWS"
  | "PRESENCE";

export type EvidenceSource = "google_places" | "osm" | "website" | "search" | "reviews" | "system";

export interface EvidenceItem {
  label: string;
  value?: string;
  source: EvidenceSource;
  url?: string;
}

export interface Finding {
  code: string;
  category: FindingCategory;
  severity: Severity;
  provenance: Provenance;
  confidence: Confidence;
  title: string;
  description: string;
  evidence: EvidenceItem[];
}

export const TECHNICAL_CATEGORIES: FindingCategory[] = [
  "AVAILABILITY",
  "SECURITY",
  "PERFORMANCE",
  "SEO",
  "MOBILE",
  "ACCESSIBILITY",
  "UX",
];
export const CONTENT_CATEGORIES: FindingCategory[] = ["CONTENT", "CONTACT"];
export const CONSISTENCY_CATEGORIES: FindingCategory[] = ["FRESHNESS", "CONSISTENCY", "REVIEWS"];

export interface OpeningPeriod {
  /** 0 = domingo … 6 = sábado */
  day: number;
  open: string; // HH:MM
  close: string; // HH:MM (puede ser < open si cruza medianoche)
}

export interface OpeningHours {
  periods: OpeningPeriod[];
  weekdayDescriptions?: string[];
  /** Texto original (p. ej. opening_hours de OSM) cuando no se ha podido normalizar */
  raw?: string;
  alwaysOpen?: boolean;
}

export interface ReviewInput {
  text: string;
  rating?: number;
  publishTime?: string;
  language?: string;
  /** URL de la reseña en el proveedor, si existe (atribución) */
  url?: string;
}

export type PlaceProviderKey = "google_places" | "osm";

/** Negocio normalizado tal como lo devuelve un PlaceProvider. */
export interface NormalizedPlace {
  provider: PlaceProviderKey;
  providerPlaceId: string;
  name: string;
  primaryType?: string;
  primaryTypeLabel?: string;
  types: string[];
  formattedAddress?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  location?: { lat: number; lng: number };
  nationalPhone?: string;
  internationalPhone?: string;
  websiteUri?: string;
  mapsUrl?: string;
  rating?: number;
  userRatingCount?: number;
  openingHours?: OpeningHours;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | string;
  email?: string;
  socials?: Partial<Record<"instagram" | "facebook" | "tiktok" | "twitter" | "linkedin" | "youtube", string>>;
  /** Reseñas: datos transitorios, no se persisten en bruto. */
  reviews?: ReviewInput[];
  attribution: string;
}

export type ContactType =
  | "PHONE"
  | "EMAIL"
  | "CONTACT_FORM"
  | "WHATSAPP"
  | "CONTACT_PAGE"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "TIKTOK"
  | "LINKEDIN"
  | "X"
  | "YOUTUBE"
  | "BOOKING_PAGE"
  | "OTHER";

export interface ContactPoint {
  type: ContactType;
  value: string;
  label?: string;
  source: "google_places" | "osm" | "website" | "schema_org" | "search";
  sourceUrl?: string;
  provenance: Provenance;
  confidence: Confidence;
}

export interface ScoreContribution {
  points: number;
  reason: string;
  component: "website" | "consistency" | "presence" | "contact" | "need" | "penalty";
  /** Códigos de hallazgo que justifican la contribución */
  findingCodes?: string[];
  inferred?: boolean;
}

export interface ScoreBreakdown {
  opportunityScore: number;
  level: OpportunityLevel;
  levelReason: string;
  components: {
    websiteOpportunity: number;
    technicalWebsite: number | null;
    informationConsistency: number | null;
    digitalContactability: number;
    evidenceConfidence: number;
  };
  contributions: ScoreContribution[];
  evidenceConfidenceReasons: string[];
  notes: string[];
}

export interface RecommendationItem {
  code: string;
  title: string;
  description: string;
  productType: string;
  priority: number;
  triggeredBy: string[];
}

export interface ReviewSignal {
  category: string;
  label: string;
  evidence: string;
  source: "google_reviews";
  confidence: Confidence;
  publishTime?: string;
  rating?: number;
}
