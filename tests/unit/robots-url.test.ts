import { describe, expect, it } from "vitest";
import { isPathAllowed, parseRobots } from "@/analysis/http/robots";
import { classifyThirdParty, isNotOwnWebsite, normalizeWebsiteUrl, registrableDomain } from "@/shared/url";

describe("robots.txt", () => {
  const txt = `
User-agent: *
Disallow: /admin
Allow: /admin/public
Disallow: /*.pdf$

User-agent: BusinessOpportunityScanner
Disallow: /privado

Sitemap: https://example.com/sitemap.xml
`;
  it("usa el grupo específico si existe", () => {
    const r = parseRobots(txt, "BusinessOpportunityScanner");
    expect(isPathAllowed(r, "/privado/x")).toBe(false);
    expect(isPathAllowed(r, "/admin")).toBe(true); // el grupo específico sustituye al genérico
    expect(r.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });
  it("aplica la regla más larga y comodines en el grupo *", () => {
    const r = parseRobots(txt, "OtroBot");
    expect(isPathAllowed(r, "/admin/panel")).toBe(false);
    expect(isPathAllowed(r, "/admin/public/x")).toBe(true);
    expect(isPathAllowed(r, "/docs/carta.pdf")).toBe(false);
    expect(isPathAllowed(r, "/docs/carta.pdf?v=2")).toBe(true);
  });
  it("Disallow: / bloquea todo", () => {
    const r = parseRobots("User-agent: *\nDisallow: /", "x");
    expect(isPathAllowed(r, "/")).toBe(false);
  });
});

describe("clasificación de URLs", () => {
  it("distingue perfiles de terceros de webs propias", () => {
    expect(classifyThirdParty("www.facebook.com")?.kind).toBe("SOCIAL");
    expect(classifyThirdParty("instagram.com")?.label).toBe("Instagram");
    expect(classifyThirdParty("www.tripadvisor.es")?.kind).toBe("DIRECTORY");
    expect(classifyThirdParty("www.just-eat.es")?.kind).toBe("DELIVERY");
    expect(classifyThirdParty("linktr.ee")?.kind).toBe("LINK_AGGREGATOR");
    expect(classifyThirdParty("www.google.com", "/maps/place/x")?.kind).toBe("MAPS");
    expect(classifyThirdParty("www.google.com", "/search")).toBeNull();
    expect(classifyThirdParty("mi-bar.business.site")?.kind).toBe("DISCONTINUED_BUILDER");
    expect(classifyThirdParty("mipelu.wixsite.com")?.kind).toBe("FREE_SUBDOMAIN_BUILDER");
    expect(classifyThirdParty("www.restaurantepepe.es")).toBeNull();
  });
  it("los subdominios gratuitos cuentan como web propia; las redes sociales no", () => {
    expect(isNotOwnWebsite("FREE_SUBDOMAIN_BUILDER")).toBe(false);
    expect(isNotOwnWebsite("SOCIAL")).toBe(true);
  });
  it("calcula el dominio registrable", () => {
    expect(registrableDomain("www.bar.sevilla.es")).toBe("sevilla.es");
    expect(registrableDomain("tienda.empresa.com.es")).toBe("empresa.com.es");
    expect(registrableDomain("shop.example.co.uk")).toBe("example.co.uk");
  });
  it("normaliza URLs sin esquema y rechaza otros protocolos", () => {
    expect(normalizeWebsiteUrl("www.ejemplo.es")?.toString()).toBe("http://www.ejemplo.es/");
    expect(normalizeWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsiteUrl("")).toBeNull();
  });
});
