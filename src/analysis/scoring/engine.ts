import { SCORING_CONFIG, type ScoringConfig } from "@/config/scoring";
import { CATEGORY_BY_KEY } from "@/domain/categories";
import type { ScoringEngine, ScoringInput } from "@/domain/ports";
import type { Finding, OpportunityLevel, ScoreBreakdown, ScoreContribution } from "@/domain/types";
import { TECHNICAL_CATEGORIES, CONTENT_CATEGORIES } from "@/domain/types";

const STRONG_REVIEW = new Set([
  "REVIEW_WRONG_HOURS",
  "REVIEW_WRONG_PHONE",
  "REVIEW_WRONG_ADDRESS",
  "REVIEW_OUTDATED_INFO",
  "REVIEW_ONLINE_MENU",
]);

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));

/**
 * Motor de scoring explicable. Devuelve el score global, 5 componentes 0-100 y la lista
 * de contribuciones (+N motivo) que lo explican.
 */
export class RuleBasedScoringEngine implements ScoringEngine {
  constructor(private readonly cfg: ScoringConfig = SCORING_CONFIG) {}

  score(input: ScoringInput): ScoreBreakdown {
    const cfg = this.cfg;
    const contributions: ScoreContribution[] = [];
    const notes: string[] = [];
    const f = input.findings;
    const has = (code: string) => f.some((x) => x.code === code);
    const category = input.categoryKey ? CATEGORY_BY_KEY.get(input.categoryKey) : undefined;

    // ---------------- Web
    let websitePts = 0;
    const thirdParty = f.find(
      (x) => x.code === "WEBSITE_IS_THIRD_PARTY" || x.code === "DOMAIN_REDIRECTS_TO_THIRD_PARTY",
    );
    switch (input.websiteStatus) {
      case "SIN_WEB":
        websitePts = cfg.website.noWebsite;
        contributions.push({
          points: websitePts,
          component: "website",
          reason: thirdParty
            ? `Sin web propia (${thirdParty.title.toLowerCase()})`
            : "No se ha encontrado web oficial",
          findingCodes: [thirdParty?.code ?? "NO_WEBSITE"],
        });
        break;
      case "WEB_CAIDA": {
        websitePts = cfg.website.websiteDown;
        const cause = f.find((x) => x.category === "AVAILABILITY" && x.severity === "CRITICAL");
        contributions.push({
          points: websitePts,
          component: "website",
          reason: `La web publicada no funciona${cause ? ` (${cause.description.toLowerCase()})` : ""}`,
          findingCodes: cause ? [cause.code] : [],
        });
        break;
      }
      case "WEB_FUNCIONAL_CON_PROBLEMAS":
      case "WEB_ACEPTABLE": {
        const webFindings = f.filter(
          (x) =>
            [...TECHNICAL_CATEGORIES, ...CONTENT_CATEGORIES].includes(x.category) ||
            x.code === "FREE_SUBDOMAIN",
        );
        const cap =
          input.websiteStatus === "WEB_ACEPTABLE" ? cfg.website.acceptableCap : cfg.website.problemsCap;
        let acc = 0;
        const sorted = [...webFindings].sort(
          (a, b) => cfg.website.perSeverity[b.severity] - cfg.website.perSeverity[a.severity],
        );
        const minor: Finding[] = [];
        for (const x of sorted) {
          const pts = cfg.website.perSeverity[x.severity];
          if (pts <= 0) continue;
          if (acc >= cap) break;
          const add = Math.min(pts, cap - acc);
          if (x.severity === "LOW") {
            minor.push(x);
            acc += add;
            continue;
          }
          acc += add;
          contributions.push({
            points: Math.round(add * 10) / 10,
            component: "website",
            reason: x.title,
            findingCodes: [x.code],
            inferred: x.provenance === "INFERRED",
          });
        }
        if (minor.length) {
          const pts = Math.round(minor.reduce((s) => s + cfg.website.perSeverity.LOW, 0) * 10) / 10;
          contributions.push({
            points: Math.min(pts, cap),
            component: "website",
            reason: `${minor.length} mejora(s) menor(es) (SEO/UX)`,
            findingCodes: minor.map((m) => m.code),
          });
        }
        websitePts = Math.min(cap, acc);
        if (acc >= cap) notes.push(`Aportación de problemas web limitada a ${cap} puntos.`);
        break;
      }
      case "WEB_NO_VERIFICABLE":
        notes.push("La web no se ha podido verificar: no suma puntos de oportunidad web.");
        break;
    }

    // ---------------- Consistencia / frescura
    let consPts = 0;
    for (const [code, pts] of Object.entries(cfg.consistency.points)) {
      const x = f.find((y) => y.code === code);
      if (!x || consPts >= cfg.consistency.max) continue;
      const add = Math.min(pts, cfg.consistency.max - consPts);
      consPts += add;
      contributions.push({
        points: add,
        component: "consistency",
        reason: x.title,
        findingCodes: [code],
        inferred: x.provenance === "INFERRED",
      });
    }

    // ---------------- Reseñas (señal secundaria)
    let revPts = 0;
    for (const x of f.filter((y) => y.category === "REVIEWS")) {
      if (revPts >= cfg.reviews.max) break;
      const pts = STRONG_REVIEW.has(x.code) ? cfg.reviews.strong : cfg.reviews.weak;
      const add = Math.min(pts, cfg.reviews.max - revPts);
      revPts += add;
      contributions.push({
        points: add,
        component: "consistency",
        reason: x.title,
        findingCodes: [x.code],
        inferred: true,
      });
    }

    // ---------------- Presencia local (actividad, no calidad)
    const reviewsCount = input.place.userRatingCount ?? 0;
    const tier = cfg.presence.tiers.find(([min]) => reviewsCount >= min);
    if (tier) {
      contributions.push({
        points: tier[1],
        component: "presence",
        reason: `Negocio con actividad de clientes (${reviewsCount} reseñas en ${input.place.provider === "google_places" ? "Google" : "el proveedor"})`,
      });
    } else if (input.place.userRatingCount === undefined) {
      notes.push("Actividad de clientes no disponible en este proveedor (no suma ni resta).");
    }
    notes.push(
      "La valoración media (estrellas) no se usa en el score: calidad del negocio ≠ oportunidad de mejora digital.",
    );

    // ---------------- Contactabilidad (poder contactar hace la oportunidad accionable)
    const types = new Set(input.contacts.map((c) => c.type));
    let contactPts = 0;
    if (types.has("PHONE")) {
      contactPts += cfg.contact.phone;
      contributions.push({ points: cfg.contact.phone, component: "contact", reason: "Teléfono disponible" });
    }
    if (types.has("EMAIL")) {
      contactPts += cfg.contact.email;
      contributions.push({
        points: cfg.contact.email,
        component: "contact",
        reason: "Email empresarial publicado",
      });
    }
    if (types.has("CONTACT_FORM") || types.has("WHATSAPP")) {
      contactPts += cfg.contact.formOrWhatsapp;
      contributions.push({
        points: cfg.contact.formOrWhatsapp,
        component: "contact",
        reason: types.has("WHATSAPP") ? "WhatsApp publicado" : "Formulario de contacto",
      });
    }

    // ---------------- Necesidad típica de la categoría (inferencia)
    let needPts = 0;
    if (
      category?.needsBooking &&
      (input.websiteStatus === "SIN_WEB" ||
        input.websiteStatus === "WEB_CAIDA" ||
        has("NO_ONLINE_BOOKING") ||
        has("REVIEW_ONLINE_BOOKING"))
    ) {
      needPts = cfg.need.booking;
      contributions.push({
        points: needPts,
        component: "need",
        reason: `Categoría que suele depender de reservas/citas online (${category.label.es})`,
        inferred: true,
        findingCodes: has("NO_ONLINE_BOOKING") ? ["NO_ONLINE_BOOKING"] : [],
      });
    } else if (
      category?.needsMenu &&
      (input.websiteStatus === "SIN_WEB" ||
        input.websiteStatus === "WEB_CAIDA" ||
        has("NO_MENU") ||
        has("MENU_PDF_ONLY"))
    ) {
      needPts = cfg.need.menu;
      contributions.push({
        points: needPts,
        component: "need",
        reason: `Categoría en la que la carta/menú online es clave (${category.label.es})`,
        inferred: true,
      });
    }

    // ---------------- Penalizaciones
    let total = websitePts + consPts + revPts + (tier?.[1] ?? 0) + contactPts + needPts;
    if (input.place.businessStatus === "CLOSED_TEMPORARILY") {
      total += cfg.penalties.temporarilyClosed;
      contributions.push({
        points: cfg.penalties.temporarilyClosed,
        component: "penalty",
        reason: "Cerrado temporalmente según el proveedor",
      });
    }
    const closedPermanently = input.place.businessStatus === "CLOSED_PERMANENTLY";
    if (closedPermanently) {
      contributions.push({
        points: -total,
        component: "penalty",
        reason: "Cerrado permanentemente según el proveedor",
      });
      total = 0;
    }
    const opportunityScore = clamp(total);

    // ---------------- Componentes 0-100
    const websiteOpportunity = clamp((websitePts / cfg.website.max) * 100);
    const technicalWebsite = input.audit?.technicalScore ?? null;
    const informationConsistency = input.consistencyScore;
    const contactScore = clamp(
      (types.has("PHONE") ? 40 : 0) +
        (types.has("EMAIL") ? 25 : 0) +
        (types.has("CONTACT_FORM") ? 10 : 0) +
        (types.has("WHATSAPP") ? 10 : 0) +
        (types.has("CONTACT_PAGE") ? 5 : 0) +
        (["INSTAGRAM", "FACEBOOK", "TIKTOK", "LINKEDIN", "X", "YOUTUBE"].some((t) => types.has(t as never))
          ? 10
          : 0),
    );

    // ---------------- Confianza de la evidencia
    const confReasons: string[] = [];
    let conf = 35;
    confReasons.push("+35 datos básicos del negocio obtenidos del proveedor");
    const reliability = input.providerWebsiteReliability;
    if (input.websiteStatus === "SIN_WEB") {
      if (thirdParty) {
        conf += 30;
        confReasons.push("+30 la ficha enlaza un perfil de terceros, no una web propia (observado)");
      } else if (input.searchChecked) {
        conf += 30;
        confReasons.push("+30 ausencia de web contrastada con buscador");
      } else if (reliability >= cfg.levels.reliableProviderThreshold) {
        conf += 20;
        confReasons.push(
          "+20 el proveedor no publica web (fuente fiable para este dato); sin contraste en buscador",
        );
      } else {
        confReasons.push(
          "+0 el proveedor no publica web, pero este dato es incompleto en esta fuente y no se ha contrastado con buscador",
        );
      }
    } else if (input.websiteStatus === "WEB_CAIDA") {
      const hi = f.some(
        (x) => x.category === "AVAILABILITY" && x.severity === "CRITICAL" && x.confidence === "HIGH",
      );
      conf += hi ? 35 : 20;
      confReasons.push(
        hi
          ? "+35 fallo de la web comprobado técnicamente (varios intentos)"
          : "+20 fallo de la web comprobado, con confianza media (p. ej. timeouts)",
      );
    } else if (input.websiteStatus === "WEB_NO_VERIFICABLE") {
      confReasons.push("+0 la web no se ha podido verificar");
    } else if (input.audit) {
      conf += input.audit.analysisComplete ? 35 : 15;
      confReasons.push(
        input.audit.analysisComplete ? "+35 auditoría web completa" : "+15 auditoría web parcial",
      );
    }
    if (input.reviewsAnalyzed >= 3) {
      conf += 10;
      confReasons.push(`+10 ${input.reviewsAnalyzed} reseñas analizadas`);
    }
    if (input.place.userRatingCount !== undefined || input.place.nationalPhone) {
      conf += 10;
      confReasons.push("+10 ficha del proveedor con datos de actividad/contacto");
    }
    const evidenceConfidence = clamp(conf);

    // ---------------- Nivel (reglas configurables y explicadas)
    let level: OpportunityLevel;
    let levelReason: string;
    if (closedPermanently) {
      level = "LOW";
      levelReason = "Negocio cerrado permanentemente según el proveedor";
    } else if (has("PROBABLE_PUBLIC_ENTITY")) {
      level = "LOW";
      levelReason =
        "Posible entidad pública (inferido por el nombre): no suele ser un cliente de este tipo de servicios";
    } else if (
      cfg.levels.requireVerifiedNoWebsite &&
      input.websiteStatus === "SIN_WEB" &&
      !thirdParty &&
      !input.searchChecked &&
      reliability < cfg.levels.reliableProviderThreshold
    ) {
      level = "INSUFFICIENT_EVIDENCE";
      levelReason =
        "La ausencia de web se basa solo en un proveedor con datos de web incompletos (p. ej. OpenStreetMap) y no se ha contrastado con buscador. Verifícalo manualmente o configura un buscador / Google Places.";
    } else if (evidenceConfidence < cfg.levels.minConfidence) {
      level = "INSUFFICIENT_EVIDENCE";
      levelReason = `Confianza de la evidencia ${evidenceConfidence} < ${cfg.levels.minConfidence}`;
    } else if (input.websiteStatus === "WEB_NO_VERIFICABLE" && opportunityScore < cfg.levels.high) {
      level = "INSUFFICIENT_EVIDENCE";
      levelReason =
        "No se ha podido verificar la web y el resto de señales no bastan para una prioridad alta";
    } else if (opportunityScore >= cfg.levels.high) {
      level = "HIGH";
      levelReason = `Score ${opportunityScore} ≥ ${cfg.levels.high}`;
    } else if (opportunityScore >= cfg.levels.medium) {
      level = "MEDIUM";
      levelReason = `Score ${opportunityScore} entre ${cfg.levels.medium} y ${cfg.levels.high - 1}`;
    } else {
      level = "LOW";
      levelReason = `Score ${opportunityScore} < ${cfg.levels.medium}`;
    }

    return {
      opportunityScore,
      level,
      levelReason,
      components: {
        websiteOpportunity,
        technicalWebsite,
        informationConsistency,
        digitalContactability: contactScore,
        evidenceConfidence,
      },
      contributions: contributions.filter((c) => c.points !== 0),
      evidenceConfidenceReasons: confReasons,
      notes,
    };
  }
}
