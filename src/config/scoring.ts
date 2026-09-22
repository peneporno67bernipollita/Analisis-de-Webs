/**
 * Reglas de scoring CONFIGURABLES. Cambia estos valores para ajustar la priorización.
 * Principios:
 *  - El score es una ayuda para priorizar manualmente, no una verdad.
 *  - La valoración (rating) de Google NO suma ni resta: calidad del negocio ≠ oportunidad digital.
 *  - El nº de reseñas se usa solo como indicador de actividad/presencia local.
 */
export const SCORING_CONFIG = {
  website: {
    max: 40,
    noWebsite: 40,
    websiteDown: 40,
    /** Puntos por hallazgo según severidad cuando la web funciona con problemas */
    perSeverity: { CRITICAL: 15, HIGH: 7, MEDIUM: 3, LOW: 0.5, INFO: 0 },
    problemsCap: 35,
    acceptableCap: 8,
  },
  consistency: {
    max: 20,
    points: {
      PHONE_MISMATCH: 8,
      ADDRESS_MISMATCH: 6,
      HOURS_MISMATCH: 6,
      STATUS_CONFLICT: 6,
      STALE_COVID_NOTICE: 5,
      OLD_DATED_CONTENT: 4,
      GOOGLE_LISTING_MISSING_WEBSITE: 4,
      DEAD_EXTERNAL_DOMAINS: 3,
      SITEMAP_STALE: 2,
      PROVIDER_MISSING_PHONE: 2,
      WEBSITE_HOURS_CONTRADICTORY: 2,
      OLD_COPYRIGHT: 1,
    } as Record<string, number>,
  },
  reviews: { max: 10, strong: 4, weak: 2 },
  presence: {
    max: 15,
    /** [mínimo de reseñas, puntos] de mayor a menor */
    tiers: [
      [100, 15],
      [30, 10],
      [10, 6],
      [1, 3],
    ] as [number, number][],
  },
  contact: { max: 10, phone: 6, email: 2, formOrWhatsapp: 2 },
  need: { max: 5, booking: 5, menu: 5 },
  penalties: { temporarilyClosed: -15 },
  levels: {
    high: 60,
    medium: 40,
    /** Por debajo de esta confianza → "No suficiente evidencia" */
    minConfidence: 40,
    /**
     * Si "Sin web" se basa solo en un proveedor poco fiable para ese dato (p. ej. OSM, fiabilidad < 0.7)
     * y no se ha contrastado con buscador → "No suficiente evidencia".
     */
    requireVerifiedNoWebsite: true,
    reliableProviderThreshold: 0.7,
  },
} as const;

export type ScoringConfig = typeof SCORING_CONFIG;
