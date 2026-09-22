import { crawlerUserAgent, getEnv } from "@/config/env";
import { CATEGORY_BY_KEY } from "@/domain/categories";
import type {
  WebsiteAnalyzer,
  WebsiteAnalyzerContext,
  WebsiteAuditResult,
  WebsiteExtraction,
} from "@/domain/ports";
import type { ContactType, EvidenceItem, Finding, WebsiteStatus } from "@/domain/types";
import { finding, dedupeFindings } from "@/analysis/findings";
import { ALLOW_ALL, isPathAllowed, parseRobots, type RobotsRules } from "@/analysis/http/robots";
import {
  FetchFailure,
  decodeBody,
  isHtmlResponse,
  safeFetch,
  type SafeResponse,
} from "@/analysis/http/safe-fetch";
import { hostnameResolves } from "@/analysis/http/ssrf";
import { mapWithConcurrency, sleep } from "@/shared/async";
import { createLogger } from "@/shared/logger";
import {
  canonicalSocialUrl,
  classifyThirdParty,
  isNotOwnWebsite,
  normalizeWebsiteUrl,
  registrableDomain,
} from "@/shared/url";
import { uniq } from "@/shared/text";
import {
  detectPlaceholder,
  extractAddressTexts,
  extractCopyrightYears,
  extractDatedMentions,
  extractEmails,
  extractHoursTexts,
  extractPhones,
  extractSchemaOrg,
  extractSpanishPostalCodes,
  extractStaleNotices,
  parsePage,
  type PageData,
} from "./html";
import { renderWithBrowser } from "./browser";

const log = createLogger("website-analyzer");

const PARKING_HOSTS = [
  "sedo.com",
  "dan.com",
  "afternic.com",
  "hugedomains.com",
  "bodis.com",
  "parkingcrew.net",
  "above.com",
  "undeveloped.com",
];
const STOCK_RE =
  /(shutterstock|istockphoto|gettyimages|depositphotos|dreamstime|123rf|pexels|unsplash|freepik|pixabay|stock-photo|adobestock)/i;

interface Options {
  timeoutMs: number;
  maxBytes: number;
  maxPages: number;
  maxLinkChecks: number;
  respectRobots: boolean;
  browserRendering: boolean;
  userAgent: string;
  now: () => Date;
}

function defaultOptions(): Options {
  const env = getEnv();
  return {
    timeoutMs: env.CRAWLER_TIMEOUT_MS,
    maxBytes: env.CRAWLER_MAX_BYTES,
    maxPages: env.CRAWLER_MAX_PAGES,
    maxLinkChecks: env.CRAWLER_MAX_LINK_CHECKS,
    respectRobots: env.RESPECT_ROBOTS_TXT,
    browserRendering: env.ENABLE_BROWSER_RENDERING,
    userAgent: crawlerUserAgent(env),
    now: () => new Date(),
  };
}

const ev = (label: string, value?: string, url?: string): EvidenceItem => ({
  label,
  value,
  url,
  source: "website",
});

function tlsFindingFromError(detail: string, url: string): Finding {
  const code = detail.toUpperCase();
  if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT/.test(code)) {
    return finding(
      "TLS_CHAIN_INCOMPLETE",
      "SECURITY",
      "MEDIUM",
      "Cadena de certificados HTTPS incompleta",
      "El servidor no envía los certificados intermedios. Algunos navegadores lo compensan, pero otros dispositivos pueden mostrar un aviso de seguridad.",
      [ev("Error TLS", detail, url)],
    );
  }
  if (/EXPIRED/.test(code)) {
    return finding(
      "TLS_CERT_EXPIRED",
      "SECURITY",
      "CRITICAL",
      "Certificado HTTPS caducado",
      "Los navegadores muestran un aviso de seguridad a los visitantes.",
      [ev("Error TLS", detail, url)],
    );
  }
  if (/SELF_SIGNED/.test(code)) {
    return finding(
      "TLS_CERT_SELF_SIGNED",
      "SECURITY",
      "CRITICAL",
      "Certificado HTTPS autofirmado",
      "Los navegadores muestran un aviso de seguridad a los visitantes.",
      [ev("Error TLS", detail, url)],
    );
  }
  if (/ALTNAME|HOSTNAME/.test(code)) {
    return finding(
      "TLS_CERT_HOSTNAME_MISMATCH",
      "SECURITY",
      "CRITICAL",
      "El certificado HTTPS no corresponde al dominio",
      "El certificado instalado es de otro dominio (frecuente en hostings compartidos mal configurados). Los navegadores muestran un aviso de seguridad.",
      [ev("Error TLS", detail, url)],
    );
  }
  return finding(
    "TLS_ERROR",
    "SECURITY",
    "HIGH",
    "Error en la conexión segura (HTTPS)",
    "No se ha podido establecer una conexión HTTPS válida.",
    [ev("Error TLS", detail, url)],
  );
}

function technicalScoreFrom(findings: Finding[]): number {
  const weights = { CRITICAL: 30, HIGH: 15, MEDIUM: 7, LOW: 2, INFO: 0 } as const;
  const penalty = findings.reduce((s, f) => s + weights[f.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export class HttpWebsiteAnalyzer implements WebsiteAnalyzer {
  private readonly opts: Options;
  constructor(opts?: Partial<Options>) {
    this.opts = { ...defaultOptions(), ...opts };
  }

  private fetch(url: string, extra: Parameters<typeof safeFetch>[1] = {}) {
    return safeFetch(url, {
      userAgent: this.opts.userAgent,
      timeoutMs: this.opts.timeoutMs,
      maxBytes: this.opts.maxBytes,
      ...extra,
    });
  }

  async analyze(inputUrl: string, ctx: WebsiteAnalyzerContext): Promise<WebsiteAuditResult> {
    const started = Date.now();
    const deadline = started + Math.max(60_000, this.opts.timeoutMs * 6);
    const findings: Finding[] = [];
    const unverified: string[] = [];
    const pages: WebsiteAuditResult["pages"] = [];
    const base: Omit<WebsiteAuditResult, "status" | "statusReason"> = {
      requestedUrl: inputUrl,
      pages,
      findings,
      unverified,
      technicalScore: null,
      renderedWithBrowser: false,
      analysisComplete: false,
    };
    const done = (
      status: WebsiteStatus,
      statusReason: string,
      extra: Partial<WebsiteAuditResult> = {},
    ): WebsiteAuditResult => {
      const deduped = dedupeFindings(findings);
      return { ...base, ...extra, findings: deduped, unverified: uniq(unverified), status, statusReason };
    };

    const url = normalizeWebsiteUrl(inputUrl);
    if (!url) {
      findings.push(
        finding(
          "WEBSITE_URL_INVALID",
          "AVAILABILITY",
          "HIGH",
          "La URL de la web no es válida",
          "El proveedor publica una dirección web con formato incorrecto.",
          [ev("URL publicada", inputUrl)],
        ),
      );
      return done("WEB_CAIDA", "La URL publicada no es válida", { technicalScore: 0 });
    }

    // 1) ¿Es una plataforma de terceros?
    const tp = classifyThirdParty(url.hostname, url.pathname);
    if (tp && isNotOwnWebsite(tp.kind)) {
      findings.push(
        finding(
          "WEBSITE_IS_THIRD_PARTY",
          "PRESENCE",
          "HIGH",
          `La "web" publicada es un perfil de ${tp.label}`,
          "Una ficha o perfil en una plataforma de terceros no cuenta como web propia del negocio.",
          [
            {
              label: "Enlace publicado como web",
              value: url.toString(),
              source: "system",
              url: url.toString(),
            },
          ],
        ),
      );
      return done("SIN_WEB", `El enlace publicado apunta a ${tp.label}, no a una web propia`, {
        analysisComplete: true,
      });
    }
    if (tp?.kind === "DISCONTINUED_BUILDER") {
      findings.push(
        finding(
          "GOOGLE_BUSINESS_SITE_DISCONTINUED",
          "AVAILABILITY",
          "CRITICAL",
          "Web creada con Google Business Profile (servicio discontinuado)",
          "Google cerró las webs *.business.site en 2024; estas direcciones ya no muestran la web del negocio.",
          [ev("URL publicada", url.toString(), url.toString())],
          { provenance: "OBSERVED" },
        ),
      );
    }
    if (tp?.kind === "FREE_SUBDOMAIN_BUILDER") {
      findings.push(
        finding(
          "FREE_SUBDOMAIN",
          "PRESENCE",
          "MEDIUM",
          "La web usa un subdominio gratuito (sin dominio propio)",
          "Un dominio propio transmite más confianza y facilita el posicionamiento local.",
          [ev("Dominio", url.hostname, url.toString())],
        ),
      );
    }

    // 2) robots.txt
    let robots: RobotsRules = ALLOW_ALL;
    if (this.opts.respectRobots) robots = await this.fetchRobots(url.origin);
    const robotsInfo = {
      status: robots.status,
      disallowCount: robots.disallow.length,
      sitemaps: robots.sitemaps.slice(0, 3),
    };
    const homeAllowed = isPathAllowed(robots, `${url.pathname}${url.search}`);

    // 3) Portada
    const home = await this.fetchHomepage(url, findings);
    if (!home.ok) {
      if (tp?.kind === "DISCONTINUED_BUILDER")
        return done("WEB_CAIDA", "Web *.business.site discontinuada por Google", {
          technicalScore: 0,
          robots: robotsInfo,
          errorCode: home.errorCode,
        });
      return done(home.status, home.reason, {
        technicalScore: home.status === "WEB_CAIDA" ? 0 : null,
        robots: robotsInfo,
        errorCode: home.errorCode,
        errorMessage: home.reason,
        httpStatus: home.res?.status,
        redirectChain: home.res?.redirectChain,
        analysisComplete: home.status === "WEB_CAIDA",
      });
    }
    const res = home.res;
    const finalUrl = new URL(res.url);
    pages.push({ url: res.url, status: res.status, ok: true, kind: "home" });
    base.finalUrl = res.url;
    base.httpStatus = res.status;
    base.isHttps = finalUrl.protocol === "https:";
    base.redirectChain = res.redirectChain;
    base.responseTimeMs = res.totalMs;
    base.htmlBytes = res.body?.length ?? 0;
    base.robots = robotsInfo;
    if (res.tls) base.tls = { ...res.tls };

    if (tp?.kind === "DISCONTINUED_BUILDER") {
      return done("WEB_CAIDA", "Web *.business.site discontinuada por Google", {
        technicalScore: 0,
        analysisComplete: true,
      });
    }

    // Redirección a terceros / parking
    const finalTp = classifyThirdParty(finalUrl.hostname, finalUrl.pathname);
    if (finalTp && isNotOwnWebsite(finalTp.kind)) {
      findings.push(
        finding(
          "DOMAIN_REDIRECTS_TO_THIRD_PARTY",
          "PRESENCE",
          "HIGH",
          `El dominio redirige a ${finalTp.label}`,
          "El negocio tiene (o tuvo) un dominio, pero no muestra una web propia.",
          [
            ev(
              "Cadena de redirecciones",
              [...res.redirectChain.map((r) => `${r.status} ${r.url}`), res.url].join(" → "),
              url.toString(),
            ),
          ],
        ),
      );
      return done("SIN_WEB", `El dominio redirige a ${finalTp.label}`, {
        technicalScore: null,
        analysisComplete: true,
      });
    }
    if (PARKING_HOSTS.some((h) => finalUrl.hostname.endsWith(h))) {
      findings.push(
        finding(
          "DOMAIN_PARKED",
          "AVAILABILITY",
          "CRITICAL",
          "Dominio aparcado o en venta",
          "El dominio redirige a un servicio de parking/venta de dominios: la web del negocio no está disponible.",
          [ev("Redirige a", res.url, url.toString())],
        ),
      );
      return done("WEB_CAIDA", "Dominio aparcado o en venta", { technicalScore: 0, analysisComplete: true });
    }
    if (registrableDomain(finalUrl.hostname) !== registrableDomain(url.hostname)) {
      findings.push(
        finding(
          "REDIRECTS_TO_OTHER_DOMAIN",
          "PRESENCE",
          "LOW",
          "La web redirige a otro dominio",
          "Puede ser un cambio de dominio legítimo o un dominio que ya no pertenece al negocio. Conviene verificarlo manualmente.",
          [ev("De → a", `${url.hostname} → ${finalUrl.hostname}`, res.url)],
          { provenance: "OBSERVED", confidence: "MEDIUM" },
        ),
      );
    }
    if (!isHtmlResponse(res)) {
      unverified.push("La dirección no devuelve una página HTML; no se ha podido analizar el contenido.");
      return done(
        "WEB_NO_VERIFICABLE",
        `La web devuelve contenido no HTML (${res.headers["content-type"] ?? "desconocido"})`,
      );
    }
    if (!homeAllowed) {
      unverified.push(
        "robots.txt no permite analizar el contenido: solo se ha comprobado la disponibilidad.",
      );
      findings.push(
        finding(
          "ROBOTS_BLOCKS_ANALYSIS",
          "AVAILABILITY",
          "INFO",
          "El sitio no permite el análisis automatizado (robots.txt)",
          "Se respeta la indicación: solo se ha comprobado que la web responde.",
          [ev("robots.txt", `${url.origin}/robots.txt`)],
        ),
      );
      return done("WEB_NO_VERIFICABLE", "La web responde, pero robots.txt no permite analizar su contenido", {
        robots: robotsInfo,
      });
    }

    // 4) Parseo de la portada (+ renderizado opcional si requiere JS)
    let html = decodeBody(res);
    let home$ = parsePage(html, res.url);
    const jsOnly =
      home$.wordCount < 60 &&
      (home$.scripts.length > 0 || home$.inlineScriptCount > 0) &&
      (home$.appShell || home$.noscriptMentionsJs || home$.scripts.length >= 3);
    let jsLimited = false;
    let horizontalOverflow: boolean | null = null;
    let consoleErrors: string[] = [];
    if (jsOnly) {
      const rendered = this.opts.browserRendering
        ? await renderWithBrowser(res.url, this.opts.userAgent, this.opts.timeoutMs * 2)
        : null;
      if (rendered) {
        html = rendered.html;
        home$ = parsePage(html, rendered.finalUrl);
        base.renderedWithBrowser = true;
        horizontalOverflow = rendered.horizontalOverflow;
        consoleErrors = rendered.consoleErrors;
      } else {
        jsLimited = true;
        unverified.push(
          "La web genera su contenido con JavaScript. Sin renderizado con navegador (ENABLE_BROWSER_RENDERING) no se han podido verificar contenido, contacto, horarios ni CTA.",
        );
      }
    }
    if (!base.renderedWithBrowser) {
      unverified.push(
        "Contraste de colores y diseño responsive real: no medibles sin renderizado con navegador.",
      );
      unverified.push("Errores de consola JavaScript: no medibles sin renderizado con navegador.");
    }

    const placeholder = detectPlaceholder(home$.text + " " + (home$.title ?? ""));
    if (placeholder?.kind === "PARKED") {
      findings.push(
        finding(
          "DOMAIN_PARKED",
          "AVAILABILITY",
          "CRITICAL",
          "Página de dominio aparcado, cuenta suspendida o servidor por defecto",
          "La dirección responde, pero no muestra la web del negocio.",
          [ev("Texto detectado", placeholder.snippet, res.url)],
        ),
      );
      return done(
        "WEB_CAIDA",
        "La dirección muestra una página de parking, suspensión o servidor por defecto",
        { technicalScore: 0, analysisComplete: true },
      );
    }

    // 5) Páginas adicionales (contacto, carta, servicios…)
    const extraPages: PageData[] = [];
    if (!jsLimited) {
      const candidates = this.pickPages(home$, robots);
      const fetched = await mapWithConcurrency(candidates.slice(0, this.opts.maxPages - 1), 2, async (c) => {
        if (Date.now() > deadline) return null;
        try {
          const r = await this.fetch(c.url, {
            timeoutMs: Math.min(this.opts.timeoutMs, 12_000),
            maxBytes: Math.min(this.opts.maxBytes, 1_500_000),
          });
          const ok = r.status >= 200 && r.status < 300 && isHtmlResponse(r);
          pages.push({ url: c.url, status: r.status, ok, kind: c.kind });
          return ok ? parsePage(decodeBody(r), r.url) : null;
        } catch (err) {
          const e = err as FetchFailure;
          pages.push({ url: c.url, ok: false, kind: c.kind, error: e.code ?? "ERROR" });
          return null;
        }
      });
      for (const p of fetched) if (p) extraPages.push(p);
    }
    const allPages = [home$, ...extraPages];

    // 6) Extracción agregada
    const extraction = this.aggregate(allPages, ctx, res.url);

    // 7) Comprobaciones técnicas en red (enlaces, imágenes, recursos, dominios externos, favicon, https, sitemap)
    const net = await this.networkChecks(finalUrl, allPages, pages, robots, deadline);
    base.linkChecks = net.linkChecks;
    base.resourceStats = net.resourceStats;
    if (net.latestSitemapLastmod) extraction.latestSitemapLastmod = net.latestSitemapLastmod;

    // 7b) Web que depende de JavaScript y no puede cargar sus scripts: el visitante ve una página vacía
    if (jsOnly && !base.renderedWithBrowser) {
      const sameHostScripts = home$.scripts.filter((s) => {
        try {
          return new URL(s).hostname === finalUrl.hostname;
        } catch {
          return false;
        }
      });
      const failedScripts = net.brokenResources.filter((r) => sameHostScripts.includes(r.url));
      if (sameHostScripts.length > 0 && failedScripts.length === sameHostScripts.length) {
        findings.push(
          finding(
            "JS_APP_BROKEN",
            "AVAILABILITY",
            "CRITICAL",
            "La web no puede cargar: sus scripts principales devuelven error",
            "La página depende de JavaScript para mostrar su contenido y todos sus scripts propios fallan, por lo que el visitante ve una página vacía.",
            failedScripts
              .slice(0, 4)
              .map((r) => ev("Script", r.status ? `HTTP ${r.status}` : r.error, r.url)),
          ),
        );
        base.linkChecks = net.linkChecks;
        return done("WEB_CAIDA", "La web responde, pero sus scripts principales fallan y se muestra vacía", {
          technicalScore: 0,
          analysisComplete: true,
        });
      }
    }

    // 8) Hallazgos
    this.securityFindings(finalUrl, res, net, findings);
    this.performanceFindings(res, net, findings);
    this.seoFindings(home$, allPages, extraction, findings);
    this.mobileFindings(home$, horizontalOverflow, findings);
    this.accessibilityFindings(allPages, findings);
    this.techStackFindings(home$, findings, base);
    if (consoleErrors.length) {
      findings.push(
        finding(
          "CONSOLE_ERRORS",
          "UX",
          consoleErrors.length >= 5 ? "MEDIUM" : "LOW",
          "Errores de JavaScript en consola",
          "La página genera errores de JavaScript al cargar.",
          consoleErrors.slice(0, 5).map((e) => ev("Error", e, res.url)),
        ),
      );
    }
    if (placeholder?.kind === "UNDER_CONSTRUCTION") {
      findings.push(
        finding(
          "UNDER_CONSTRUCTION",
          "CONTENT",
          "CRITICAL",
          "Web en construcción o en mantenimiento",
          "La web no muestra contenido real del negocio.",
          [ev("Texto detectado", placeholder.snippet, res.url)],
        ),
      );
    } else if (placeholder?.kind === "PLACEHOLDER") {
      findings.push(
        finding(
          "PLACEHOLDER_CONTENT",
          "CONTENT",
          "HIGH",
          "Contenido de plantilla o de ejemplo sin sustituir",
          "Se ha encontrado texto de relleno (lorem ipsum, páginas de ejemplo de WordPress, etc.).",
          [ev("Texto detectado", placeholder.snippet, res.url)],
        ),
      );
    }
    if (!jsLimited) this.contentFindings(home$, allPages, extraction, ctx, findings);

    const deduped = dedupeFindings(findings);
    findings.length = 0;
    findings.push(...deduped);

    // 9) Estado final
    const count = (s: Finding["severity"]) => findings.filter((f) => f.severity === s).length;
    let status: WebsiteStatus;
    let reason: string;
    if (count("CRITICAL") > 0 || count("HIGH") > 0 || count("MEDIUM") >= 3) {
      status = "WEB_FUNCIONAL_CON_PROBLEMAS";
      reason = `La web responde, con ${count("CRITICAL")} problema(s) crítico(s), ${count("HIGH")} alto(s) y ${count("MEDIUM")} medio(s)`;
    } else if (jsLimited) {
      status = "WEB_NO_VERIFICABLE";
      reason = "La web responde pero su contenido requiere JavaScript; análisis de contenido incompleto";
    } else {
      status = "WEB_ACEPTABLE";
      reason = "La web responde y no presenta problemas críticos evidentes";
    }

    log.debug("analysis done", { url: res.url, ms: Date.now() - started, findings: findings.length });
    return done(status, reason, {
      technicalScore: technicalScoreFrom(findings),
      extraction,
      analysisComplete: !jsLimited,
    });
  }

  // ------------------------------------------------------------------ red

  private async fetchRobots(origin: string): Promise<RobotsRules> {
    try {
      const r = await this.fetch(`${origin}/robots.txt`, { timeoutMs: 8000, maxBytes: 300_000 });
      if (r.status >= 200 && r.status < 300) return parseRobots(decodeBody(r), "BusinessOpportunityScanner");
      if (r.status >= 400 && r.status < 500) return ALLOW_ALL;
      return { ...ALLOW_ALL, status: "unavailable" };
    } catch {
      // Si robots.txt no responde tampoco responderá la web: lo decidirá la petición de portada.
      return ALLOW_ALL;
    }
  }

  private async fetchHomepage(
    url: URL,
    findings: Finding[],
  ): Promise<
    | { ok: true; res: SafeResponse }
    | { ok: false; status: WebsiteStatus; reason: string; errorCode?: string; res?: SafeResponse }
  > {
    const attempts: string[] = [];
    const tryFetch = async (
      u: string,
      allowInvalidCert = false,
      timeoutMs = this.opts.timeoutMs,
    ): Promise<SafeResponse | FetchFailure> => {
      try {
        const r = await this.fetch(u, { allowInvalidCert, timeoutMs });
        attempts.push(`${u} → HTTP ${r.status}`);
        return r;
      } catch (err) {
        const f = err instanceof FetchFailure ? err : new FetchFailure("UNKNOWN", String(err), u);
        attempts.push(`${u} → ${f.code}`);
        return f;
      }
    };

    let result = await tryFetch(url.toString());

    // Reintentos según el tipo de fallo
    if (result instanceof FetchFailure) {
      if (result.code === "SSRF_BLOCKED") {
        return {
          ok: false,
          status: "WEB_NO_VERIFICABLE",
          reason: `Bloqueado por la política de seguridad: ${result.message}`,
          errorCode: result.code,
        };
      }
      if (result.code === "TLS_ERROR") {
        findings.push(tlsFindingFromError(result.detail ?? result.message, url.toString()));
        result = await tryFetch(url.toString(), true);
      } else if (
        result.code === "TIMEOUT" ||
        result.code === "DNS_TEMPORARY" ||
        result.code === "CONNECTION_RESET"
      ) {
        await sleep(1500);
        // Segundo intento con más margen: una web muy lenta no es una web caída
        const slowTimeout = result.code === "TIMEOUT" ? Math.max(30_000, this.opts.timeoutMs * 2) : this.opts.timeoutMs;
        result = await tryFetch(url.toString(), false, slowTimeout);
      }
    }
    if (
      result instanceof FetchFailure &&
      ["CONNECTION_REFUSED", "TIMEOUT", "CONNECTION_RESET", "HOST_UNREACHABLE", "TLS_ERROR"].includes(
        result.code,
      )
    ) {
      // Prueba el otro protocolo (webs sin SSL o con SSL pero sin HTTP)
      const alt = new URL(url.toString());
      alt.protocol = url.protocol === "https:" ? "http:" : "https:";
      const altResult = await tryFetch(alt.toString());
      if (!(altResult instanceof FetchFailure)) {
        if (alt.protocol === "http:") {
          findings.push(
            finding(
              "HTTPS_NOT_WORKING",
              "SECURITY",
              "HIGH",
              "HTTPS no funciona; la web solo responde por HTTP",
              "Los navegadores marcan la web como «No segura».",
              [ev("Intentos", attempts.join(" | "))],
            ),
          );
        }
        result = altResult;
      }
    }
    if (result instanceof FetchFailure && result.code === "DNS_NOT_FOUND") {
      const alt = new URL(url.toString());
      alt.hostname = alt.hostname.startsWith("www.") ? alt.hostname.slice(4) : `www.${alt.hostname}`;
      const altResult = await tryFetch(alt.toString());
      if (!(altResult instanceof FetchFailure)) result = altResult;
    }

    if (result instanceof FetchFailure) {
      const reasonByCode: Partial<Record<string, string>> = {
        DNS_NOT_FOUND: "El dominio no existe o no resuelve (DNS): posible dominio caducado",
        CONNECTION_REFUSED: "El servidor rechaza la conexión",
        TIMEOUT: "La web no responde (tiempo de espera agotado en varios intentos)",
        HOST_UNREACHABLE: "El servidor es inalcanzable",
        CONNECTION_RESET: "El servidor corta la conexión",
        TOO_MANY_REDIRECTS: "La web entra en un bucle de redirecciones",
        TLS_ERROR: "No se puede establecer conexión segura",
        PROTOCOL_ERROR: "El servidor devuelve una respuesta HTTP inválida",
      };
      const reason = reasonByCode[result.code];
      if (reason) {
        findings.push(
          finding(
            "WEBSITE_UNREACHABLE",
            "AVAILABILITY",
            "CRITICAL",
            "La web no está disponible",
            reason,
            [ev("Intentos realizados", attempts.join(" | "), url.toString())],
            {
              confidence: result.code === "TIMEOUT" ? "MEDIUM" : "HIGH",
            },
          ),
        );
        return { ok: false, status: "WEB_CAIDA", reason, errorCode: result.code };
      }
      return {
        ok: false,
        status: "WEB_NO_VERIFICABLE",
        reason: `No se ha podido comprobar la web: ${result.message}`,
        errorCode: result.code,
      };
    }

    let res = result;
    if (res.status >= 500) {
      await sleep(2000);
      const again = await tryFetch(url.toString());
      if (!(again instanceof FetchFailure)) res = again;
    }
    const body = res.body ? res.body.subarray(0, 50_000).toString("latin1") : "";
    const challenge =
      Boolean(res.headers["cf-mitigated"]) ||
      /just a moment|cf-chl|attention required|captcha|access denied/i.test(body);
    if ((res.status === 403 || res.status === 503 || res.status === 429) && challenge) {
      return {
        ok: false,
        status: "WEB_NO_VERIFICABLE",
        reason: "La web tiene una protección anti-bots que impide el análisis automático",
        errorCode: `HTTP_${res.status}`,
        res,
      };
    }
    if ([401, 403, 407, 429, 451].includes(res.status)) {
      return {
        ok: false,
        status: "WEB_NO_VERIFICABLE",
        reason: `La web deniega el acceso automatizado (HTTP ${res.status})`,
        errorCode: `HTTP_${res.status}`,
        res,
      };
    }
    if (res.status === 404 || res.status === 410 || res.status >= 500) {
      const reason =
        res.status >= 500
          ? `Error del servidor (HTTP ${res.status}) en varios intentos`
          : `La portada no existe (HTTP ${res.status})`;
      findings.push(
        finding("WEBSITE_HTTP_ERROR", "AVAILABILITY", "CRITICAL", "La web devuelve un error", reason, [
          ev("Intentos realizados", attempts.join(" | "), url.toString()),
        ]),
      );
      return { ok: false, status: "WEB_CAIDA", reason, errorCode: `HTTP_${res.status}`, res };
    }
    if (res.status < 200 || res.status >= 400) {
      return {
        ok: false,
        status: "WEB_NO_VERIFICABLE",
        reason: `Respuesta inesperada (HTTP ${res.status})`,
        errorCode: `HTTP_${res.status}`,
        res,
      };
    }
    if (!res.body || res.body.length === 0) {
      findings.push(
        finding(
          "EMPTY_RESPONSE",
          "AVAILABILITY",
          "CRITICAL",
          "La web responde vacía",
          "El servidor responde sin contenido.",
          [ev("URL", res.url)],
        ),
      );
      return {
        ok: false,
        status: "WEB_CAIDA",
        reason: "La web responde sin contenido",
        errorCode: "EMPTY",
        res,
      };
    }
    return { ok: true, res };
  }

  private pickPages(home: PageData, robots: RobotsRules): { url: string; kind: string }[] {
    const out: { url: string; kind: string }[] = [];
    const seen = new Set<string>([home.url.replace(/\/$/, "")]);
    const add = (url: string, kind: string) => {
      const key = url.split("#")[0].replace(/\/$/, "");
      if (seen.has(key)) return;
      try {
        const u = new URL(url);
        if (!isPathAllowed(robots, `${u.pathname}${u.search}`)) return;
        if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?|mp4|mp3)$/i.test(u.pathname)) return;
      } catch {
        return;
      }
      seen.add(key);
      out.push({ url: key, kind });
    };
    home.contactPageLinks.forEach((u) => add(u, "contact"));
    const keywordKinds: [RegExp, string][] = [
      [/(carta|menu)/i, "menu"],
      [/(reserv|booking|cita)/i, "booking"],
      [/(servicio|service|tratamiento|especialidad|tarifa|precio|pricing)/i, "services"],
      [/(nosotros|quienes|about|empresa|historia|equipo)/i, "about"],
      [/(horario|hours)/i, "hours"],
    ];
    for (const l of home.links.filter((x) => x.internal)) {
      const hay = `${l.text} ${new URL(l.href).pathname}`;
      const k = keywordKinds.find(([re]) => re.test(hay));
      if (k) add(l.href, k[1]);
    }
    return out;
  }

  private async networkChecks(
    finalUrl: URL,
    pagesData: PageData[],
    pagesLog: WebsiteAuditResult["pages"],
    robots: RobotsRules,
    deadline: number,
  ) {
    const host = finalUrl.hostname.replace(/^www\./, "");
    const fetchedPages = new Set(pagesLog.map((p) => p.url.replace(/\/$/, "")));
    const timeLeft = () => deadline - Date.now() > 5000;

    const internal = uniq(
      pagesData
        .flatMap((p) => p.links)
        .filter((l) => l.internal)
        .map((l) => l.href.split("#")[0])
        .filter((h) => !fetchedPages.has(h.replace(/\/$/, ""))),
    ).filter((h) => {
      try {
        const u = new URL(h);
        return isPathAllowed(robots, `${u.pathname}${u.search}`);
      } catch {
        return false;
      }
    });

    const head = async (
      u: string,
    ): Promise<{ url: string; status?: number; error?: string; bytes?: number }> => {
      if (!timeLeft()) return { url: u, error: "SKIPPED" };
      try {
        let r = await this.fetch(u, { method: "HEAD", timeoutMs: 8000 });
        if ([403, 405, 501].includes(r.status))
          r = await this.fetch(u, { method: "GET", timeoutMs: 8000, maxBytes: 64_000 });
        const len = Number(r.headers["content-length"] ?? NaN);
        return { url: u, status: r.status, bytes: Number.isFinite(len) ? len : undefined };
      } catch (err) {
        return { url: u, error: (err as FetchFailure).code ?? "ERROR" };
      }
    };
    const isBroken = (r: { status?: number; error?: string }) =>
      r.error === "DNS_NOT_FOUND" ||
      r.error === "CONNECTION_REFUSED" ||
      // 503/429 suelen ser limitación por peticiones seguidas (anti-saturación), no enlaces rotos
      (r.status !== undefined && (r.status === 404 || r.status === 410 || (r.status >= 500 && r.status !== 503)));

    const linkResults = await mapWithConcurrency(internal.slice(0, this.opts.maxLinkChecks), 3, head);
    const brokenPagesFromCrawl = pagesLog.filter(
      (p) => p.status === 404 || p.status === 410 || (p.status ?? 0) >= 500,
    );
    const brokenLinks = [
      ...linkResults.filter(isBroken).map((r) => ({ url: r.url, status: r.status, error: r.error })),
      ...brokenPagesFromCrawl.map((p) => ({ url: p.url, status: p.status, error: p.error })),
    ];

    const images = uniq(pagesData.flatMap((p) => p.images.map((i) => i.src))).filter((u) =>
      /^https?:/i.test(u),
    );
    const imageResults = await mapWithConcurrency(images.slice(0, 15), 3, head);
    const resources = uniq(pagesData.flatMap((p) => [...p.scripts, ...p.stylesheets])).filter((u) =>
      /^https?:/i.test(u),
    );
    const resourceResults = await mapWithConcurrency(resources.slice(0, 15), 3, head);

    // Dominios externos: ¿siguen existiendo? (solo resolución DNS, sin conectar)
    const externalDomains = uniq(
      pagesData
        .flatMap((p) => p.links)
        .filter((l) => !l.internal)
        .map((l) => {
          try {
            const u = new URL(l.href);
            if (classifyThirdParty(u.hostname, u.pathname)) return null;
            return u.hostname;
          } catch {
            return null;
          }
        })
        .filter((h): h is string => Boolean(h) && registrableDomain(h!) !== registrableDomain(host)),
    ).slice(0, 10);
    const deadDomains: string[] = [];
    await mapWithConcurrency(externalDomains, 4, async (h) => {
      if ((await hostnameResolves(h)) === "not_found") deadDomains.push(h);
    });

    // Favicon
    const favHref = pagesData[0].faviconHref ?? `${finalUrl.origin}/favicon.ico`;
    const fav = await head(favHref);
    const hasFavicon = fav.status !== undefined && fav.status >= 200 && fav.status < 400;

    // HTTP → HTTPS
    let httpRedirectsToHttps: boolean | null = null;
    let httpsAvailable: boolean | null = finalUrl.protocol === "https:" ? true : null;
    if (timeLeft()) {
      if (finalUrl.protocol === "https:") {
        try {
          const r = await this.fetch(`http://${finalUrl.host}/`, {
            followRedirects: false,
            timeoutMs: 8000,
            maxBytes: 16_000,
          });
          httpRedirectsToHttps =
            r.status >= 300 && r.status < 400
              ? /^https:/i.test(r.headers["location"] ?? "") || (r.headers["location"] ?? "").startsWith("/")
              : false;
        } catch {
          httpRedirectsToHttps = null;
        }
      } else {
        try {
          const r = await this.fetch(`https://${finalUrl.host}/`, { timeoutMs: 8000, maxBytes: 16_000 });
          httpsAvailable = r.status < 500;
        } catch {
          httpsAvailable = false;
        }
      }
    }

    // Sitemap (fecha de última modificación declarada)
    let latestSitemapLastmod: string | undefined;
    if (timeLeft()) {
      const candidates = uniq([
        ...robots.sitemaps,
        `${finalUrl.origin}/sitemap.xml`,
        `${finalUrl.origin}/sitemap_index.xml`,
        `${finalUrl.origin}/wp-sitemap.xml`,
      ]).slice(0, 3);
      for (const sm of candidates) {
        try {
          const r = await this.fetch(sm, { timeoutMs: 8000, maxBytes: 2_000_000 });
          if (r.status !== 200) continue;
          const xml = decodeBody(r);
          if (!/<(urlset|sitemapindex)/i.test(xml)) continue;
          const dates = [...xml.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/gi)]
            .map((m) => Date.parse(m[1]))
            .filter((d) => Number.isFinite(d) && d < Date.now() + 86_400_000);
          if (dates.length) latestSitemapLastmod = new Date(Math.max(...dates)).toISOString();
          break;
        } catch {
          /* siguiente candidato */
        }
      }
    }

    const imageBytes = imageResults.reduce((s, r) => s + (r.bytes ?? 0), 0);
    const resourceBytes = resourceResults.reduce((s, r) => s + (r.bytes ?? 0), 0);
    return {
      brokenLinks,
      brokenImages: imageResults.filter(isBroken),
      brokenResources: resourceResults.filter(isBroken),
      heavyImages: imageResults.filter((r) => (r.bytes ?? 0) > 1_000_000),
      deadDomains,
      hasFavicon,
      httpRedirectsToHttps,
      httpsAvailable,
      latestSitemapLastmod,
      linkChecks: {
        internalChecked: linkResults.length,
        internalSkipped: Math.max(0, internal.length - linkResults.length),
        broken: brokenLinks.slice(0, 20),
        imagesChecked: imageResults.length,
        resourcesChecked: resourceResults.length,
        externalDomainsChecked: externalDomains.length,
        deadDomains,
      },
      resourceStats: {
        scripts: pagesData[0].scripts.length,
        stylesheets: pagesData[0].stylesheets.length,
        images: pagesData[0].images.length,
        sampledImageBytes: imageBytes,
        sampledResourceBytes: resourceBytes,
      },
    };
  }

  // ------------------------------------------------------------------ extracción

  private aggregate(pages: PageData[], ctx: WebsiteAnalyzerContext, homeUrl: string): WebsiteExtraction {
    const year = this.opts.now().getFullYear();
    const phones = new Map<string, WebsiteExtraction["phones"][number]>();
    const emails = new Map<string, WebsiteExtraction["emails"][number]>();
    const socials = new Map<string, WebsiteExtraction["socials"][number]>();
    const whatsapp = new Map<string, WebsiteExtraction["whatsapp"][number]>();
    const schemaAll = extractSchemaOrg(pages.flatMap((p) => p.jsonLd));
    const siteDomain = registrableDomain(new URL(homeUrl).hostname);

    for (const p of pages) {
      for (const ph of extractPhones(p, ctx.countryCode)) {
        const prev = phones.get(ph.e164);
        if (!prev || (!prev.clickable && ph.clickable)) phones.set(ph.e164, ph);
      }
      for (const m of p.mailtoLinks)
        for (const e of extractEmails("", [m]))
          if (!emails.has(e)) emails.set(e, { value: e, url: p.url, viaMailto: true });
      for (const e of extractEmails(p.text, p.cfEmails))
        if (!emails.has(e)) emails.set(e, { value: e, url: p.url, viaMailto: false });
      for (const l of p.links) {
        let u: URL;
        try {
          u = new URL(l.href);
        } catch {
          continue;
        }
        const h = u.hostname.toLowerCase();
        const path = u.pathname;
        const add = (type: ContactType) => {
          const canon = canonicalSocialUrl(u);
          if (!socials.has(canon)) socials.set(canon, { type, url: canon, foundOn: p.url });
        };
        if (
          /(^|\.)instagram\.com$/.test(h) &&
          /^\/[A-Za-z0-9._]{2,30}\/?$/.test(path) &&
          !/^\/(p|reel|reels|explore|accounts|stories|direct)\b/.test(path)
        )
          add("INSTAGRAM");
        else if (
          /(^|\.)(facebook\.com|fb\.com)$/.test(h) &&
          path.length > 1 &&
          !/(sharer|share\.php|\/dialog\/|\/plugins\/|\/tr\b|\/login|\/policies|\/help)/.test(path)
        )
          add("FACEBOOK");
        else if (/(^|\.)tiktok\.com$/.test(h) && /^\/@/.test(path)) add("TIKTOK");
        else if (/(^|\.)linkedin\.com$/.test(h) && /^\/(company|in|school)\//.test(path)) add("LINKEDIN");
        else if (
          /(^|\.)(twitter\.com|x\.com)$/.test(h) &&
          /^\/[A-Za-z0-9_]{2,15}\/?$/.test(path) &&
          !/^\/(intent|share|home|search)\b/.test(path)
        )
          add("X");
        else if (/(^|\.)youtube\.com$/.test(h) && /^\/(channel|c|user|@)/.test(path)) add("YOUTUBE");
        else if (/(^|\.)(wa\.me|whatsapp\.com)$/.test(h) || /^api\.whatsapp\.com$/.test(h)) {
          if (!/\/(send)?\/?$/.test(path) || u.searchParams.get("phone") || /^\/\d{6,}/.test(path)) {
            const canon = u.toString();
            if (!whatsapp.has(canon)) whatsapp.set(canon, { url: canon, foundOn: p.url });
          }
        }
      }
    }
    for (const s of schemaAll.sameAs) {
      try {
        const u = new URL(s);
        const h = u.hostname;
        const type: ContactType | null = /instagram\.com$/.test(h)
          ? "INSTAGRAM"
          : /facebook\.com$/.test(h)
            ? "FACEBOOK"
            : /tiktok\.com$/.test(h)
              ? "TIKTOK"
              : /linkedin\.com$/.test(h)
                ? "LINKEDIN"
                : /(twitter|x)\.com$/.test(h)
                  ? "X"
                  : /youtube\.com$/.test(h)
                    ? "YOUTUBE"
                    : null;
        if (type) {
          const canon = canonicalSocialUrl(u);
          if (!socials.has(canon)) socials.set(canon, { type, url: canon, foundOn: homeUrl });
        }
      } catch {
        /* sameAs inválido */
      }
    }
    for (const e of schemaAll.email)
      for (const v of extractEmails("", [e]))
        if (!emails.has(v)) emails.set(v, { value: v, url: homeUrl, viaMailto: false });

    // Prioriza emails del propio dominio
    const sortedEmails = [...emails.values()].sort(
      (a, b) => Number(b.value.endsWith(`@${siteDomain}`)) - Number(a.value.endsWith(`@${siteDomain}`)),
    );
    const isEs = (ctx.countryCode ?? "").toUpperCase() === "ES";
    const allText = pages.map((p) => p.text).join(" \n ");
    // Formularios de contacto: el mismo formulario suele repetirse en todas las páginas;
    // se priorizan las páginas de contacto/cita y se limitan a 2 para no generar ruido.
    const contactForms = pages
      .filter((p) => p.forms.some((f) => f.fields >= 2 && (f.hasTextarea || f.hasEmail)))
      .map((p) => ({ url: p.url, fields: Math.max(...p.forms.map((f) => f.fields)) }))
      .sort(
        (a, b) =>
          Number(/(contact|cita|reserva)/i.test(b.url)) - Number(/(contact|cita|reserva)/i.test(a.url)),
      )
      .slice(0, 2);

    return {
      phones: [...phones.values()].slice(0, 6),
      emails: sortedEmails.slice(0, 5),
      socials: [...socials.values()].slice(0, 10),
      whatsapp: [...whatsapp.values()].slice(0, 3),
      contactPages: uniq(pages.flatMap((p) => p.contactPageLinks)).slice(0, 3),
      contactForms,
      bookingLinks: [
        ...pages.flatMap((p) => p.bookingSignals),
        // Un formulario en una página de cita/reserva también es un sistema de solicitud de cita
        ...contactForms
          .filter((f) => /(cita|reserva|booking|appointment)/i.test(new URL(f.url).pathname))
          .map((f) => ({ url: f.url, label: "Formulario de cita/reserva" })),
      ].slice(0, 5),
      menuLinks: pages.flatMap((p) => p.menuLinks).slice(0, 5),
      hasMapEmbed: pages.some((p) => p.hasMapEmbed),
      addressTexts: extractAddressTexts(allText),
      postalCodes: isEs ? extractSpanishPostalCodes(allText) : [],
      hoursTexts: extractHoursTexts(allText),
      schemaOrg: schemaAll,
      copyrightYears: uniq(pages.flatMap((p) => extractCopyrightYears(p.text))),
      datedMentions: pages.flatMap((p) => extractDatedMentions(p.text, p.url, year)).slice(0, 6),
      staleNotices: pages.flatMap((p) => extractStaleNotices(p.text, p.url)).slice(0, 4),
      textSample: pages[0].text.slice(0, 400),
    };
  }

  // ------------------------------------------------------------------ hallazgos

  private securityFindings(
    finalUrl: URL,
    res: SafeResponse,
    net: { httpRedirectsToHttps: boolean | null; httpsAvailable: boolean | null },
    findings: Finding[],
  ) {
    if (finalUrl.protocol === "http:") {
      if (net.httpsAvailable) {
        findings.push(
          finding(
            "HTTPS_NOT_ENFORCED",
            "SECURITY",
            "MEDIUM",
            "La web no fuerza HTTPS",
            "Existe versión HTTPS, pero la web se sirve por HTTP y los navegadores la marcan como «No segura».",
            [ev("URL final", finalUrl.toString())],
          ),
        );
      } else if (!findings.some((f) => f.code === "HTTPS_NOT_WORKING")) {
        findings.push(
          finding(
            "NO_HTTPS",
            "SECURITY",
            "HIGH",
            "La web no tiene HTTPS",
            "Los navegadores marcan la web como «No segura» y penaliza la confianza y el SEO.",
            [ev("URL final", finalUrl.toString())],
          ),
        );
      }
    } else {
      if (net.httpRedirectsToHttps === false) {
        findings.push(
          finding(
            "HTTP_NOT_REDIRECTED",
            "SECURITY",
            "LOW",
            "La versión HTTP no redirige a HTTPS",
            "Quien escriba la dirección sin https puede ver la versión no segura.",
            [ev("Comprobación", `http://${finalUrl.host}/`)],
          ),
        );
      }
      const validTo = res.tls?.validTo ? Date.parse(res.tls.validTo) : NaN;
      if (Number.isFinite(validTo)) {
        const days = Math.floor((validTo - this.opts.now().getTime()) / 86_400_000);
        if (days >= 0 && days < 21) {
          findings.push(
            finding(
              "TLS_CERT_EXPIRING",
              "SECURITY",
              "MEDIUM",
              `El certificado HTTPS caduca en ${days} días`,
              "Si no se renueva, los navegadores mostrarán un aviso de seguridad.",
              [ev("Válido hasta", res.tls?.validTo)],
            ),
          );
        }
      }
    }
    if (res.redirectChain.length > 3) {
      findings.push(
        finding(
          "EXCESSIVE_REDIRECTS",
          "PERFORMANCE",
          "LOW",
          "Demasiadas redirecciones",
          "Cada redirección retrasa la carga.",
          [ev("Cadena", [...res.redirectChain.map((r) => `${r.status} ${r.url}`), res.url].join(" → "))],
        ),
      );
    }
  }

  private performanceFindings(
    res: SafeResponse,
    net: {
      heavyImages: { url: string; bytes?: number }[];
      brokenResources: { url: string; status?: number; error?: string }[];
      brokenImages: { url: string; status?: number; error?: string }[];
      brokenLinks: { url: string; status?: number; error?: string }[];
      deadDomains: string[];
      hasFavicon: boolean;
    },
    findings: Finding[],
  ) {
    const total = res.totalMs;
    if (total > 6000)
      findings.push(
        finding(
          "SLOW_RESPONSE",
          "PERFORMANCE",
          "HIGH",
          "La web tarda mucho en responder",
          `La descarga del HTML tardó ${(total / 1000).toFixed(1)} s (sin contar imágenes ni scripts).`,
          [
            ev("Tiempo total HTML", `${total} ms`, res.url),
            ev("Tiempo hasta primer byte", `${res.ttfbMs} ms`),
          ],
        ),
      );
    else if (total > 3000)
      findings.push(
        finding(
          "SLOW_RESPONSE",
          "PERFORMANCE",
          "MEDIUM",
          "La web responde lenta",
          `La descarga del HTML tardó ${(total / 1000).toFixed(1)} s.`,
          [
            ev("Tiempo total HTML", `${total} ms`, res.url),
            ev("Tiempo hasta primer byte", `${res.ttfbMs} ms`),
          ],
        ),
      );
    const htmlBytes = res.body?.length ?? 0;
    if (htmlBytes > 1_500_000)
      findings.push(
        finding(
          "LARGE_HTML",
          "PERFORMANCE",
          "LOW",
          "HTML muy pesado",
          `La página pesa ${(htmlBytes / 1e6).toFixed(1)} MB solo en HTML.`,
          [ev("Tamaño HTML", `${htmlBytes} bytes`, res.url)],
        ),
      );
    if (net.heavyImages.length)
      findings.push(
        finding(
          "HEAVY_IMAGES",
          "PERFORMANCE",
          net.heavyImages.length >= 3 ? "MEDIUM" : "LOW",
          "Imágenes muy pesadas",
          "Imágenes de más de 1 MB ralentizan la carga, sobre todo en móvil.",
          net.heavyImages
            .slice(0, 5)
            .map((i) => ev("Imagen", `${((i.bytes ?? 0) / 1e6).toFixed(1)} MB`, i.url)),
        ),
      );
    if (net.brokenLinks.length)
      findings.push(
        finding(
          "BROKEN_INTERNAL_LINKS",
          "UX",
          net.brokenLinks.length >= 3 ? "HIGH" : "MEDIUM",
          `${net.brokenLinks.length} enlace(s) interno(s) roto(s)`,
          "Enlaces de la propia web que devuelven error.",
          net.brokenLinks
            .slice(0, 6)
            .map((b) => ev("Enlace roto", b.status ? `HTTP ${b.status}` : b.error, b.url)),
        ),
      );
    if (net.brokenImages.length)
      findings.push(
        finding(
          "BROKEN_IMAGES",
          "UX",
          "MEDIUM",
          `${net.brokenImages.length} imagen(es) rota(s)`,
          "Imágenes que no cargan.",
          net.brokenImages
            .slice(0, 6)
            .map((b) => ev("Imagen", b.status ? `HTTP ${b.status}` : b.error, b.url)),
        ),
      );
    if (net.brokenResources.length)
      findings.push(
        finding(
          "MISSING_RESOURCES",
          "UX",
          "MEDIUM",
          "Recursos (CSS/JS) que no cargan",
          "Hojas de estilo o scripts que devuelven error; pueden romper el diseño o funciones.",
          net.brokenResources
            .slice(0, 6)
            .map((b) => ev("Recurso", b.status ? `HTTP ${b.status}` : b.error, b.url)),
        ),
      );
    if (net.deadDomains.length)
      findings.push(
        finding(
          "DEAD_EXTERNAL_DOMAINS",
          "FRESHNESS",
          "MEDIUM",
          "Enlaces a dominios que ya no existen",
          "La web enlaza a dominios que no resuelven en DNS: señal de contenido no mantenido.",
          net.deadDomains.map((d) => ev("Dominio desaparecido", d)),
          { confidence: "MEDIUM" },
        ),
      );
    if (!net.hasFavicon)
      findings.push(
        finding(
          "NO_FAVICON",
          "UX",
          "LOW",
          "Sin favicon",
          "La web no tiene icono en la pestaña del navegador.",
          [],
        ),
      );
  }

  private seoFindings(home: PageData, pages: PageData[], extraction: WebsiteExtraction, findings: Finding[]) {
    const title = home.title ?? "";
    if (!title)
      findings.push(
        finding(
          "MISSING_TITLE",
          "SEO",
          "MEDIUM",
          "La portada no tiene título (<title>)",
          "El título es lo que aparece en Google y en la pestaña del navegador.",
          [ev("URL", home.url)],
        ),
      );
    else if (
      /^(home|inicio|index|untitled|sin t[ií]tulo|mi sitio|my site|welcome|bienvenid[oa]s?)$/i.test(
        title.trim(),
      ) ||
      title.length < 8
    ) {
      findings.push(
        finding(
          "GENERIC_TITLE",
          "SEO",
          "LOW",
          "Título de la portada genérico o muy corto",
          "Un título descriptivo (negocio + actividad + ciudad) mejora el SEO local.",
          [ev("Título actual", title, home.url)],
        ),
      );
    } else if (title.length > 70)
      findings.push(
        finding(
          "LONG_TITLE",
          "SEO",
          "LOW",
          "Título demasiado largo",
          "Google recorta títulos de más de ~60-70 caracteres.",
          [ev("Título actual", title, home.url)],
        ),
      );
    if (!home.metaDescription)
      findings.push(
        finding(
          "MISSING_META_DESCRIPTION",
          "SEO",
          "LOW",
          "Sin meta descripción",
          "Google mostrará un fragmento automático, normalmente menos atractivo.",
          [ev("URL", home.url)],
        ),
      );
    if (home.headingCounts.h1 === 0)
      findings.push(
        finding(
          "NO_H1",
          "SEO",
          "LOW",
          "La portada no tiene encabezado principal (H1)",
          "Estructura de encabezados mejorable para SEO y accesibilidad.",
          [ev("URL", home.url)],
        ),
      );
    else if (home.headingCounts.h1 > 2)
      findings.push(
        finding(
          "MULTIPLE_H1",
          "SEO",
          "INFO",
          `La portada tiene ${home.headingCounts.h1} encabezados H1`,
          "Normalmente se recomienda un único H1.",
          home.h1.slice(0, 3).map((h) => ev("H1", h)),
        ),
      );
    if (!home.lang)
      findings.push(
        finding(
          "MISSING_LANG",
          "ACCESSIBILITY",
          "LOW",
          "No se declara el idioma de la página",
          "El atributo lang ayuda a lectores de pantalla y buscadores.",
          [ev("URL", home.url)],
        ),
      );
    if (home.robotsMeta && /noindex/.test(home.robotsMeta))
      findings.push(
        finding(
          "NOINDEX",
          "SEO",
          "HIGH",
          "La portada indica a Google que no la indexe (noindex)",
          "La web no aparecerá en los resultados de búsqueda.",
          [ev("meta robots", home.robotsMeta, home.url)],
        ),
      );
    const hasLocalSchema = extraction.schemaOrg.types.some((t) =>
      /LocalBusiness|Restaurant|Store|Organization|Dentist|Physician|Hotel|AutoRepair|BeautySalon|HairSalon|LegalService|MedicalBusiness|HealthClub|FoodEstablishment|ProfessionalService/i.test(
        t,
      ),
    );
    if (!hasLocalSchema)
      findings.push(
        finding(
          "NO_LOCAL_SCHEMA",
          "SEO",
          "LOW",
          "Sin datos estructurados de negocio local (schema.org)",
          "Los datos estructurados ayudan a Google a entender dirección, horario y teléfono.",
          [ev("Tipos schema.org encontrados", extraction.schemaOrg.types.join(", ") || "ninguno")],
        ),
      );
    void pages;
  }

  private mobileFindings(home: PageData, horizontalOverflow: boolean | null, findings: Finding[]) {
    if (!home.viewport) {
      findings.push(
        finding(
          "NO_VIEWPORT",
          "MOBILE",
          "HIGH",
          "Sin etiqueta viewport: probablemente no se adapta al móvil",
          "Sin meta viewport, los móviles muestran la versión de escritorio reducida. (Conclusión inferida a partir del HTML.)",
          [ev("meta viewport", "no encontrada", home.url)],
          { provenance: "INFERRED", confidence: "HIGH" },
        ),
      );
    } else if (home.fixedWidthViewport) {
      findings.push(
        finding(
          "FIXED_WIDTH_VIEWPORT",
          "MOBILE",
          "HIGH",
          "Viewport de ancho fijo: diseño no responsive",
          "La web fuerza un ancho fijo en móviles.",
          [ev("meta viewport", home.viewport, home.url)],
        ),
      );
    } else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(home.viewport)) {
      findings.push(
        finding(
          "ZOOM_DISABLED",
          "ACCESSIBILITY",
          "LOW",
          "La web impide hacer zoom en móvil",
          "Dificulta la lectura a personas con baja visión.",
          [ev("meta viewport", home.viewport, home.url)],
        ),
      );
    }
    if (horizontalOverflow)
      findings.push(
        finding(
          "HORIZONTAL_OVERFLOW",
          "MOBILE",
          "HIGH",
          "La página se desborda horizontalmente en móvil",
          "Medido con navegador a 375 px de ancho.",
          [ev("Ancho de prueba", "375 px", home.url)],
        ),
      );
    if (home.tableLayout)
      findings.push(
        finding(
          "TABLE_LAYOUT",
          "MOBILE",
          "MEDIUM",
          "Maquetación basada en tablas (técnica antigua)",
          "Suele indicar un diseño antiguo difícil de adaptar a móvil. (Inferido del HTML.)",
          [ev("URL", home.url)],
          { provenance: "INFERRED", confidence: "MEDIUM" },
        ),
      );
    if (home.usesFlash)
      findings.push(
        finding(
          "USES_FLASH",
          "MOBILE",
          "HIGH",
          "La web usa Flash",
          "Flash no funciona en ningún navegador actual.",
          [ev("URL", home.url)],
        ),
      );
    if (home.deprecatedTags.length)
      findings.push(
        finding(
          "DEPRECATED_HTML",
          "UX",
          home.deprecatedTags.some((t) => /frame/.test(t)) ? "HIGH" : "LOW",
          "HTML obsoleto",
          "Etiquetas en desuso que indican un sitio antiguo.",
          [ev("Etiquetas", home.deprecatedTags.map((t) => `<${t}>`).join(", "), home.url)],
        ),
      );
  }

  private accessibilityFindings(pages: PageData[], findings: Finding[]) {
    const home = pages[0];
    const imgs = home.images.length;
    const noAlt = home.a11y.imagesWithoutAlt;
    const items: EvidenceItem[] = [];
    if (noAlt > 0) items.push(ev("Imágenes sin texto alternativo (alt)", `${noAlt} de ${imgs}`, home.url));
    if (home.a11y.inputsWithoutLabel > 0)
      items.push(ev("Campos de formulario sin etiqueta", String(home.a11y.inputsWithoutLabel), home.url));
    if (home.a11y.linksWithoutText > 0)
      items.push(ev("Enlaces sin texto", String(home.a11y.linksWithoutText), home.url));
    if (home.a11y.buttonsWithoutName > 0)
      items.push(ev("Botones sin nombre accesible", String(home.a11y.buttonsWithoutName), home.url));
    if (!items.length) return;
    const serious = imgs >= 3 && noAlt / imgs > 0.5;
    findings.push(
      finding(
        "ACCESSIBILITY_BASIC",
        "ACCESSIBILITY",
        serious ? "MEDIUM" : "LOW",
        "Problemas básicos de accesibilidad",
        "Comprobaciones automáticas básicas (no sustituyen una auditoría de accesibilidad completa).",
        items,
      ),
    );
  }

  private techStackFindings(home: PageData, findings: Finding[], base: Partial<WebsiteAuditResult>) {
    const tech: Record<string, string> = {};
    const gen = home.generator ?? "";
    const wp = /wordpress\s*([\d.]+)?/i.exec(gen);
    if (wp) tech.cms = `WordPress${wp[1] ? ` ${wp[1]}` : ""}`;
    else if (/joomla/i.test(gen)) tech.cms = gen;
    else if (/wix\.com/i.test(gen)) tech.cms = "Wix";
    else if (/drupal/i.test(gen)) tech.cms = gen;
    else if (home.scripts.some((s) => /wp-content|wp-includes/.test(s))) tech.cms = "WordPress";
    const jq = home.scripts
      .map((s) => /jquery[.-]?(\d+\.\d+(\.\d+)?)?(\.min)?\.js(\?ver=(\d+\.\d+(\.\d+)?))?/i.exec(s))
      .find(Boolean);
    const jqVersion = jq?.[1] ?? jq?.[5];
    if (jqVersion) tech.jquery = jqVersion;
    base.tech = tech;
    if (wp?.[1]) {
      const major = Number(wp[1].split(".")[0]);
      if (major > 0 && major < 6) {
        findings.push(
          finding(
            "OUTDATED_CMS",
            "SECURITY",
            "MEDIUM",
            `WordPress antiguo (versión ${wp[1]})`,
            "Versiones antiguas del CMS suelen indicar falta de mantenimiento y pueden tener vulnerabilidades conocidas. (Inferido de la versión declarada.)",
            [ev("meta generator", gen, home.url)],
            { provenance: "INFERRED", confidence: "MEDIUM" },
          ),
        );
      }
    }
    if (/joomla!?\s*1\.|joomla!?\s*2\./i.test(gen)) {
      findings.push(
        finding(
          "OUTDATED_CMS",
          "SECURITY",
          "MEDIUM",
          "Joomla muy antiguo",
          "Versión sin soporte. (Inferido de la versión declarada.)",
          [ev("meta generator", gen, home.url)],
          { provenance: "INFERRED", confidence: "MEDIUM" },
        ),
      );
    }
    if (jqVersion && Number(jqVersion.split(".")[0]) < 3) {
      findings.push(
        finding(
          "OUTDATED_JQUERY",
          "SECURITY",
          "LOW",
          `jQuery antiguo (${jqVersion})`,
          "Librería desactualizada; indica poco mantenimiento técnico.",
          [ev("Script", jq?.input, home.url)],
          { provenance: "INFERRED", confidence: "MEDIUM" },
        ),
      );
    }
    if (home.mixedContent.length)
      findings.push(
        finding(
          "MIXED_CONTENT",
          "SECURITY",
          "MEDIUM",
          "Contenido mixto (recursos HTTP en página HTTPS)",
          "Los navegadores bloquean o avisan de estos recursos.",
          home.mixedContent.slice(0, 5).map((u) => ev("Recurso inseguro", u)),
        ),
      );
  }

  private contentFindings(
    home: PageData,
    pages: PageData[],
    x: WebsiteExtraction,
    ctx: WebsiteAnalyzerContext,
    findings: Finding[],
  ) {
    const category = ctx.categoryKey ? CATEGORY_BY_KEY.get(ctx.categoryKey) : undefined;
    const totalWords = pages.reduce((s, p) => s + p.wordCount, 0);
    if (home.wordCount < 30)
      findings.push(
        finding(
          "EMPTY_PAGE",
          "CONTENT",
          "HIGH",
          "La portada casi no tiene contenido",
          `Solo ${home.wordCount} palabras visibles en la portada.`,
          [ev("Palabras en portada", String(home.wordCount), home.url)],
        ),
      );
    else if (totalWords < 150)
      findings.push(
        finding(
          "THIN_CONTENT",
          "CONTENT",
          "MEDIUM",
          "Muy poco contenido",
          `Solo ${totalWords} palabras en ${pages.length} página(s) analizada(s).`,
          [ev("Palabras totales", String(totalWords))],
        ),
      );

    const hasPhone = x.phones.length > 0;
    const hasEmail = x.emails.length > 0;
    const hasForm = x.contactForms.length > 0;
    const hasWa = x.whatsapp.length > 0;
    if (!hasPhone && !hasEmail && !hasForm && !hasWa) {
      findings.push(
        finding(
          "NO_CONTACT_METHOD",
          "CONTACT",
          "HIGH",
          "No se encuentra ninguna forma de contacto en la web",
          "No hay teléfono, email, formulario ni WhatsApp en las páginas analizadas.",
          [ev("Páginas analizadas", pages.map((p) => p.url).join(" | "))],
        ),
      );
    } else {
      if (!hasPhone)
        findings.push(
          finding(
            "NO_PHONE_ON_SITE",
            "CONTACT",
            "MEDIUM",
            "La web no muestra teléfono",
            "Para un negocio local, el teléfono visible es clave para convertir visitas en clientes.",
            [ev("Páginas analizadas", String(pages.length))],
          ),
        );
      else if (!x.phones.some((p) => p.clickable))
        findings.push(
          finding(
            "PHONE_NOT_CLICKABLE",
            "CONTACT",
            "LOW",
            "El teléfono no es clicable",
            "En móvil no se puede llamar con un toque (falta enlace tel:).",
            x.phones.slice(0, 2).map((p) => ev("Teléfono en texto", p.national, p.url)),
          ),
        );
    }
    if (!home.ctaTexts.length)
      findings.push(
        finding(
          "NO_CTA",
          "UX",
          "LOW",
          "No se detecta una llamada a la acción clara",
          "No se han encontrado botones o enlaces tipo «Reservar», «Llamar», «Contactar» o «Pedir cita» en la portada. (Inferido.)",
          [ev("URL", home.url)],
          { provenance: "INFERRED", confidence: "MEDIUM" },
        ),
      );
    const hasAddress =
      x.addressTexts.length > 0 ||
      x.postalCodes.length > 0 ||
      x.schemaOrg.streetAddress?.length ||
      x.schemaOrg.postalCode?.length;
    if (!hasAddress && !x.hasMapEmbed)
      findings.push(
        finding(
          "NO_ADDRESS_OR_MAP",
          "CONTENT",
          "MEDIUM",
          "La web no muestra dirección ni mapa",
          "Para un negocio con local, la ubicación es información esencial.",
          [ev("Páginas analizadas", String(pages.length))],
          { confidence: "MEDIUM" },
        ),
      );
    const hasHours = x.hoursTexts.length > 0 || (x.schemaOrg.openingHours?.length ?? 0) > 0;
    if (!hasHours)
      findings.push(
        finding(
          "NO_HOURS_ON_SITE",
          "CONTENT",
          "LOW",
          "No se encuentran horarios en la web",
          "Los clientes buscan el horario antes de ir o llamar.",
          [ev("Páginas analizadas", String(pages.length))],
          { confidence: "MEDIUM" },
        ),
      );
    if (category?.needsBooking && x.bookingLinks.length === 0) {
      findings.push(
        finding(
          "NO_ONLINE_BOOKING",
          "UX",
          "MEDIUM",
          "No se detecta reserva o cita online",
          `Para la categoría «${category.label.es}» es habitual reservar o pedir cita online. (Inferencia basada en la categoría del negocio.)`,
          [ev("Páginas analizadas", String(pages.length))],
          { provenance: "INFERRED", confidence: "MEDIUM" },
        ),
      );
    }
    if (category?.needsMenu) {
      if (x.menuLinks.length === 0)
        findings.push(
          finding(
            "NO_MENU",
            "CONTENT",
            "MEDIUM",
            "No se encuentra la carta/menú en la web",
            "Para hostelería, la carta es uno de los contenidos más buscados. (Inferencia basada en la categoría.)",
            [ev("Páginas analizadas", String(pages.length))],
            { provenance: "INFERRED", confidence: "MEDIUM" },
          ),
        );
      else if (x.menuLinks.every((m) => m.isPdf))
        findings.push(
          finding(
            "MENU_PDF_ONLY",
            "UX",
            "LOW",
            "La carta solo está en PDF",
            "Un PDF se lee mal en móvil y no posiciona en buscadores.",
            x.menuLinks.slice(0, 2).map((m) => ev("Carta en PDF", m.url)),
            { provenance: "INFERRED", confidence: "MEDIUM" },
          ),
        );
    }
    if (x.socials.length === 0)
      findings.push(
        finding(
          "NO_SOCIAL_LINKS",
          "PRESENCE",
          "INFO",
          "La web no enlaza redes sociales",
          "Dato informativo.",
          [],
        ),
      );
    const internalLinks = uniq(home.links.filter((l) => l.internal).map((l) => l.href)).length;
    if (!home.hasNav && internalLinks < 3)
      findings.push(
        finding(
          "LIMITED_NAVIGATION",
          "UX",
          "LOW",
          "Navegación muy limitada",
          `Solo ${internalLinks} enlace(s) interno(s) en la portada.`,
          [ev("URL", home.url)],
          { confidence: "MEDIUM" },
        ),
      );
    const stock = uniq(pages.flatMap((p) => p.images.map((i) => i.src)).filter((s) => STOCK_RE.test(s)));
    if (stock.length >= 3)
      findings.push(
        finding(
          "STOCK_IMAGES",
          "CONTENT",
          "LOW",
          "Uso abundante de imágenes de stock",
          "Varias imágenes provienen de bancos de imágenes genéricas. (Inferido por el nombre del archivo.)",
          stock.slice(0, 3).map((s) => ev("Imagen", s)),
          { provenance: "INFERRED", confidence: "LOW" },
        ),
      );
  }
}
