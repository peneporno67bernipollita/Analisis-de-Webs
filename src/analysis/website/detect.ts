import { crawlerUserAgent } from "@/config/env";
import type { SearchProvider, UsageRecorder } from "@/domain/ports";
import type { NormalizedPlace } from "@/domain/types";
import { decodeBody, isHtmlResponse, safeFetch } from "@/analysis/http/safe-fetch";
import { nameCoverage, normalizeText } from "@/shared/text";
import { extractPhonesFromText, normalizePhone } from "@/shared/phone";
import { classifyThirdParty, registrableDomain } from "@/shared/url";
import { parsePage } from "./html";

/**
 * Busca la web oficial de un negocio cuya ficha no enlaza ninguna (o solo un perfil de terceros).
 * Un candidato solo se acepta si se VERIFICA:
 *  - "phone": el teléfono de la ficha aparece en la web (verificación fuerte), o
 *  - "name_location": ≥60% de las palabras significativas del nombre + ciudad/código postal en la web.
 * Los candidatos no verificados se devuelven solo como información ("posible web no verificada").
 */

const IGNORE_DOMAINS = [
  "google.com",
  "wikipedia.org",
  "paginasamarillas.es",
  "tripadvisor.es",
  "tripadvisor.com",
  "yelp.es",
  "yelp.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "infoisinfo.es",
  "cylex.es",
  "einforma.com",
  "axesor.es",
  "empresite.eleconomista.es",
  "eleconomista.es",
  "infoempresa.com",
  "iberinform.es",
  "guiaempresa.universia.es",
  "11870.com",
  "qdq.com",
  "restaurantguru.com",
  "thefork.es",
  "eltenedor.es",
  "justeat.es",
  "just-eat.es",
  "glovoapp.com",
  "ubereats.com",
  "booking.com",
  "doctoralia.es",
  "topdoctors.es",
  "habitissimo.es",
  "milanuncios.com",
  "wallapop.com",
  "amazon.es",
  "abc.es",
  "elmundo.es",
  "elpais.com",
  "diariodesevilla.es",
];

export interface WebsiteSearchOutcome {
  url?: string;
  verification?: "phone" | "name_location";
  candidates: { url: string; reason: string }[];
  queried: boolean;
}

export async function findOfficialWebsite(
  place: NormalizedPlace,
  search: SearchProvider,
  usage: UsageRecorder,
  language: string,
): Promise<WebsiteSearchOutcome> {
  const query = `"${place.name}" ${place.city ?? ""}`.trim();
  const results = await search.search(query, { countryCode: place.countryCode, language, count: 8 }, usage);
  const candidates: { url: string; reason: string }[] = [];
  const seenDomains = new Set<string>();
  const providerPhone = normalizePhone(place.internationalPhone ?? place.nationalPhone, place.countryCode);

  for (const r of results) {
    let u: URL;
    try {
      u = new URL(r.url);
    } catch {
      continue;
    }
    const domain = registrableDomain(u.hostname);
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    if (IGNORE_DOMAINS.some((d) => domain === d || u.hostname.endsWith(`.${d}`))) continue;
    const tp = classifyThirdParty(u.hostname, u.pathname);
    if (tp && tp.kind !== "FREE_SUBDOMAIN_BUILDER") continue;
    if (candidates.length >= 3) break;

    const home = `${u.protocol}//${u.host}/`;
    try {
      const res = await safeFetch(home, {
        userAgent: crawlerUserAgent(),
        timeoutMs: 10_000,
        maxBytes: 1_000_000,
      });
      if (res.status >= 400 || !isHtmlResponse(res)) {
        candidates.push({ url: home, reason: `No verificable (HTTP ${res.status})` });
        continue;
      }
      const page = parsePage(decodeBody(res), res.url);
      const phones = [
        ...page.telLinks.map((t) => normalizePhone(t, place.countryCode)?.e164),
        ...extractPhonesFromText(page.text.slice(0, 40_000), place.countryCode).map((p) => p.e164),
      ];
      if (providerPhone && phones.includes(providerPhone.e164)) {
        return { url: res.url, verification: "phone", candidates, queried: true };
      }
      const hay = `${page.title ?? ""} ${page.h1.join(" ")} ${page.text.slice(0, 20_000)}`;
      const cover = nameCoverage(place.name, hay);
      const nhay = normalizeText(hay);
      const locationHit = Boolean(
        (place.city && nhay.includes(normalizeText(place.city))) ||
        (place.postalCode && hay.includes(place.postalCode)),
      );
      if (cover >= 0.6 && locationHit)
        return { url: res.url, verification: "name_location", candidates, queried: true };
      candidates.push({
        url: res.url,
        reason: `Coincidencia insuficiente (nombre ${Math.round(cover * 100)}%, ubicación ${locationHit ? "sí" : "no"})`,
      });
    } catch (err) {
      candidates.push({
        url: home,
        reason: `No verificable (${(err as { code?: string }).code ?? "error"})`,
      });
    }
  }
  return { candidates, queried: true };
}
