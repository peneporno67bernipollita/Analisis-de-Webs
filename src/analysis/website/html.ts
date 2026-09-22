import * as cheerio from "cheerio";
import { parseOsmOpeningHours } from "@/providers/places/osm-opening-hours";
import { countWords, snippetAround } from "@/shared/text";
import { extractPhonesFromText, normalizePhone } from "@/shared/phone";
import { classifyThirdParty } from "@/shared/url";

/**
 * Extracción estructurada de una página HTML. Todo lo que devuelve es OBSERVADO en el HTML;
 * las conclusiones (hallazgos) se construyen en checks.ts.
 */

export interface LinkInfo {
  href: string;
  text: string;
  internal: boolean;
}

export interface PageData {
  url: string;
  title?: string;
  metaDescription?: string;
  viewport?: string;
  lang?: string;
  generator?: string;
  robotsMeta?: string;
  h1: string[];
  headingCounts: { h1: number; h2: number; h3: number };
  text: string;
  wordCount: number;
  links: LinkInfo[];
  images: { src: string; alt: string | null }[];
  scripts: string[];
  inlineScriptCount: number;
  stylesheets: string[];
  forms: { fields: number; hasEmail: boolean; hasTextarea: boolean; unlabeled: number }[];
  iframes: string[];
  telLinks: string[];
  mailtoLinks: string[];
  cfEmails: string[];
  faviconHref?: string;
  jsonLd: unknown[];
  hasNav: boolean;
  deprecatedTags: string[];
  usesFlash: boolean;
  tableLayout: boolean;
  fixedWidthViewport: boolean;
  a11y: {
    imagesWithoutAlt: number;
    linksWithoutText: number;
    buttonsWithoutName: number;
    inputsWithoutLabel: number;
  };
  mixedContent: string[];
  appShell: boolean;
  noscriptMentionsJs: boolean;
  ctaTexts: string[];
  bookingSignals: { url: string; label: string }[];
  menuLinks: { url: string; isPdf: boolean }[];
  contactPageLinks: string[];
  hasMapEmbed: boolean;
}

const BOOKING_HOSTS = [
  "thefork",
  "eltenedor",
  "covermanager",
  "opentable",
  "booksy",
  "treatwell",
  "fresha",
  "calendly",
  "simplybook",
  "bookitit",
  "reservio",
  "doctoralia",
  "setmore",
  "acuityscheduling",
  "timify",
  "zappyrent",
  "restoo",
  "tock",
  "resengo",
  "booking.com",
  "bookeo",
  "square.site/book",
  "koibox",
  "gestiona",
  "mindbodyonline",
  "glofox",
  "trainingym",
];

const CTA_RE =
  /\b(reserv(ar|a|as|e)|haz tu reserva|pide|pedir|pedido|llam(a|ar|anos)|cont[aá]cta(nos|r)?|contactar|presupuesto|cita|compra(r)?|comprar|whatsapp|inscr[ií]bete|ap[uú]ntate|book|call|contact us|order|buy|get a quote|sign up|appointment)\b/i;
const BOOKING_TEXT_RE =
  /\b(reserv(ar|a|as)(\s+(online|mesa|ahora|ya))?|haz tu reserva|book( a table| now| online)|(pide|pedir|solicita|solicitar|reserva|reservar|coge|coger|concierta|concertar)\s+(tu\s+|una\s+|su\s+)?cita|cita (previa|online)|reservation|appointment)\b/i;
const BOOKING_PATH_RE =
  /\/(cita|citas|pedir-cita|cita-previa|cita-[a-z-]+|reserva|reservas|reservar|booking|book|appointment)(\/|$|\.)/i;
const MENU_RE = /\b(carta|nuestra carta|men[uú]( del d[ií]a| degustaci[oó]n)?|food menu|drinks menu)\b/i;
const CONTACT_RE =
  /(contact|contacto|contacta|cont[aá]ctanos|donde-estamos|d[oó]nde estamos|localizaci[oó]n|ubicaci[oó]n|como-llegar|c[oó]mo llegar)/i;

function abs(href: string | undefined, base: string): string | null {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith("#") || /^javascript:/i.test(h) || /^data:/i.test(h)) return null;
  try {
    return new URL(h, base).toString();
  } catch {
    return null;
  }
}

/** Decodifica emails ofuscados por Cloudflare (data-cfemail). */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4) return null;
  const key = Number.parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2)
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out.includes("@") ? out : null;
}

export function parsePage(html: string, pageUrl: string): PageData {
  const $ = cheerio.load(html);
  const base = abs($("base[href]").attr("href"), pageUrl) ?? pageUrl;
  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  const isHttpsPage = pageUrl.startsWith("https:");

  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      /* JSON-LD inválido: se ignora */
    }
  });

  const scripts = $("script[src]")
    .map((_, el) => abs($(el).attr("src"), base))
    .get()
    .filter((s): s is string => Boolean(s));
  const inlineScriptCount = $("script:not([src])").length;
  const stylesheets = $('link[rel~="stylesheet"][href]')
    .map((_, el) => abs($(el).attr("href"), base))
    .get()
    .filter((s): s is string => Boolean(s));
  const iframes = $("iframe[src]")
    .map((_, el) => abs($(el).attr("src"), base))
    .get()
    .filter((s): s is string => Boolean(s));

  const links: LinkInfo[] = [];
  const telLinks: string[] = [];
  const mailtoLinks: string[] = [];
  let linksWithoutText = 0;
  $("a[href]").each((_, el) => {
    const rawHref = ($(el).attr("href") ?? "").trim();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const label =
      text || $(el).attr("aria-label") || $(el).attr("title") || $(el).find("img[alt]").attr("alt") || "";
    if (!label) linksWithoutText++;
    if (/^tel:/i.test(rawHref)) {
      telLinks.push(decodeURIComponent(rawHref.replace(/^tel:/i, "")));
      return;
    }
    if (/^mailto:/i.test(rawHref)) {
      const addr = decodeURIComponent(rawHref.replace(/^mailto:/i, "").split("?")[0]).trim();
      if (addr) mailtoLinks.push(...addr.split(",").map((a) => a.trim()));
      return;
    }
    const href = abs(rawHref, base);
    if (!href || !/^https?:/i.test(href)) return;
    let internal = false;
    try {
      internal = new URL(href).hostname.replace(/^www\./, "") === host;
    } catch {
      return;
    }
    links.push({ href, text: label, internal });
  });

  const cfEmails = $("[data-cfemail]")
    .map((_, el) => decodeCfEmail($(el).attr("data-cfemail") ?? ""))
    .get()
    .filter((e): e is string => Boolean(e));

  const images = $("img")
    .map((_, el) => {
      const src = abs($(el).attr("src") ?? $(el).attr("data-src") ?? $(el).attr("data-lazy-src"), base);
      const alt = $(el).attr("alt");
      return src ? { src, alt: alt === undefined ? null : alt } : null;
    })
    .get()
    .filter((i): i is { src: string; alt: string | null } => Boolean(i));

  const forms = $("form")
    .map((_, form) => {
      const fields = $(form).find(
        "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select",
      );
      let unlabeled = 0;
      fields.each((__, f) => {
        const id = $(f).attr("id");
        const hasLabel =
          (id && $(`label[for="${id.replace(/"/g, "")}"]`).length > 0) ||
          $(f).closest("label").length > 0 ||
          Boolean($(f).attr("aria-label") || $(f).attr("aria-labelledby") || $(f).attr("title"));
        if (!hasLabel) unlabeled++;
      });
      return {
        fields: fields.length,
        hasEmail: $(form).find('input[type=email], input[name*="mail" i]').length > 0,
        hasTextarea: $(form).find("textarea").length > 0,
        unlabeled,
      };
    })
    .get();

  const buttonsWithoutName = $("button").filter(
    (_, el) => !$(el).text().trim() && !$(el).attr("aria-label") && !$(el).attr("title"),
  ).length;

  const faviconHref =
    abs(
      $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').first().attr("href"),
      base,
    ) ?? undefined;
  const viewport = $('meta[name="viewport"]').attr("content")?.trim();
  const deprecatedTags = ["font", "center", "marquee", "blink", "frameset", "frame", "applet"].filter(
    (t) => $(t).length > 0,
  );
  const usesFlash =
    $(
      'embed[src$=".swf"], object[data$=".swf"], embed[type="application/x-shockwave-flash"], object[type="application/x-shockwave-flash"]',
    ).length > 0;
  const layoutTables = $("table[width], table table").length;
  const tableLayout = layoutTables >= 2 && $("table").length >= 2 && $("div").length < $("table").length * 3;
  const fixedWidthViewport = Boolean(viewport && /width\s*=\s*\d{3,4}/i.test(viewport));
  const noscriptText = $("noscript").text();
  const rootChildren = $("body").children().not("script, noscript, style, link").length;
  const hasScripts = $("script").length > 0;
  const appShell =
    hasScripts &&
    ($("#root, #app, #__next, #__nuxt, [data-reactroot], app-root, #___gatsby").length > 0 ||
      rootChildren <= 1);

  const bookingSignals: { url: string; label: string }[] = [];
  const pushBooking = (url: string, label: string) => {
    if (!bookingSignals.some((b) => b.url === url)) bookingSignals.push({ url, label });
  };
  for (const u of [...iframes, ...scripts]) {
    const hit = BOOKING_HOSTS.find((h) => u.toLowerCase().includes(h));
    if (hit) pushBooking(u, `Widget/integración de reservas (${hit})`);
  }
  const ctaTexts: string[] = [];
  const menuLinks: { url: string; isPdf: boolean }[] = [];
  const contactPageLinks: string[] = [];
  for (const l of links) {
    const lower = l.href.toLowerCase();
    const hostHit = BOOKING_HOSTS.find((h) => lower.includes(h));
    if (hostHit) pushBooking(l.href, l.text || hostHit);
    else if (BOOKING_TEXT_RE.test(l.text) && !/derechos reservados/i.test(l.text))
      pushBooking(l.href, l.text);
    else if (l.internal && BOOKING_PATH_RE.test(new URL(l.href).pathname))
      pushBooking(l.href, l.text || "Página de cita/reserva");
    const tp = (() => {
      try {
        const u = new URL(l.href);
        return classifyThirdParty(u.hostname, u.pathname);
      } catch {
        return null;
      }
    })();
    if (tp?.kind === "BOOKING_PLATFORM" || tp?.kind === "DELIVERY") pushBooking(l.href, `${tp.label}`);
    if (
      MENU_RE.test(l.text) ||
      /\/(carta|menu|menus|la-carta|nuestra-carta)(\/|\.|$)/i.test(new URL(l.href).pathname)
    ) {
      menuLinks.push({ url: l.href, isPdf: /\.pdf($|\?)/i.test(l.href) });
    }
    if (l.internal && (CONTACT_RE.test(new URL(l.href).pathname) || CONTACT_RE.test(l.text)))
      contactPageLinks.push(l.href);
    if (l.text && l.text.length <= 40 && CTA_RE.test(l.text)) ctaTexts.push(l.text);
  }
  $("button, input[type=submit], [role=button]").each((_, el) => {
    const t = ($(el).text() || $(el).attr("value") || "").replace(/\s+/g, " ").trim();
    if (t && t.length <= 40 && CTA_RE.test(t)) ctaTexts.push(t);
    if (t && BOOKING_TEXT_RE.test(t)) pushBooking(pageUrl, t);
  });
  if (telLinks.length) ctaTexts.push("tel:");

  const hasMapEmbed =
    iframes.some((s) =>
      /google\.[a-z.]+\/maps|maps\.google|openstreetmap\.org|maps\.apple|bing\.com\/maps/i.test(s),
    ) ||
    links.some((l) =>
      /google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl|g\.page\//i.test(l.href),
    );

  const mixedContent = isHttpsPage
    ? [...scripts, ...stylesheets, ...images.map((i) => i.src), ...iframes]
        .filter((u) => u.startsWith("http:"))
        .slice(0, 20)
    : [];

  // Texto visible (después de extraer lo anterior)
  $("script, style, noscript, svg, template, iframe").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();

  return {
    url: pageUrl,
    title: $("title").first().text().replace(/\s+/g, " ").trim() || undefined,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() || undefined,
    viewport,
    lang: $("html").attr("lang")?.trim() || undefined,
    generator: $('meta[name="generator"]').attr("content")?.trim() || undefined,
    robotsMeta: $('meta[name="robots"]').attr("content")?.toLowerCase(),
    h1: $("h1")
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean),
    headingCounts: { h1: $("h1").length, h2: $("h2").length, h3: $("h3").length },
    text,
    wordCount: countWords(text),
    links,
    images,
    scripts,
    inlineScriptCount,
    stylesheets,
    forms,
    iframes,
    telLinks,
    mailtoLinks,
    cfEmails,
    faviconHref,
    jsonLd,
    hasNav: $("nav, [role=navigation], header ul li a").length > 0,
    deprecatedTags,
    usesFlash,
    tableLayout,
    fixedWidthViewport,
    a11y: {
      imagesWithoutAlt: images.filter((i) => i.alt === null).length,
      linksWithoutText,
      buttonsWithoutName,
      inputsWithoutLabel: forms.reduce((s, f) => s + f.unlabeled, 0),
    },
    mixedContent,
    appShell,
    noscriptMentionsJs: /javascript/i.test(noscriptText),
    ctaTexts: [...new Set(ctaTexts)].slice(0, 20),
    bookingSignals: bookingSignals.slice(0, 10),
    menuLinks: menuLinks.slice(0, 10),
    contactPageLinks: [...new Set(contactPageLinks)].slice(0, 5),
    hasMapEmbed,
  };
}

// ------------------------------------------------------------------ extractores de texto

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const EMAIL_BLOCKLIST = [
  /\.(png|jpe?g|gif|webp|svg|css|js)$/i,
  /@(example|domain|dominio|tudominio|yourdomain|email|correo|sentry|sentry-next|wixpress|mysite)\./i,
  /^(nombre|name|usuario|user|test|tuemail|your-?email|email|correo)@/i,
  /@\d+x\./i,
];

export function extractEmails(text: string, extra: string[] = []): string[] {
  const found = [...extra, ...(text.match(EMAIL_RE) ?? [])]
    .map((e) =>
      e
        .trim()
        .replace(/^[.]+|[.]+$/g, "")
        .toLowerCase(),
    )
    .filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) && !EMAIL_BLOCKLIST.some((re) => re.test(e)));
  return [...new Set(found)].slice(0, 10);
}

export function extractCopyrightYears(text: string): number[] {
  const years: number[] = [];
  const re =
    /(?:©|&copy;|copyright|\(c\))\s*(?:[^0-9]{0,40})?((?:19|20)\d{2})(?:\s*[-–/]\s*((?:19|20)\d{2}))?/gi;
  for (const m of text.matchAll(re)) {
    const y = Math.max(Number(m[1]), m[2] ? Number(m[2]) : 0);
    if (y >= 1995 && y <= 2100) years.push(y);
  }
  return [...new Set(years)];
}

const EVENT_RE =
  /(navidad(es)?|nochevieja|nochebuena|fin de a[nñ]o|cotill[oó]n|san valent[ií]n|semana santa|feria|carnaval(es)?|halloween|black friday|rebajas|temporada|campa[nñ]a|promoci[oó]n|oferta|evento|men[uú] especial|horario de (verano|invierno)|vacaciones|cerrado por vacaciones|christmas|new year'?s|valentine'?s|summer|season|curso)/i;

/** Menciones fechadas de eventos/promociones (p. ej. "Menú de Navidad 2019"). */
export function extractDatedMentions(
  text: string,
  url: string,
  currentYear: number,
): { year: number; text: string; url: string }[] {
  const out: { year: number; text: string; url: string }[] = [];
  const re = /(19|20)\d{2}/g;
  for (const m of text.matchAll(re)) {
    const year = Number(m[0]);
    if (year < 2000 || year > currentYear - 2) continue;
    const idx = m.index ?? 0;
    const window = text.slice(Math.max(0, idx - 45), idx + 10);
    if (!EVENT_RE.test(window)) continue;
    if (
      /(©|copyright|desde|since|fundad[oa]|founded|established|est\.)/i.test(
        text.slice(Math.max(0, idx - 30), idx),
      )
    )
      continue;
    out.push({ year, text: snippetAround(text, idx, 4, 60), url });
    if (out.length >= 5) break;
  }
  return out;
}

const STALE_PATTERNS: { kind: string; re: RegExp }[] = [
  {
    kind: "covid",
    re: /(covid(-?19)?|coronavirus|estado de alarma|desescalada|medidas sanitarias|mascarilla obligatoria|aforo (reducido|limitado)|confinamiento|pandemia)/i,
  },
  { kind: "temporarily_closed", re: /(cerrado temporalmente|temporalmente cerrado|temporarily closed)/i },
];

export function extractStaleNotices(
  text: string,
  url: string,
): { text: string; url: string; kind: string }[] {
  const out: { text: string; url: string; kind: string }[] = [];
  for (const { kind, re } of STALE_PATTERNS) {
    const m = re.exec(text);
    if (m) out.push({ kind, url, text: snippetAround(text, m.index, m[0].length, 70) });
  }
  return out;
}

const PLACEHOLDER_RE =
  /(lorem ipsum|dolor sit amet|hello world!|¡hola,? mundo!|just another wordpress site|otro sitio realizado con wordpress|sample page|p[aá]gina de ejemplo|this is an example page|welcome to wordpress|your site title|add your (text|content) here|insert (your )?text here|texto de ejemplo)/i;
const UNDER_CONSTRUCTION_RE =
  /(under construction|en construcci[oó]n|coming soon|pr[oó]ximamente|website coming soon|estamos trabajando en (nuestra|la) (nueva )?web|sitio en mantenimiento|maintenance mode|modo mantenimiento)/i;
const PARKED_RE =
  /(domain (is )?for sale|buy this domain|este dominio (est[aá] )?(en venta|a la venta)|dominio en venta|this domain (has expired|is parked|may be for sale)|dominio (caducado|expirado)|parked (free|domain)|sedoparking|domain parking|hugedomains|afternic|dan\.com|account (has been )?suspended|cuenta (ha sido )?suspendida|this account has been suspended|default web site page|welcome to nginx!|apache2? (ubuntu|debian)? ?default page|it works!|iis windows server|index of \/|site not found|no website configured at this address)/i;

export function detectPlaceholder(
  text: string,
): { kind: "PARKED" | "UNDER_CONSTRUCTION" | "PLACEHOLDER"; snippet: string } | null {
  const sample = text.slice(0, 20_000);
  const parked = PARKED_RE.exec(sample);
  if (parked && countWords(sample) < 400)
    return { kind: "PARKED", snippet: snippetAround(sample, parked.index, parked[0].length, 60) };
  const uc = UNDER_CONSTRUCTION_RE.exec(sample);
  if (uc && countWords(sample) < 250)
    return { kind: "UNDER_CONSTRUCTION", snippet: snippetAround(sample, uc.index, uc[0].length, 60) };
  const ph = PLACEHOLDER_RE.exec(sample);
  if (ph) return { kind: "PLACEHOLDER", snippet: snippetAround(sample, ph.index, ph[0].length, 60) };
  return null;
}

const HOURS_RE =
  /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?|festivos|l-v|lun|mar|mi[eé]|jue|vie|s[aá]b|dom|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b[^.\n]{0,40}?\b([01]?\d|2[0-3])[:.h]([0-5]\d)?\s*(h|hrs|am|pm)?\s*(-|–|a|to|hasta)\s*([01]?\d|2[0-3])[:.h]?([0-5]\d)?/gi;

export function extractHoursTexts(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(HOURS_RE)) {
    out.push(snippetAround(text, m.index ?? 0, m[0].length, 25));
    if (out.length >= 5) break;
  }
  return out;
}

const ADDRESS_RE =
  /\b(c\/|calle|avda\.?|avenida|plaza|pza\.?|paseo|p\.º|ctra\.?|carretera|camino|ronda|glorieta|pol[ií]gono|urbanizaci[oó]n|street|st\.|avenue|road)\s+[^\n,;|]{2,60}/gi;

export function extractAddressTexts(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ADDRESS_RE)) {
    out.push(m[0].trim());
    if (out.length >= 5) break;
  }
  return [...new Set(out)];
}

/** Códigos postales españoles en contexto de dirección. */
export function extractSpanishPostalCodes(text: string): string[] {
  const out = new Set<string>();
  const re = /\b(0[1-9]|[1-4]\d|5[0-2])\d{3}\b/g;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    const ctx = text.slice(Math.max(0, idx - 80), idx + 40);
    if (
      /(c\/|calle|avda|avenida|plaza|paseo|ctra|c\.p\.|cp|código postal|codigo postal|\b(sevilla|madrid|barcelona|valencia|m[aá]laga|spain|españa)\b)/i.test(
        ctx,
      )
    )
      out.add(m[0]);
  }
  return [...out].slice(0, 5);
}

export function extractPhones(page: PageData, countryCode?: string) {
  const out = new Map<string, { e164: string; national: string; clickable: boolean; url: string }>();
  for (const t of page.telLinks) {
    const p = normalizePhone(t, countryCode);
    if (p) out.set(p.e164, { e164: p.e164, national: p.national, clickable: true, url: page.url });
  }
  for (const p of extractPhonesFromText(page.text.slice(0, 60_000), countryCode, 8)) {
    if (!out.has(p.e164))
      out.set(p.e164, { e164: p.e164, national: p.national, clickable: false, url: page.url });
  }
  return [...out.values()];
}

// ------------------------------------------------------------------ schema.org

const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function flattenJsonLd(input: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o["@type"]) out.push(o);
      if (o["@graph"]) visit(o["@graph"], depth + 1);
    }
  };
  visit(input, 0);
  return out;
}

const asArray = <T>(v: T | T[] | undefined | null): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

export function extractSchemaOrg(jsonLd: unknown[]) {
  const nodes = jsonLd.flatMap((j) => flattenJsonLd(j));
  const types = [...new Set(nodes.flatMap((n) => asArray(n["@type"] as string | string[]).map(String)))];
  const telephone: string[] = [];
  const email: string[] = [];
  const postalCode: string[] = [];
  const streetAddress: string[] = [];
  const sameAs: string[] = [];
  const openingHours: { day: number; open: string; close: string }[] = [];
  for (const n of nodes) {
    for (const t of asArray(n.telephone as string | string[])) if (typeof t === "string") telephone.push(t);
    for (const e of asArray(n.email as string | string[]))
      if (typeof e === "string") email.push(e.replace(/^mailto:/i, ""));
    for (const s of asArray(n.sameAs as string | string[])) if (typeof s === "string") sameAs.push(s);
    for (const a of asArray(n.address as Record<string, unknown> | Record<string, unknown>[])) {
      if (a && typeof a === "object") {
        if (typeof a.postalCode === "string" || typeof a.postalCode === "number")
          postalCode.push(String(a.postalCode));
        if (typeof a.streetAddress === "string") streetAddress.push(a.streetAddress);
      }
    }
    for (const spec of asArray(
      n.openingHoursSpecification as Record<string, unknown> | Record<string, unknown>[],
    )) {
      if (!spec || typeof spec !== "object") continue;
      const opens = typeof spec.opens === "string" ? spec.opens.slice(0, 5) : undefined;
      const closes = typeof spec.closes === "string" ? spec.closes.slice(0, 5) : undefined;
      if (!opens || !closes) continue;
      for (const d of asArray(spec.dayOfWeek as string | string[])) {
        const name = String(d).split("/").pop()?.toLowerCase() ?? "";
        const day = DAY_NAMES[name];
        if (day !== undefined) openingHours.push({ day, open: opens, close: closes });
      }
    }
    for (const oh of asArray(n.openingHours as string | string[])) {
      if (typeof oh !== "string") continue;
      const parsed = parseOsmOpeningHours(oh);
      if (parsed?.periods.length) openingHours.push(...parsed.periods);
    }
  }
  return {
    types,
    telephone: [...new Set(telephone)],
    email: [...new Set(email)],
    postalCode: [...new Set(postalCode)],
    streetAddress: [...new Set(streetAddress)],
    openingHours,
    sameAs: [...new Set(sameAs)],
  };
}
