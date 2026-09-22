import { describe, expect, it } from "vitest";
import { normalizeGooglePlace, type GooglePlace } from "@/providers/places/google-places";
import { normalizeOsmElement } from "@/providers/places/osm";
import { parseOsmOpeningHours } from "@/providers/places/osm-opening-hours";
import { csvExporter, sanitizeCell } from "@/export/exporters";
import type { ExportRow } from "@/export/types";
import { hashPassword, verifyPassword } from "@/auth/password";
import { createSessionToken, verifySessionToken } from "@/auth/session";
import { tileCircle, haversineMeters } from "@/shared/geo";
import { redactString } from "@/shared/logger";

describe("Google Places (New) → NormalizedPlace", () => {
  // Estructura según la documentación de Places API (New); valores ficticios SOLO para el test.
  const fixture: GooglePlace = {
    id: "ChIJ_test_place_id",
    displayName: { text: "Taller Test", languageCode: "es" },
    formattedAddress: "C. Test, 1, 41001 Sevilla, España",
    addressComponents: [
      { longText: "1", shortText: "1", types: ["street_number"] },
      { longText: "Calle Test", shortText: "C. Test", types: ["route"] },
      { longText: "Sevilla", shortText: "Sevilla", types: ["locality", "political"] },
      { longText: "Sevilla", shortText: "SE", types: ["administrative_area_level_2", "political"] },
      { longText: "Andalucía", shortText: "AL", types: ["administrative_area_level_1", "political"] },
      { longText: "España", shortText: "ES", types: ["country", "political"] },
      { longText: "41001", shortText: "41001", types: ["postal_code"] },
    ],
    location: { latitude: 37.39, longitude: -5.99 },
    types: ["car_repair", "point_of_interest"],
    primaryType: "car_repair",
    businessStatus: "OPERATIONAL",
    regularOpeningHours: {
      periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 14, minute: 0 } }],
      weekdayDescriptions: ["lunes: 9:00–14:00"],
    },
    reviews: [
      {
        rating: 2,
        text: { text: "El horario de Google está mal", languageCode: "es" },
        publishTime: "2026-01-01T00:00:00Z",
      },
    ],
  };
  it("normaliza dirección, horario y reseñas; no inventa campos ausentes", () => {
    const p = normalizeGooglePlace(fixture);
    expect(p.providerPlaceId).toBe("ChIJ_test_place_id");
    expect(p.city).toBe("Sevilla");
    expect(p.region).toBe("Sevilla");
    expect(p.countryCode).toBe("ES");
    expect(p.postalCode).toBe("41001");
    expect(p.street).toBe("Calle Test, 1");
    expect(p.openingHours?.periods).toEqual([{ day: 1, open: "09:00", close: "14:00" }]);
    expect(p.reviews?.[0].text).toContain("horario");
    expect(p.websiteUri).toBeUndefined();
    expect(p.nationalPhone).toBeUndefined();
    expect(p.email).toBeUndefined();
  });
  it("detecta horario 24/7", () => {
    const p = normalizeGooglePlace({
      ...fixture,
      regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
    });
    expect(p.openingHours?.alwaysOpen).toBe(true);
  });
});

describe("OpenStreetMap", () => {
  it("normaliza etiquetas y usa tipo/id como identificador estable", () => {
    const p = normalizeOsmElement({
      type: "node",
      id: 42,
      lat: 37.38,
      lon: -5.98,
      tags: {
        name: "Peluquería X",
        shop: "hairdresser",
        phone: "+34 954 000 000",
        website: "https://pelux.es",
        "addr:postcode": "41002",
        "contact:instagram": "pelux",
      },
    })!;
    expect(p.providerPlaceId).toBe("node/42");
    expect(p.websiteUri).toBe("https://pelux.es");
    expect(p.socials?.instagram).toBe("pelux");
    expect(p.mapsUrl).toBe("https://www.openstreetmap.org/node/42");
  });
  it("ignora elementos sin nombre", () => {
    expect(normalizeOsmElement({ type: "node", id: 1, tags: { shop: "bakery" } })).toBeNull();
  });
  it("parsea opening_hours comunes y no inventa horarios si no lo entiende", () => {
    // 5 días × 2 turnos + sábado = 11 periodos
    expect(parseOsmOpeningHours("Mo-Fr 09:00-14:00,17:00-20:00; Sa 10:00-14:00")?.periods).toHaveLength(11);
    expect(parseOsmOpeningHours("24/7")?.alwaysOpen).toBe(true);
    expect(parseOsmOpeningHours("Mo-Fr 09:00-14:00; PH off")?.periods).toHaveLength(5);
    expect(parseOsmOpeningHours("sunrise-sunset")?.periods).toEqual([]);
    expect(
      parseOsmOpeningHours("Su-Tu 10:00-12:00")
        ?.periods.map((p) => p.day)
        .sort(),
    ).toEqual([0, 1, 2]);
  });
});

describe("Exportación CSV", () => {
  const row: ExportRow = {
    nombre: '=HYPERLINK("http://malo")',
    categoria: "Restaurantes",
    ciudad: "Sevilla",
    direccion: "Calle; con punto y coma",
    web: "",
    estado_web: "Sin web",
    opportunity_score: 72,
    nivel_oportunidad: "Alta oportunidad",
    website_score: "",
    problemas: 'Texto con "comillas"',
    telefono: "954 12 34 56",
    email: "",
    whatsapp: "",
    instagram: "",
    facebook: "",
    maps: "",
    motivo_oportunidad: "+40 No se ha encontrado web oficial",
    estado_comercial: "Nuevo",
    proximo_seguimiento: "",
    fecha_analisis: "2026-09-22",
  };
  it("neutraliza fórmulas (CSV injection)", () => {
    expect(sanitizeCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(sanitizeCell("-2")).toBe("'-2");
    expect(sanitizeCell("Bar Pepe")).toBe("Bar Pepe");
  });
  it("genera BOM, cabecera y escapado correcto", () => {
    const csv = csvExporter.export([row]) as string;
    expect(csv.startsWith("﻿")).toBe(true);
    const [header, line] = csv.slice(1).split("\r\n");
    expect(header.split(";")).toContain("motivo_oportunidad");
    expect(line).toContain(`"'=HYPERLINK(""http://malo"")"`);
    expect(line).toContain('"Calle; con punto y coma"');
    expect(line).toContain("'+40 No se ha encontrado web oficial");
  });
});

describe("Autenticación", () => {
  it("hash y verificación de contraseña", () => {
    const h = hashPassword("una-contraseña-larga");
    expect(verifyPassword("una-contraseña-larga", h)).toBe(true);
    expect(verifyPassword("otra", h)).toBe(false);
    expect(verifyPassword("x", "formato-invalido")).toBe(false);
  });
  it("token de sesión firmado, caducidad y manipulación", () => {
    const secret = "s".repeat(40);
    const { token } = createSessionToken("admin", secret, 1);
    expect(verifySessionToken(token, secret)?.u).toBe("admin");
    expect(verifySessionToken(token, "otro-secreto".repeat(4))).toBeNull();
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "admin", exp: Date.now() + 1e12 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`, secret)).toBeNull();
    expect(verifySessionToken(`${payload}.`, secret)).toBeNull();
    const expired = createSessionToken("admin", secret, -1).token;
    expect(verifySessionToken(expired, secret)).toBeNull();
  });
});

describe("utilidades", () => {
  it("teselado cubre el círculo y ordena desde el centro", () => {
    const center = { lat: 37.39, lng: -5.99 };
    const tiles = tileCircle(center, 15_000, 5_000);
    expect(tiles.length).toBeGreaterThan(1);
    expect(haversineMeters(center, tiles[0].center)).toBeLessThan(10);
    expect(tileCircle(center, 3_000, 5_000)).toHaveLength(1);
  });
  it("los logs no filtran secretos", () => {
    expect(redactString("https://maps.googleapis.com/x?key=AIzaSECRET&q=1")).not.toContain("AIzaSECRET");
    expect(redactString("postgresql://bos:superSecreta@localhost:5432/bos")).not.toContain("superSecreta");
  });
});
