import { CATEGORY_BY_KEY } from "@/domain/categories";
import type { Finding, RecommendationItem, WebsiteStatus } from "@/domain/types";
import { SEVERITY_ORDER } from "@/analysis/findings";

/**
 * Motor de recomendaciones: cada recomendación nace de hallazgos concretos (triggeredBy).
 * No se genera ninguna recomendación sin evidencia que la justifique.
 */

interface Rule {
  code: string;
  productType: string;
  title: string;
  description: string;
  triggers: string[];
}

const RULES: Rule[] = [
  {
    code: "REPLACE_DISCONTINUED_SITE",
    productType: "Página web corporativa",
    title: "Sustituir la web discontinuada de Google Business Profile",
    description:
      "Crear una web propia con dominio propio que reemplace la antigua web *.business.site, con servicios, contacto, mapa y SEO local.",
    triggers: ["GOOGLE_BUSINESS_SITE_DISCONTINUED"],
  },
  {
    code: "RECOVER_SITE",
    productType: "Recuperación / nueva web",
    title: "Recuperar o rehacer la web caída",
    description:
      "Revisar dominio, DNS y hosting; si no es recuperable, crear una web nueva que conserve el dominio.",
    triggers: [
      "WEBSITE_UNREACHABLE",
      "WEBSITE_HTTP_ERROR",
      "DOMAIN_PARKED",
      "EMPTY_RESPONSE",
      "WEBSITE_URL_INVALID",
    ],
  },
  {
    code: "MOBILE_FIRST_REDESIGN",
    productType: "Rediseño responsive",
    title: "Rediseño mobile-first",
    description:
      "La mayoría de búsquedas locales se hacen desde el móvil: rediseñar con un diseño adaptable y moderno.",
    triggers: ["NO_VIEWPORT", "FIXED_WIDTH_VIEWPORT", "HORIZONTAL_OVERFLOW", "TABLE_LAYOUT", "USES_FLASH"],
  },
  {
    code: "HTTPS_SETUP",
    productType: "Seguridad (HTTPS)",
    title: "Configurar HTTPS correctamente",
    description:
      "Instalar/renovar el certificado, forzar la redirección a HTTPS y eliminar contenido mixto para evitar avisos de «No seguro».",
    triggers: [
      "NO_HTTPS",
      "HTTPS_NOT_WORKING",
      "HTTPS_NOT_ENFORCED",
      "TLS_CERT_EXPIRED",
      "TLS_CERT_SELF_SIGNED",
      "TLS_CERT_HOSTNAME_MISMATCH",
      "TLS_ERROR",
      "TLS_CHAIN_INCOMPLETE",
      "TLS_CERT_EXPIRING",
      "MIXED_CONTENT",
      "HTTP_NOT_REDIRECTED",
    ],
  },
  {
    code: "SPEED_OPTIMIZATION",
    productType: "Mejora de velocidad",
    title: "Optimizar la velocidad de carga",
    description: "Optimizar imágenes, reducir peso y redirecciones, y mejorar el hosting o la caché.",
    triggers: ["SLOW_RESPONSE", "HEAVY_IMAGES", "LARGE_HTML", "EXCESSIVE_REDIRECTS"],
  },
  {
    code: "MAINTENANCE_FIXES",
    productType: "Mantenimiento web",
    title: "Reparar enlaces, imágenes y recursos rotos",
    description: "Corregir errores 404 y recursos que no cargan; revisar la web periódicamente.",
    triggers: ["BROKEN_INTERNAL_LINKS", "BROKEN_IMAGES", "MISSING_RESOURCES", "CONSOLE_ERRORS"],
  },
  {
    code: "UNIFY_INFORMATION",
    productType: "Actualización de información",
    title: "Actualizar información de contacto y unificar fuentes",
    description:
      "Revisar teléfono, dirección, horario y estado en la web y en la ficha de Google/Maps para que coincidan.",
    triggers: [
      "PHONE_MISMATCH",
      "ADDRESS_MISMATCH",
      "HOURS_MISMATCH",
      "WEBSITE_HOURS_CONTRADICTORY",
      "STATUS_CONFLICT",
      "PROVIDER_MISSING_PHONE",
      "GOOGLE_LISTING_MISSING_WEBSITE",
      "REVIEW_WRONG_HOURS",
      "REVIEW_WRONG_PHONE",
      "REVIEW_WRONG_ADDRESS",
      "REVIEW_OUTDATED_INFO",
      "REVIEW_CONTRADICTORY_INFO",
    ],
  },
  {
    code: "CONTENT_REFRESH",
    productType: "Actualización de contenidos",
    title: "Actualizar y completar los contenidos",
    description:
      "Retirar avisos y promociones antiguas, sustituir textos de plantilla y completar servicios, fotos e información.",
    triggers: [
      "STALE_COVID_NOTICE",
      "OLD_DATED_CONTENT",
      "SITEMAP_STALE",
      "OLD_COPYRIGHT",
      "DEAD_EXTERNAL_DOMAINS",
      "PLACEHOLDER_CONTENT",
      "UNDER_CONSTRUCTION",
      "THIN_CONTENT",
      "EMPTY_PAGE",
      "REVIEW_SERVICES_NOT_FOUND",
    ],
  },
  {
    code: "ONLINE_BOOKING",
    productType: "Web con reservas",
    title: "Evaluar un sistema de reservas/citas online",
    description:
      "Integrar reserva o cita online en la web (propio o de una plataforma) para reducir llamadas y captar clientes fuera de horario.",
    triggers: ["NO_ONLINE_BOOKING", "REVIEW_ONLINE_BOOKING", "REVIEW_PHONE_ONLY"],
  },
  {
    code: "DIGITAL_MENU",
    productType: "Carta/menú digital",
    title: "Carta/menú digital legible en móvil",
    description: "Publicar la carta en HTML (no solo PDF), fácil de actualizar, con precios y alérgenos.",
    triggers: ["NO_MENU", "MENU_PDF_ONLY", "REVIEW_ONLINE_MENU"],
  },
  {
    code: "CONTACT_SYSTEM",
    productType: "Sistema de contacto",
    title: "Mejorar el contacto y las llamadas a la acción",
    description: "Teléfono clicable, formulario sencillo y botones claros (llamar, reservar, cómo llegar).",
    triggers: [
      "NO_CONTACT_METHOD",
      "NO_PHONE_ON_SITE",
      "PHONE_NOT_CLICKABLE",
      "NO_CTA",
      "REVIEW_HARD_TO_CONTACT",
    ],
  },
  {
    code: "WHATSAPP_INTEGRATION",
    productType: "Integración WhatsApp",
    title: "Integrar WhatsApp como canal de contacto",
    description: "Botón de WhatsApp Business en la web para atender consultas y reservas.",
    triggers: ["NO_CONTACT_METHOD", "REVIEW_HARD_TO_CONTACT", "REVIEW_PHONE_ONLY"],
  },
  {
    code: "LOCAL_SEO",
    productType: "SEO local",
    title: "SEO local",
    description:
      "Títulos y descripciones optimizados, datos estructurados LocalBusiness, mapa, horarios visibles y ficha de Google coherente.",
    triggers: [
      "MISSING_TITLE",
      "GENERIC_TITLE",
      "MISSING_META_DESCRIPTION",
      "NO_H1",
      "NO_LOCAL_SCHEMA",
      "NOINDEX",
      "NO_ADDRESS_OR_MAP",
      "NO_HOURS_ON_SITE",
    ],
  },
  {
    code: "OWN_DOMAIN",
    productType: "Dominio propio",
    title: "Migrar a un dominio propio",
    description: "Registrar un dominio propio y trasladar la web desde el subdominio gratuito.",
    triggers: ["FREE_SUBDOMAIN"],
  },
  {
    code: "TECH_UPDATE",
    productType: "Actualización técnica",
    title: "Actualizar la base técnica de la web",
    description: "Actualizar CMS y librerías o migrar a una plataforma mantenida.",
    triggers: ["OUTDATED_CMS", "OUTDATED_JQUERY", "DEPRECATED_HTML"],
  },
  {
    code: "ACCESSIBILITY",
    productType: "Accesibilidad",
    title: "Mejoras básicas de accesibilidad",
    description: "Textos alternativos, etiquetas de formulario, zoom habilitado y estructura de encabezados.",
    triggers: ["ACCESSIBILITY_BASIC", "ZOOM_DISABLED", "MISSING_LANG"],
  },
  {
    code: "REAL_PHOTOS",
    productType: "Galería",
    title: "Galería con fotos reales del negocio",
    description: "Sustituir imágenes genéricas de stock por fotos propias.",
    triggers: ["STOCK_IMAGES"],
  },
];

export function buildRecommendations(
  websiteStatus: WebsiteStatus,
  findings: Finding[],
  categoryKey?: string,
): RecommendationItem[] {
  const out: RecommendationItem[] = [];
  const codes = new Set(findings.map((f) => f.code));
  const worst = (trigs: string[]) => {
    const sev = findings.filter((f) => trigs.includes(f.code)).map((f) => SEVERITY_ORDER[f.severity]);
    return sev.length ? Math.min(...sev) : 4;
  };
  const category = categoryKey ? CATEGORY_BY_KEY.get(categoryKey) : undefined;

  if (websiteStatus === "SIN_WEB") {
    const third = findings.find(
      (f) => f.code === "WEBSITE_IS_THIRD_PARTY" || f.code === "DOMAIN_REDIRECTS_TO_THIRD_PARTY",
    );
    const trig = [third?.code ?? "NO_WEBSITE"];
    out.push({
      code: "CORPORATE_WEBSITE",
      productType: "Página web corporativa",
      title: "Crear web corporativa local",
      description: `Crear web corporativa local con información de servicios, contacto, mapa, CTA y SEO local.${third ? ` Actualmente: ${third.title.toLowerCase()}.` : ""}`,
      priority: 1,
      triggeredBy: trig,
    });
    if (category?.needsBooking) {
      out.push({
        code: "WEBSITE_WITH_BOOKING",
        productType: "Web con reservas",
        title: "Incluir reservas/citas online en la nueva web",
        description: `Para «${category.label.es}» es habitual reservar o pedir cita online (inferencia basada en la categoría).`,
        priority: 2,
        triggeredBy: trig,
      });
    }
    if (category?.needsMenu) {
      out.push({
        code: "WEBSITE_WITH_MENU",
        productType: "Carta/menú digital",
        title: "Incluir carta/menú digital",
        description:
          "Carta en HTML, legible en móvil y fácil de actualizar (inferencia basada en la categoría).",
        priority: 2,
        triggeredBy: trig,
      });
    }
    out.push({
      code: "LANDING_PAGE",
      productType: "Landing page",
      title: "Alternativa económica: landing page",
      description:
        "Si el presupuesto es limitado, una landing de una página con contacto, horario, mapa y reseñas.",
      priority: 3,
      triggeredBy: trig,
    });
  }

  for (const rule of RULES) {
    const trig = rule.triggers.filter((t) => codes.has(t));
    if (!trig.length) continue;
    if (
      websiteStatus === "SIN_WEB" &&
      ["LOCAL_SEO", "CONTACT_SYSTEM", "DIGITAL_MENU", "ONLINE_BOOKING"].includes(rule.code)
    )
      continue;
    const priority = Math.min(5, worst(trig) + 1);
    out.push({
      code: rule.code,
      productType: rule.productType,
      title: rule.title,
      description: rule.description,
      priority,
      triggeredBy: trig,
    });
  }
  return out.sort((a, b) => a.priority - b.priority);
}
