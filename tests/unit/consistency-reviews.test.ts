import { describe, expect, it } from "vitest";
import { analyzeConsistency, hoursByDay, intervalsOverlap } from "@/analysis/freshness/consistency";
import { KeywordReviewAnalyzer } from "@/analysis/reviews/analyzer";
import type { WebsiteExtraction } from "@/domain/ports";
import type { NormalizedPlace } from "@/domain/types";

const place: NormalizedPlace = {
  provider: "google_places",
  providerPlaceId: "ChIJtest",
  name: "Bar Ejemplo",
  types: ["bar"],
  postalCode: "41004",
  street: "Calle Sierpes, 10",
  countryCode: "ES",
  nationalPhone: "954 12 34 56",
  internationalPhone: "+34 954 12 34 56",
  businessStatus: "OPERATIONAL",
  openingHours: { periods: [1, 2, 3, 4, 5].map((day) => ({ day, open: "09:00", close: "20:30" })) },
  attribution: "Google Maps",
};

function extraction(partial: Partial<WebsiteExtraction>): WebsiteExtraction {
  return {
    phones: [],
    emails: [],
    socials: [],
    whatsapp: [],
    contactPages: [],
    contactForms: [],
    bookingLinks: [],
    menuLinks: [],
    hasMapEmbed: false,
    addressTexts: [],
    postalCodes: [],
    hoursTexts: [],
    schemaOrg: { types: [] },
    copyrightYears: [],
    datedMentions: [],
    staleNotices: [],
    ...partial,
  };
}

describe("analyzeConsistency", () => {
  it("sin web analizable no hay puntuación (no verificado)", () => {
    expect(analyzeConsistency(place, undefined).score).toBeNull();
  });

  it("teléfono coincidente → sin hallazgo; distinto → conflicto mostrando ambas fuentes", () => {
    const ok = analyzeConsistency(
      place,
      extraction({
        phones: [{ e164: "+34954123456", national: "954 12 34 56", clickable: true, url: "https://x.es" }],
      }),
    );
    expect(ok.findings.find((f) => f.code === "PHONE_MISMATCH")).toBeUndefined();
    const bad = analyzeConsistency(
      place,
      extraction({
        phones: [{ e164: "+34955000000", national: "955 00 00 00", clickable: true, url: "https://x.es" }],
      }),
    );
    const f = bad.findings.find((x) => x.code === "PHONE_MISMATCH")!;
    expect(f).toBeDefined();
    expect(f.evidence.map((e) => e.value)).toEqual(["954 12 34 56", "955 00 00 00"]);
    expect(bad.comparisons.find((c) => c.field === "phone")?.result).toBe("mismatch");
  });

  it("horarios duplicados en la web NO son discrepancia (caso real)", () => {
    const web = [1, 2, 3, 4, 5].flatMap((day) => [
      { day, open: "09:00", close: "20:30" },
      { day, open: "9:00", close: "20:30" },
    ]);
    const r = analyzeConsistency(place, extraction({ schemaOrg: { types: [], openingHours: web } }));
    expect(r.findings.map((f) => f.code)).not.toContain("HOURS_MISMATCH");
  });

  it("horario contradictorio dentro de la web se distingue de una discrepancia con la ficha", () => {
    const web = [
      ...[1, 2, 3, 4, 5].map((day) => ({ day, open: "09:00", close: "20:30" })),
      { day: 5, open: "09:00", close: "19:00" },
    ];
    const r = analyzeConsistency(place, extraction({ schemaOrg: { types: [], openingHours: web } }));
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain("WEBSITE_HOURS_CONTRADICTORY");
    expect(codes).not.toContain("HOURS_MISMATCH");
  });

  it("horario realmente distinto → HOURS_MISMATCH", () => {
    const web = [1, 2, 3, 4, 5].map((day) => ({ day, open: "10:00", close: "14:00" }));
    const r = analyzeConsistency(place, extraction({ schemaOrg: { types: [], openingHours: web } }));
    expect(r.findings.map((f) => f.code)).toContain("HOURS_MISMATCH");
  });

  it("turnos partidos no se consideran solapados", () => {
    expect(intervalsOverlap(["09:00-14:00", "17:00-20:30"])).toBe(false);
    expect(intervalsOverlap(["09:00-19:00", "09:00-20:30"])).toBe(true);
    expect(hoursByDay([{ day: 1, open: "9:00", close: "00:00" }]).get(1)).toBe("09:00-24:00");
  });

  it("señales temporales se formulan como posibles/inferencias", () => {
    const r = analyzeConsistency(
      place,
      extraction({
        staleNotices: [{ kind: "covid", text: "medidas COVID-19", url: "https://x.es" }],
        copyrightYears: [2015],
        datedMentions: [{ year: 2019, text: "Menú de Navidad 2019", url: "https://x.es" }],
      }),
      new Date("2026-09-22"),
    );
    const covid = r.findings.find((f) => f.code === "STALE_COVID_NOTICE")!;
    expect(covid.provenance).toBe("INFERRED");
    expect(covid.title.toLowerCase()).toContain("posible");
    expect(r.findings.find((f) => f.code === "OLD_COPYRIGHT")?.confidence).toBe("LOW");
  });
});

describe("KeywordReviewAnalyzer", () => {
  const analyzer = new KeywordReviewAnalyzer();
  it("detecta problemas operativos de presencia digital con evidencia breve", () => {
    const r = analyzer.analyze([
      {
        text: "Fuimos un lunes y estaba cerrado pero Google decía que estaba abierto. Una pena.",
        rating: 2,
        publishTime: "2026-05-01T10:00:00Z",
      },
      { text: "Imposible reservar online, no cogen el teléfono nunca.", rating: 3 },
      { text: "Comida espectacular, volveremos.", rating: 5 },
    ]);
    const cats = r.signals.map((s) => s.category);
    expect(cats).toContain("WRONG_HOURS");
    expect(cats).toContain("HARD_TO_CONTACT");
    expect(r.signals.every((s) => s.evidence.length <= 160)).toBe(true);
    expect(r.findings.every((f) => f.provenance === "INFERRED")).toBe(true);
    expect(r.reviewsAnalyzed).toBe(3);
  });
  it("no genera señales de reseñas neutras", () => {
    expect(analyzer.analyze([{ text: "Muy buen servicio y precios razonables." }]).signals).toHaveLength(0);
  });
});
