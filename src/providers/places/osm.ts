import { getEnv, crawlerUserAgent } from "@/config/env";
import { CATEGORIES } from "@/domain/categories";
import type {
  AreaQuery,
  DiscoveredPlace,
  DiscoveryRequest,
  DiscoveryResult,
  PlaceProvider,
  ResolvedArea,
  UsageRecorder,
} from "@/domain/ports";
import type { NormalizedPlace } from "@/domain/types";
import { createThrottle, retry } from "@/shared/async";
import { ProviderError, isRetryableStatus } from "@/shared/errors";
import { haversineMeters } from "@/shared/geo";
import { parseOsmOpeningHours } from "./osm-opening-hours";

/**
 * OpenStreetMap: Nominatim (geocodificación) + Overpass API (descubrimiento).
 * Gratuito y sin clave. Limitaciones importantes (se reflejan en la confianza de la evidencia):
 *  - No hay reseñas ni valoraciones.
 *  - El campo "website" está incompleto en muchos negocios: un negocio sin web en OSM puede tenerla.
 * Políticas de uso: https://operations.osmfoundation.org/policies/nominatim/ (máx. 1 req/s, User-Agent identificable)
 * Licencia de los datos: ODbL — requiere atribución "© OpenStreetMap contributors".
 */

const nominatimThrottle = createThrottle(1100);

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const TYPE_KEYS = ["amenity", "shop", "office", "craft", "leisure", "tourism", "healthcare"];

export function normalizeOsmElement(el: OverpassElement): NormalizedPlace | null {
  const t = el.tags ?? {};
  if (!t.name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const types = TYPE_KEYS.filter((k) => t[k]).map((k) => `${k}=${t[k]}`);
  const socials: NormalizedPlace["socials"] = {};
  if (t["contact:instagram"]) socials.instagram = t["contact:instagram"];
  if (t["contact:facebook"]) socials.facebook = t["contact:facebook"];
  if (t["contact:tiktok"]) socials.tiktok = t["contact:tiktok"];
  const phone = t.phone ?? t["contact:phone"] ?? t["contact:mobile"];
  const street = t["addr:street"]
    ? [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ")
    : undefined;
  const status =
    t.disused === "yes" || t["disused:shop"] || t["disused:amenity"] ? "CLOSED_PERMANENTLY" : undefined;
  return {
    provider: "osm",
    providerPlaceId: `${el.type}/${el.id}`,
    name: t.name,
    primaryType: types[0],
    primaryTypeLabel: types[0]?.split("=")[1]?.replace(/_/g, " "),
    types,
    formattedAddress: [street, t["addr:postcode"], t["addr:city"]].filter(Boolean).join(", ") || undefined,
    street,
    postalCode: t["addr:postcode"],
    city: t["addr:city"],
    region: t["addr:province"] ?? t["addr:state"],
    countryCode: t["addr:country"],
    location: lat !== undefined && lon !== undefined ? { lat, lng: lon } : undefined,
    nationalPhone: phone?.split(";")[0]?.trim(),
    websiteUri: (t.website ?? t["contact:website"] ?? t.url)?.split(";")[0]?.trim(),
    mapsUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    openingHours: parseOsmOpeningHours(t.opening_hours),
    businessStatus: status,
    email: (t.email ?? t["contact:email"])?.split(";")[0]?.trim(),
    socials: Object.keys(socials).length ? socials : undefined,
    attribution: "© OpenStreetMap contributors (ODbL)",
  };
}

export class OsmProvider implements PlaceProvider {
  readonly key = "osm" as const;
  readonly label = "OpenStreetMap (Overpass + Nominatim)";
  readonly attribution = "© OpenStreetMap contributors";
  readonly supportsReviews = false;
  readonly websiteFieldReliability = 0.45;

  isConfigured(): boolean {
    return true;
  }

  async resolveArea(q: AreaQuery, usage: UsageRecorder): Promise<ResolvedArea> {
    const env = getEnv();
    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      addressdetails: "1",
      city: q.city,
      country: q.country,
    });
    if (q.region) params.set("state", q.region);
    const url = `${env.OSM_NOMINATIM_URL.replace(/\/$/, "")}/search?${params}`;
    const run = async (u: string) =>
      nominatimThrottle(async () => {
        const res = await fetch(u, {
          headers: { "User-Agent": crawlerUserAgent(env), "Accept-Language": q.language },
          signal: AbortSignal.timeout(20_000),
        });
        usage.record("osm_nominatim");
        if (!res.ok)
          throw new ProviderError(
            this.key,
            `Nominatim ${res.status}`,
            res.status,
            isRetryableStatus(res.status),
          );
        return (await res.json()) as {
          lat: string;
          lon: string;
          display_name: string;
          address?: { country_code?: string };
        }[];
      });
    let data = await retry(() => run(url), { retries: 2 });
    if (!data.length && q.region) {
      // En algunos países la "provincia" no es el "state" de Nominatim: reintenta sin región
      params.delete("state");
      data = await retry(() => run(`${env.OSM_NOMINATIM_URL.replace(/\/$/, "")}/search?${params}`), {
        retries: 2,
      });
    }
    const hit = data[0];
    if (!hit)
      throw new ProviderError(this.key, `No se ha podido localizar la zona "${q.city}, ${q.country}"`);
    return {
      label: hit.display_name,
      center: { lat: Number(hit.lat), lng: Number(hit.lon) },
      countryCode: hit.address?.country_code?.toUpperCase(),
    };
  }

  async discover(req: DiscoveryRequest, usage: UsageRecorder): Promise<DiscoveryResult> {
    const env = getEnv();
    const warnings: string[] = [];
    if (req.freeTextCategories.length) {
      warnings.push(
        `OpenStreetMap no admite categorías de texto libre (${req.freeTextCategories.join(", ")}); se han ignorado. Usa categorías del catálogo o el proveedor Google.`,
      );
    }
    const cats = req.categories.length ? req.categories : CATEGORIES;
    const { center, radiusM } = req.area;
    const around = `(around:${Math.round(radiusM)},${center.lat.toFixed(6)},${center.lng.toFixed(6)})`;
    const selectors = cats.flatMap((c) => c.osm.map((f) => ({ f, key: c.key })));
    const body = selectors.map(({ f }) => `nwr${f}["name"]${around};`).join("\n");
    const limit = Math.min(2000, req.maxResults * 4);
    const query = `[out:json][timeout:90];\n(\n${body}\n);\nout center tags ${limit};`;

    const data = await retry(
      async () => {
        const res = await fetch(env.OSM_OVERPASS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": crawlerUserAgent(env),
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(120_000),
        });
        usage.record("osm_overpass");
        if (!res.ok) {
          throw new ProviderError(
            this.key,
            `Overpass ${res.status}`,
            res.status,
            isRetryableStatus(res.status) || res.status === 504,
          );
        }
        return (await res.json()) as { elements?: OverpassElement[]; remark?: string };
      },
      {
        retries: 3,
        baseDelayMs: 3000,
        shouldRetry: (e) => (e instanceof ProviderError ? e.retryable : true),
      },
    );
    if (data.remark) warnings.push(`Overpass: ${data.remark}`);

    const matchCategory = (tags: Record<string, string>): string | undefined => {
      for (const { f, key } of selectors) {
        const m = /\["([^"]+)"(=|~)"([^"]+)"\]/.exec(f);
        if (!m) continue;
        const v = tags[m[1]];
        if (!v) continue;
        if (m[2] === "=" ? v === m[3] : new RegExp(m[3]).test(v)) return key;
      }
      return undefined;
    };

    const places = new Map<string, DiscoveredPlace & { d: number }>();
    for (const el of data.elements ?? []) {
      const place = normalizeOsmElement(el);
      if (!place || !place.location) continue;
      if (places.has(place.providerPlaceId)) continue;
      const d = haversineMeters(center, place.location);
      if (d > radiusM) continue;
      places.set(place.providerPlaceId, {
        place,
        matchedQuery: "overpass",
        categoryKey: matchCategory(el.tags ?? {}),
        d,
      });
    }
    const sorted = [...places.values()].sort((a, b) => a.d - b.d).slice(0, req.maxResults);
    return { places: sorted.map(({ d: _d, ...rest }) => rest), warnings };
  }
}
