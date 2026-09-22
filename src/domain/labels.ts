import type { LeadStatus, OpportunityLevel, Severity, WebsiteStatus } from "./types";

export const WEBSITE_STATUS_LABEL: Record<WebsiteStatus, string> = {
  SIN_WEB: "Sin web",
  WEB_CAIDA: "Web caída",
  WEB_FUNCIONAL_CON_PROBLEMAS: "Web con problemas",
  WEB_ACEPTABLE: "Web aceptable",
  WEB_NO_VERIFICABLE: "No verificable",
};

export const WEBSITE_STATUS_DESCRIPTION: Record<WebsiteStatus, string> = {
  SIN_WEB:
    "No se ha encontrado una web oficial verificable (una ficha de terceros no cuenta como web propia).",
  WEB_CAIDA: "Existe una referencia a una web, pero no responde correctamente.",
  WEB_FUNCIONAL_CON_PROBLEMAS: "La web funciona pero presenta problemas detectables.",
  WEB_ACEPTABLE: "La web funciona y no presenta problemas críticos evidentes.",
  WEB_NO_VERIFICABLE:
    "No se ha podido determinar el estado de la web (bloqueo, error o análisis incompleto).",
};

export const OPPORTUNITY_LABEL: Record<OpportunityLevel, string> = {
  HIGH: "Alta oportunidad",
  MEDIUM: "Oportunidad media",
  LOW: "Oportunidad baja",
  INSUFFICIENT_EVIDENCE: "Evidencia insuficiente",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MEDIUM: "Medio",
  LOW: "Bajo",
  INFO: "Info",
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Nuevo",
  TO_CONTACT: "Por contactar",
  CONTACTED: "Contactado",
  INTERESTED: "Interesado",
  PROPOSAL_SENT: "Propuesta enviada",
  WON: "Cliente",
  LOST: "Perdido",
  DISCARDED: "Descartado",
};

export const PROVENANCE_LABEL = {
  OBSERVED: "Dato obtenido",
  INFERRED: "Inferencia",
  ANALYZED: "Dato analizado",
} as const;

export const CONFIDENCE_LABEL = {
  LOW: "Confianza baja",
  MEDIUM: "Confianza media",
  HIGH: "Confianza alta",
} as const;

export const SOURCE_LABEL: Record<string, string> = {
  google_places: "Google Places",
  osm: "OpenStreetMap",
  website: "Web del negocio",
  schema_org: "Datos estructurados de la web",
  search: "Buscador",
  reviews: "Reseñas",
  google_reviews: "Reseñas de Google",
  system: "Sistema",
};
