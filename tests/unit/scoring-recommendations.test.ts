import { describe, expect, it } from "vitest";
import { RuleBasedScoringEngine } from "@/analysis/scoring/engine";
import { buildRecommendations } from "@/analysis/recommendations/engine";
import { finding } from "@/analysis/findings";
import type { ScoringInput } from "@/domain/ports";
import type { NormalizedPlace } from "@/domain/types";

const engine = new RuleBasedScoringEngine();

const basePlace: NormalizedPlace = {
  provider: "google_places",
  providerPlaceId: "p1",
  name: "Peluquería Ana",
  types: ["hair_salon"],
  userRatingCount: 150,
  rating: 4.8,
  nationalPhone: "954 00 00 00",
  businessStatus: "OPERATIONAL",
  attribution: "Google Maps",
};

function input(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    place: basePlace,
    categoryKey: "peluquerias_estetica",
    websiteStatus: "SIN_WEB",
    websiteSource: "none",
    audit: null,
    findings: [finding("NO_WEBSITE", "PRESENCE", "HIGH", "No se ha encontrado web oficial verificable", "")],
    contacts: [
      {
        type: "PHONE",
        value: "+34954000000",
        source: "google_places",
        provenance: "OBSERVED",
        confidence: "HIGH",
      },
    ],
    reviewsAnalyzed: 5,
    searchChecked: false,
    providerWebsiteReliability: 0.85,
    consistencyScore: null,
    ...overrides,
  };
}

describe("RuleBasedScoringEngine", () => {
  it("negocio activo sin web (Google) → alta oportunidad, con desglose explicable", () => {
    const s = engine.score(input());
    expect(s.level).toBe("HIGH");
    expect(s.opportunityScore).toBeGreaterThanOrEqual(60);
    const sum = s.contributions.reduce((a, c) => a + c.points, 0);
    expect(Math.round(sum)).toBe(s.opportunityScore);
    expect(s.contributions.some((c) => c.reason.includes("No se ha encontrado web"))).toBe(true);
  });

  it("la valoración (estrellas) no afecta al score", () => {
    const a = engine.score(input({ place: { ...basePlace, rating: 4.9 } }));
    const b = engine.score(input({ place: { ...basePlace, rating: 3.1 } }));
    expect(a.opportunityScore).toBe(b.opportunityScore);
  });

  it("«sin web» basado solo en OSM sin contraste → evidencia insuficiente", () => {
    const s = engine.score(
      input({
        place: { ...basePlace, provider: "osm", userRatingCount: undefined },
        providerWebsiteReliability: 0.45,
        reviewsAnalyzed: 0,
      }),
    );
    expect(s.level).toBe("INSUFFICIENT_EVIDENCE");
    expect(s.levelReason).toMatch(/OpenStreetMap|proveedor/);
  });

  it("negocio cerrado permanentemente → score 0 y nivel bajo", () => {
    const s = engine.score(input({ place: { ...basePlace, businessStatus: "CLOSED_PERMANENTLY" } }));
    expect(s.opportunityScore).toBe(0);
    expect(s.level).toBe("LOW");
  });

  it("entidad pública → nivel bajo con motivo", () => {
    const s = engine.score(
      input({
        findings: [
          ...input().findings,
          finding("PROBABLE_PUBLIC_ENTITY", "PRESENCE", "INFO", "Posible entidad pública", ""),
        ],
      }),
    );
    expect(s.level).toBe("LOW");
  });

  it("web aceptable con mejoras menores → oportunidad baja (no infla problemas menores)", () => {
    const s = engine.score(
      input({
        websiteStatus: "WEB_ACEPTABLE",
        websiteSource: "provider",
        findings: [
          finding("MISSING_META_DESCRIPTION", "SEO", "LOW", "Sin meta descripción", ""),
          finding("NO_FAVICON", "UX", "LOW", "Sin favicon", ""),
        ],
        place: { ...basePlace, userRatingCount: 5 },
      }),
    );
    expect(s.level).toBe("LOW");
  });
});

describe("buildRecommendations", () => {
  it("sin web → web corporativa + reservas para categorías que lo necesitan", () => {
    const recs = buildRecommendations(
      "SIN_WEB",
      [finding("NO_WEBSITE", "PRESENCE", "HIGH", "x", "")],
      "peluquerias_estetica",
    );
    expect(recs[0].code).toBe("CORPORATE_WEBSITE");
    expect(recs.map((r) => r.code)).toContain("WEBSITE_WITH_BOOKING");
  });
  it("cada recomendación está vinculada a hallazgos; sin hallazgos no hay recomendaciones", () => {
    expect(buildRecommendations("WEB_ACEPTABLE", [], "tiendas")).toEqual([]);
    const recs = buildRecommendations("WEB_FUNCIONAL_CON_PROBLEMAS", [
      finding("NO_VIEWPORT", "MOBILE", "HIGH", "x", ""),
      finding("PHONE_MISMATCH", "CONSISTENCY", "MEDIUM", "y", ""),
    ]);
    expect(recs.map((r) => r.code).sort()).toEqual(["MOBILE_FIRST_REDESIGN", "UNIFY_INFORMATION"]);
    expect(recs.every((r) => r.triggeredBy.length > 0)).toBe(true);
  });
});
