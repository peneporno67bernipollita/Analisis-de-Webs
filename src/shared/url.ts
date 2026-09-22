/** Utilidades de URL y clasificación de dominios de terceros. */

/** Añade esquema si falta y valida sintaxis. No realiza ninguna petición de red. */
export function normalizeWebsiteUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

/** Sufijos públicos de dos niveles más comunes en los mercados objetivo. */
const MULTI_LEVEL_SUFFIXES = new Set([
  "com.es",
  "org.es",
  "nom.es",
  "gob.es",
  "edu.es",
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "com.mx",
  "org.mx",
  "gob.mx",
  "com.ar",
  "org.ar",
  "com.co",
  "com.pe",
  "com.br",
  "com.cl",
  "com.uy",
  "com.ve",
  "com.ec",
  "com.au",
  "net.au",
  "co.nz",
  "co.za",
  "com.pt",
]);

/** Dominio registrable aproximado (eTLD+1) sin dependencias externas. */
export function registrableDomain(hostname: string): string {
  const host = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_LEVEL_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

export function sameSite(a: string, b: string): boolean {
  return registrableDomain(a) === registrableDomain(b);
}

export type ThirdPartyKind =
  | "SOCIAL"
  | "DIRECTORY"
  | "DELIVERY"
  | "BOOKING_PLATFORM"
  | "LINK_AGGREGATOR"
  | "MESSAGING"
  | "MAPS"
  | "DISCONTINUED_BUILDER"
  | "FREE_SUBDOMAIN_BUILDER";

interface PlatformRule {
  kind: ThirdPartyKind;
  label: string;
  /** dominios registrables o sufijos de host */
  domains: string[];
}

const PLATFORM_RULES: PlatformRule[] = [
  { kind: "SOCIAL", label: "Facebook", domains: ["facebook.com", "fb.com", "fb.me"] },
  { kind: "SOCIAL", label: "Instagram", domains: ["instagram.com", "instagr.am"] },
  { kind: "SOCIAL", label: "TikTok", domains: ["tiktok.com"] },
  { kind: "SOCIAL", label: "X/Twitter", domains: ["twitter.com", "x.com"] },
  { kind: "SOCIAL", label: "LinkedIn", domains: ["linkedin.com"] },
  { kind: "SOCIAL", label: "YouTube", domains: ["youtube.com", "youtu.be"] },
  { kind: "SOCIAL", label: "Pinterest", domains: ["pinterest.com", "pinterest.es"] },
  { kind: "MESSAGING", label: "WhatsApp", domains: ["wa.me", "whatsapp.com", "wa.link"] },
  { kind: "MESSAGING", label: "Telegram", domains: ["t.me", "telegram.me"] },
  {
    kind: "LINK_AGGREGATOR",
    label: "Linktree",
    domains: ["linktr.ee", "linktree.com", "beacons.ai", "lnk.bio", "bio.link", "taplink.cc", "campsite.bio"],
  },
  {
    kind: "MAPS",
    label: "Google Maps",
    domains: ["maps.google.com", "goo.gl", "maps.app.goo.gl", "g.page", "google.com"],
  },
  {
    kind: "DIRECTORY",
    label: "TripAdvisor",
    domains: ["tripadvisor.com", "tripadvisor.es", "tripadvisor.co.uk", "tripadvisor.com.mx"],
  },
  { kind: "DIRECTORY", label: "Yelp", domains: ["yelp.com", "yelp.es"] },
  { kind: "DIRECTORY", label: "Páginas Amarillas", domains: ["paginasamarillas.es"] },
  { kind: "DIRECTORY", label: "Restaurant Guru", domains: ["restaurantguru.com", "restaurantguru.es"] },
  {
    kind: "DIRECTORY",
    label: "Doctoralia",
    domains: ["doctoralia.es", "doctoralia.com", "doctoralia.com.mx"],
  },
  { kind: "DIRECTORY", label: "Cylex", domains: ["cylex.es", "cylex-espana.es"] },
  { kind: "DIRECTORY", label: "Foursquare", domains: ["foursquare.com"] },
  { kind: "DIRECTORY", label: "Habitissimo", domains: ["habitissimo.es"] },
  { kind: "DIRECTORY", label: "QDQ", domains: ["qdq.com"] },
  { kind: "DIRECTORY", label: "Infoisinfo", domains: ["infoisinfo.es"] },
  { kind: "DELIVERY", label: "Just Eat", domains: ["just-eat.es", "just-eat.com", "just-eat.co.uk"] },
  { kind: "DELIVERY", label: "Glovo", domains: ["glovoapp.com"] },
  { kind: "DELIVERY", label: "Uber Eats", domains: ["ubereats.com"] },
  { kind: "DELIVERY", label: "Deliveroo", domains: ["deliveroo.es", "deliveroo.co.uk", "deliveroo.com"] },
  {
    kind: "BOOKING_PLATFORM",
    label: "TheFork",
    domains: ["thefork.es", "thefork.com", "eltenedor.es", "lafourchette.com"],
  },
  { kind: "BOOKING_PLATFORM", label: "Booking.com", domains: ["booking.com"] },
  { kind: "BOOKING_PLATFORM", label: "Airbnb", domains: ["airbnb.es", "airbnb.com"] },
  {
    kind: "BOOKING_PLATFORM",
    label: "Treatwell",
    domains: ["treatwell.es", "treatwell.com", "treatwell.co.uk"],
  },
  { kind: "BOOKING_PLATFORM", label: "Booksy", domains: ["booksy.com"] },
  { kind: "BOOKING_PLATFORM", label: "Fresha", domains: ["fresha.com"] },
  { kind: "BOOKING_PLATFORM", label: "CoverManager", domains: ["covermanager.com"] },
  { kind: "BOOKING_PLATFORM", label: "OpenTable", domains: ["opentable.com", "opentable.es"] },
  { kind: "BOOKING_PLATFORM", label: "Calendly", domains: ["calendly.com"] },
  // Google Business Profile websites (*.business.site) fueron discontinuadas por Google en 2024.
  {
    kind: "DISCONTINUED_BUILDER",
    label: "Google Business Site (discontinuado)",
    domains: ["business.site", "negocio.site"],
  },
  {
    kind: "FREE_SUBDOMAIN_BUILDER",
    label: "Subdominio gratuito",
    domains: [
      "wixsite.com",
      "wordpress.com",
      "blogspot.com",
      "blogspot.es",
      "webnode.es",
      "webnode.com",
      "webnode.page",
      "jimdosite.com",
      "jimdofree.com",
      "sites.google.com",
      "carrd.co",
      "godaddysites.com",
      "square.site",
      "ueniweb.com",
      "weebly.com",
      "site123.me",
      "strikingly.com",
      "mystrikingly.com",
      "wix.com",
      "webflow.io",
      "framer.website",
      "github.io",
      "netlify.app",
      "vercel.app",
      "odoo.com",
      "hostingersite.com",
      "myshopify.com",
    ],
  },
];

export interface ThirdPartyMatch {
  kind: ThirdPartyKind;
  label: string;
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Clasifica un host como plataforma de terceros. Devuelve null si parece un dominio propio. */
export function classifyThirdParty(hostname: string, pathname = "/"): ThirdPartyMatch | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  for (const rule of PLATFORM_RULES) {
    for (const d of rule.domains) {
      if (d === "sites.google.com" && host === "sites.google.com")
        return { kind: rule.kind, label: rule.label };
      if (d === "google.com") {
        if ((host === "google.com" || host.endsWith(".google.com")) && /^\/maps/.test(pathname)) {
          return { kind: "MAPS", label: rule.label };
        }
        continue;
      }
      if (hostMatches(host, d)) return { kind: rule.kind, label: rule.label };
    }
  }
  return null;
}

/** true si la plataforma NO cuenta como web propia del negocio. */
export function isNotOwnWebsite(kind: ThirdPartyKind): boolean {
  return kind !== "FREE_SUBDOMAIN_BUILDER" && kind !== "DISCONTINUED_BUILDER";
}

/** Normaliza perfiles sociales a una URL canónica (sin parámetros de tracking). */
export function canonicalSocialUrl(u: URL): string {
  const clean = new URL(u.toString());
  clean.search = "";
  clean.hash = "";
  clean.hostname = clean.hostname.replace(/^(m|mobile|web|es-es|es-la)\./, "www.");
  return clean.toString().replace(/\/$/, "");
}
