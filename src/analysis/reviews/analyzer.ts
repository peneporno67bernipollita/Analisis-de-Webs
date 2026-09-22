import type { ReviewAnalyzer } from "@/domain/ports";
import type { Confidence, Finding, ReviewInput, ReviewSignal } from "@/domain/types";
import { finding } from "@/analysis/findings";
import { snippetAround, truncate } from "@/shared/text";

/**
 * Detección de señales operativas relacionadas con la presencia digital en reseñas.
 * No es análisis de sentimiento: busca patrones concretos (es/en).
 *
 * Cómo se usan (documentado también en la UI):
 *  - Son SEÑALES SECUNDARIAS. Una reseña no demuestra por sí sola que la web o la ficha estén mal.
 *  - Solo se guarda un fragmento corto (≤160 caracteres) como evidencia, con fecha y valoración;
 *    no se guarda el texto completo ni el autor.
 *  - Google devuelve como máximo 5 reseñas por negocio: la muestra es pequeña.
 */

interface Pattern {
  category: string;
  label: string;
  re: RegExp;
  confidence: Confidence;
  weight: "strong" | "weak";
}

const NEG =
  "(no funciona|no carga|mal|fatal|desactualizad[ao]|antigu[ao]|no existe|ca[ií]da|error|confus[ao]|no aparece|no est[aá]|horrible|p[eé]sima|imposible)";

export const REVIEW_PATTERNS: Pattern[] = [
  {
    category: "WRONG_HOURS",
    label: "Horario online incorrecto",
    re: /(horario (de google |en google |de internet |online |de la web )?(est[aá] |era )?(mal|incorrecto|equivocado|desactualizado)|el horario no coincide|pon[ií]a (que )?(estaba )?abierto|(google|maps|internet|la web) (dice|pone|dec[ií]a|pon[ií]a|indica(ba)?) (que )?(est[aá]|estaba )?abierto|estaba cerrado (y|pero|aunque) (google|internet|la web|maps)|wrong (opening )?hours|hours (are|were) (wrong|incorrect)|listed as open|said (it was|they were) open)/i,
    confidence: "HIGH",
    weight: "strong",
  },
  {
    category: "WRONG_PHONE",
    label: "Teléfono incorrecto",
    re: /((el )?tel[eé]fono (que aparece |de google |de la web )?(est[aá] |es )?(mal|incorrecto|equivocado|no existe|no funciona|desactualizado)|n[uú]mero (est[aá] |es )?(mal|incorrecto|equivocado|no existe)|wrong (phone )?number|number (is|was) (wrong|disconnected))/i,
    confidence: "HIGH",
    weight: "strong",
  },
  {
    category: "WRONG_ADDRESS",
    label: "Dirección incorrecta",
    re: /((la )?direcci[oó]n (est[aá] |es )?(mal|incorrecta|equivocada)|la ubicaci[oó]n (est[aá] |es )?(mal|incorrecta)|(google )?maps (te |nos )?(lleva|llev[oó]) a (otro|otra|un sitio)|se han (mudado|trasladado)|wrong (address|location))/i,
    confidence: "HIGH",
    weight: "strong",
  },
  {
    category: "OUTDATED_INFO",
    label: "Información desactualizada",
    re: /(informaci[oó]n (desactualizada|antigua|incorrecta|err[oó]nea)|no (est[aá]|tienen) (nada )?actualizad[oa]|desactualizad[oa]|outdated|out of date|not up to date)/i,
    confidence: "MEDIUM",
    weight: "strong",
  },
  {
    category: "ONLINE_MENU",
    label: "Carta/menú online distinto o desactualizado",
    re: /((la )?(carta|men[uú]) (online|de (la )?web|de internet|de google)|(la carta|el men[uú]) (no coincide|est[aá] desactualizad|era distint|ten[ií]a otros precios)|precios (de la carta |de la web )?(distintos|diferentes|no coinciden)|(menu|prices) (online|on the website) (was|were|is|are) (different|wrong|outdated))/i,
    confidence: "MEDIUM",
    weight: "strong",
  },
  {
    category: "ONLINE_BOOKING",
    label: "Dificultad para reservar online",
    re: /(no (se )?pued(e|es|en) reservar|reserv(a|ar|as) (online|por internet|por la web)|sistema de reservas|no hay (forma|manera) de reservar|no (tienen|hay) reserva online|couldn'?t book|no online booking|book(ing)? online)/i,
    confidence: "MEDIUM",
    weight: "weak",
  },
  {
    category: "HARD_TO_CONTACT",
    label: "Dificultad para contactar",
    re: /(no (cogen|coge|contestan|contesta|responden|responde|atienden) (el |al )?(tel[eé]fono|llamadas|mensajes|whatsapp|correo|email)|imposible (contactar|hablar con)|dif[ií]cil (contactar|localizar)|nadie (contesta|responde)|no answer|hard to reach|couldn'?t reach|never answer)/i,
    confidence: "HIGH",
    weight: "weak",
  },
  {
    category: "PHONE_ONLY",
    label: "Solo se puede gestionar por teléfono",
    re: /(hay que llamar|tienes que llamar|tuve que llamar|solo (por|se puede por) tel[eé]fono|only by phone|had to call)/i,
    confidence: "MEDIUM",
    weight: "weak",
  },
  {
    category: "WEBSITE",
    label: "Comentarios negativos sobre la web",
    re: new RegExp(
      `((la |su |p[aá]gina )web|website|sitio web)[^.!?]{0,40}${NEG}|${NEG}[^.!?]{0,40}((la |su |p[aá]gina )web|website)`,
      "i",
    ),
    confidence: "MEDIUM",
    weight: "weak",
  },
  {
    category: "SERVICES_NOT_FOUND",
    label: "Servicios anunciados que ya no se ofrecen",
    re: /(ya no (hacen|ofrecen|tienen|venden|sirven)|no (ofrecen|hacen|tienen) lo que (pone|dice|anuncia)|anuncian[^.]{0,30}pero no|no longer (offer|serve|sell))/i,
    confidence: "MEDIUM",
    weight: "weak",
  },
  {
    category: "CONTRADICTORY_INFO",
    label: "Información contradictoria",
    re: /(contradictori[ao]|no coincide con lo que (pone|dice)|pone una cosa y|says one thing)/i,
    confidence: "MEDIUM",
    weight: "weak",
  },
];

export class KeywordReviewAnalyzer implements ReviewAnalyzer {
  analyze(reviews: ReviewInput[]): { signals: ReviewSignal[]; findings: Finding[]; reviewsAnalyzed: number } {
    const signals: ReviewSignal[] = [];
    for (const r of reviews) {
      const text = r.text ?? "";
      for (const p of REVIEW_PATTERNS) {
        const m = p.re.exec(text);
        if (!m) continue;
        signals.push({
          category: p.category,
          label: p.label,
          evidence: truncate(snippetAround(text, m.index, m[0].length, 60), 160),
          source: "google_reviews",
          confidence: p.confidence,
          publishTime: r.publishTime,
          rating: r.rating,
        });
      }
    }
    const byCategory = new Map<string, ReviewSignal[]>();
    for (const s of signals) byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s]);
    const findings: Finding[] = [];
    for (const [category, list] of byCategory) {
      const pattern = REVIEW_PATTERNS.find((p) => p.category === category)!;
      findings.push(
        finding(
          `REVIEW_${category}`,
          "REVIEWS",
          pattern.weight === "strong" ? "MEDIUM" : "LOW",
          `Reseñas: ${pattern.label.toLowerCase()} (${list.length})`,
          "Señal secundaria extraída de reseñas públicas: una reseña no demuestra por sí sola que la información online sea incorrecta.",
          list.slice(0, 3).map((s) => ({
            label: `Reseña${s.publishTime ? ` (${s.publishTime.slice(0, 10)})` : ""}${s.rating ? ` · ${s.rating}★` : ""}`,
            value: s.evidence,
            source: "reviews" as const,
          })),
          {
            provenance: "INFERRED",
            confidence: list.length >= 2 ? "HIGH" : pattern.confidence === "HIGH" ? "MEDIUM" : "LOW",
          },
        ),
      );
    }
    return { signals, findings, reviewsAnalyzed: reviews.length };
  }
}
