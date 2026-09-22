import { getEnv } from "@/config/env";
import type {
  AreaQuery,
  DiscoveredPlace,
  DiscoveryRequest,
  DiscoveryResult,
  PlaceProvider,
  ResolvedArea,
  UsageRecorder,
} from "@/domain/ports";
import type { NormalizedPlace, OpeningHours, OpeningPeriod, ReviewInput } from "@/domain/types";
import { retry } from "@/shared/async";
import { ProviderError, isRetryableStatus } from "@/shared/errors";
import { haversineMeters, tileCircle } from "@/shared/geo";
import { createLogger } from "@/shared/logger";

/**
 * Google Places API (New) — https://developers.google.com/maps/documentation/places/web-service/op-overview
 * - Descubrimiento: Text Search (POST places:searchText) con locationRestriction rectangular
 *   y filtrado posterior por distancia al centro (círculo exacto).
 * - Se pide solo el FieldMask necesario (el coste depende de los campos).
 * - Reseñas (máx. 5) opcionalmente en la misma llamada (SKU Enterprise + Atmosphere).
 * - Place ID = identificador estable del negocio.
 */

const BASE = "https://places.googleapis.com/v1";
const log = createLogger("google-places");

const DISCOVERY_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.regularOpeningHours",
];

interface GoogleAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface GooglePoint {
  day?: number;
  hour?: number;
  minute?: number;
}

export interface GooglePlace {
  id: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  businessStatus?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    periods?: { open?: GooglePoint; close?: GooglePoint }[];
    weekdayDescriptions?: string[];
  };
  reviews?: {
    rating?: number;
    text?: { text?: string; languageCode?: string };
    originalText?: { text?: string; languageCode?: string };
    publishTime?: string;
    googleMapsUri?: string;
  }[];
}

const pad = (n: number | undefined) => String(n ?? 0).padStart(2, "0");

export function normalizeGoogleHours(h: GooglePlace["regularOpeningHours"]): OpeningHours | undefined {
  if (!h) return undefined;
  const periods: OpeningPeriod[] = [];
  let alwaysOpen = false;
  for (const p of h.periods ?? []) {
    if (!p.open) continue;
    if (!p.close && p.open.day === 0 && (p.open.hour ?? 0) === 0 && (p.open.minute ?? 0) === 0) {
      alwaysOpen = true;
      continue;
    }
    periods.push({
      day: p.open.day ?? 0,
      open: `${pad(p.open.hour)}:${pad(p.open.minute)}`,
      close: p.close ? `${pad(p.close.hour)}:${pad(p.close.minute)}` : "24:00",
    });
  }
  return { periods, weekdayDescriptions: h.weekdayDescriptions, alwaysOpen: alwaysOpen || undefined };
}

export function normalizeGooglePlace(p: GooglePlace): NormalizedPlace {
  const comp = (type: string) => p.addressComponents?.find((c) => c.types?.includes(type));
  const route = comp("route")?.longText;
  const number = comp("street_number")?.longText;
  const reviews: ReviewInput[] = (p.reviews ?? [])
    .map((r) => ({
      text: r.originalText?.text ?? r.text?.text ?? "",
      rating: r.rating,
      publishTime: r.publishTime,
      language: r.originalText?.languageCode ?? r.text?.languageCode,
      url: r.googleMapsUri,
    }))
    .filter((r) => r.text.trim().length > 0);

  return {
    provider: "google_places",
    providerPlaceId: p.id,
    name: p.displayName?.text ?? "(sin nombre)",
    primaryType: p.primaryType,
    primaryTypeLabel: p.primaryTypeDisplayName?.text,
    types: p.types ?? [],
    formattedAddress: p.formattedAddress,
    street: route ? [route, number].filter(Boolean).join(", ") : undefined,
    postalCode: comp("postal_code")?.longText,
    city:
      comp("locality")?.longText ??
      comp("postal_town")?.longText ??
      comp("administrative_area_level_3")?.longText,
    region: comp("administrative_area_level_2")?.longText ?? comp("administrative_area_level_1")?.longText,
    country: comp("country")?.longText,
    countryCode: comp("country")?.shortText,
    location:
      p.location?.latitude !== undefined && p.location?.longitude !== undefined
        ? { lat: p.location.latitude, lng: p.location.longitude }
        : undefined,
    nationalPhone: p.nationalPhoneNumber,
    internationalPhone: p.internationalPhoneNumber,
    websiteUri: p.websiteUri,
    mapsUrl: p.googleMapsUri,
    rating: p.rating,
    userRatingCount: p.userRatingCount,
    openingHours: normalizeGoogleHours(p.regularOpeningHours),
    businessStatus: p.businessStatus,
    reviews: reviews.length ? reviews : undefined,
    attribution: "Google Maps",
  };
}

function boundsFor(center: { lat: number; lng: number }, radiusM: number) {
  const dLat = (radiusM / 6_371_000) * (180 / Math.PI);
  const dLng = dLat / Math.cos((center.lat * Math.PI) / 180);
  return {
    low: { latitude: center.lat - dLat, longitude: center.lng - dLng },
    high: { latitude: center.lat + dLat, longitude: center.lng + dLng },
  };
}

export class GooglePlacesProvider implements PlaceProvider {
  readonly key = "google_places" as const;
  readonly label = "Google Places API (New)";
  readonly attribution = "Datos de Google Maps";
  readonly supportsReviews = true;
  readonly websiteFieldReliability = 0.85;

  constructor(private readonly apiKey = getEnv().GOOGLE_MAPS_API_KEY) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async post<T>(path: string, body: unknown, fieldMask: string): Promise<T> {
    if (!this.apiKey) throw new ProviderError(this.key, "GOOGLE_MAPS_API_KEY no configurada");
    return retry(
      async () => {
        const res = await fetch(`${BASE}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey!,
            "X-Goog-FieldMask": fieldMask,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let message = text.slice(0, 300);
          try {
            message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
          } catch {
            /* cuerpo no JSON */
          }
          if (res.status === 403 || res.status === 401) {
            message = `Acceso denegado por Google (${res.status}). Revisa que la clave sea válida, que "Places API (New)" esté habilitada y la facturación activa. ${message}`;
          }
          throw new ProviderError(this.key, message, res.status, isRetryableStatus(res.status));
        }
        return (await res.json()) as T;
      },
      {
        retries: 3,
        baseDelayMs: 1000,
        shouldRetry: (err) => (err instanceof ProviderError ? err.retryable : true),
      },
    );
  }

  async resolveArea(q: AreaQuery, usage: UsageRecorder): Promise<ResolvedArea> {
    const textQuery = [q.city, q.region, q.country].filter(Boolean).join(", ");
    const data = await this.post<{ places?: GooglePlace[] }>(
      "/places:searchText",
      { textQuery, languageCode: q.language, pageSize: 1 },
      "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents",
    );
    usage.record("google_text_search_pro");
    const p = data.places?.[0];
    if (!p?.location?.latitude || p.location.longitude === undefined) {
      throw new ProviderError(this.key, `No se ha podido localizar la zona "${textQuery}"`);
    }
    const country = p.addressComponents?.find((c) => c.types?.includes("country"));
    return {
      label: p.formattedAddress ?? p.displayName?.text ?? textQuery,
      center: { lat: p.location.latitude, lng: p.location.longitude },
      countryCode: country?.shortText,
    };
  }

  async discover(req: DiscoveryRequest, usage: UsageRecorder): Promise<DiscoveryResult> {
    const env = getEnv();
    const warnings: string[] = [];
    const withReviews = env.GOOGLE_PLACES_FETCH_REVIEWS;
    const fieldMask = [...DISCOVERY_FIELDS, ...(withReviews ? ["places.reviews"] : []), "nextPageToken"].join(
      ",",
    );
    const budget = env.GOOGLE_MAX_REQUESTS_PER_SCAN;
    const { center, radiusM } = req.area;

    // Consultas: categorías del catálogo + texto libre
    const queries: { text: string; categoryKey?: string }[] = [
      ...req.categories.map((c) => ({ text: c.googleQuery[req.language], categoryKey: c.key })),
      ...req.freeTextCategories.map((t) => ({ text: t })),
    ];
    // Para radios grandes, dividir en teselas (Text Search devuelve como máximo 60 resultados por consulta)
    const tiles = tileCircle(center, radiusM, Math.min(radiusM, 5_000));
    type Cursor = {
      query: (typeof queries)[number];
      tileIdx: number;
      pageToken?: string;
      exhausted: boolean;
    };
    const cursors: Cursor[] = queries.map((query) => ({ query, tileIdx: 0, exhausted: false }));

    const found = new Map<string, DiscoveredPlace>();
    let requests = 0;
    const target = req.maxResults;

    while (found.size < target && cursors.some((c) => !c.exhausted)) {
      for (const cursor of cursors) {
        if (cursor.exhausted || found.size >= target) continue;
        if (requests >= budget) {
          warnings.push(
            `Se alcanzó el límite de ${budget} llamadas a Google por escaneo (GOOGLE_MAX_REQUESTS_PER_SCAN). Puede haber más negocios en la zona.`,
          );
          cursors.forEach((c) => (c.exhausted = true));
          break;
        }
        const tile = tiles[cursor.tileIdx];
        const body: Record<string, unknown> = {
          textQuery: cursor.query.text,
          languageCode: req.language,
          pageSize: 20,
          locationRestriction: { rectangle: boundsFor(tile.center, tile.radiusM) },
        };
        if (req.regionCode) body.regionCode = req.regionCode.toLowerCase();
        if (cursor.pageToken) body.pageToken = cursor.pageToken;

        let data: { places?: GooglePlace[]; nextPageToken?: string };
        try {
          data = await this.post("/places:searchText", body, fieldMask);
        } catch (err) {
          if (err instanceof ProviderError && !err.retryable) throw err;
          warnings.push(`Consulta "${cursor.query.text}" fallida tras reintentos: ${(err as Error).message}`);
          cursor.exhausted = true;
          continue;
        } finally {
          requests++;
          usage.record(
            withReviews ? "google_text_search_enterprise_atmosphere" : "google_text_search_enterprise",
          );
        }

        for (const gp of data.places ?? []) {
          if (found.has(gp.id)) continue; // dedupe por Place ID
          const place = normalizeGooglePlace(gp);
          if (place.location && haversineMeters(center, place.location) > radiusM) continue;
          found.set(gp.id, { place, matchedQuery: cursor.query.text, categoryKey: cursor.query.categoryKey });
          if (found.size >= target) break;
        }

        if (data.nextPageToken) {
          cursor.pageToken = data.nextPageToken;
        } else {
          cursor.pageToken = undefined;
          cursor.tileIdx++;
          if (cursor.tileIdx >= tiles.length) cursor.exhausted = true;
        }
      }
    }

    log.info("discovery finished", { found: found.size, requests, tiles: tiles.length });
    return { places: [...found.values()], warnings };
  }

  async getDetails(placeId: string, language: string, usage: UsageRecorder): Promise<NormalizedPlace | null> {
    if (!this.apiKey) throw new ProviderError(this.key, "GOOGLE_MAPS_API_KEY no configurada");
    const env = getEnv();
    const fields = DISCOVERY_FIELDS.map((f) => f.replace(/^places\./, ""));
    if (env.GOOGLE_PLACES_FETCH_REVIEWS) fields.push("reviews");
    const res = await retry(
      async () => {
        const r = await fetch(
          `${BASE}/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(language)}`,
          {
            headers: { "X-Goog-Api-Key": this.apiKey!, "X-Goog-FieldMask": fields.join(",") },
            signal: AbortSignal.timeout(20_000),
          },
        );
        if (r.status === 404) return null;
        if (!r.ok)
          throw new ProviderError(
            this.key,
            `Place Details ${r.status}`,
            r.status,
            isRetryableStatus(r.status),
          );
        return (await r.json()) as GooglePlace;
      },
      { retries: 2, shouldRetry: (e) => (e instanceof ProviderError ? e.retryable : true) },
    );
    usage.record(
      env.GOOGLE_PLACES_FETCH_REVIEWS
        ? "google_place_details_enterprise_atmosphere"
        : "google_place_details_enterprise",
    );
    return res ? normalizeGooglePlace(res) : null;
  }
}
