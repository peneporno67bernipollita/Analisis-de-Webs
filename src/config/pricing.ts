import { getEnv } from "./env";

/**
 * Estimación de coste por SKU (USD por 1000 llamadas). Valores orientativos y configurables
 * vía .env; no incluyen el crédito/uso gratuito mensual de Google. Verifica precios vigentes.
 */
export function pricePer1000(sku: string): number {
  const env = getEnv();
  switch (sku) {
    case "google_text_search_pro":
      return env.PRICE_GOOGLE_GEOCODE_PER_1000;
    case "google_text_search_enterprise":
      return env.PRICE_GOOGLE_TEXT_SEARCH_PER_1000;
    case "google_text_search_enterprise_atmosphere":
      return env.PRICE_GOOGLE_TEXT_SEARCH_WITH_REVIEWS_PER_1000;
    case "google_place_details_enterprise":
      return 20;
    case "google_place_details_enterprise_atmosphere":
      return 25;
    case "search_brave":
      return env.PRICE_SEARCH_PER_1000;
    default:
      return 0; // OSM y otros gratuitos
  }
}

export function estimateCostUsd(usage: Record<string, number> | null | undefined): number {
  if (!usage) return 0;
  const total = Object.entries(usage).reduce((s, [sku, n]) => s + (pricePer1000(sku) * n) / 1000, 0);
  return Math.round(total * 10000) / 10000;
}
