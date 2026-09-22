import { describe, expect, it } from "vitest";
import {
  decodeCfEmail,
  detectPlaceholder,
  extractCopyrightYears,
  extractDatedMentions,
  extractEmails,
  extractPhones,
  extractSchemaOrg,
  extractStaleNotices,
  parsePage,
} from "@/analysis/website/html";

const HTML = `<!doctype html><html lang="es"><head>
<title>Restaurante Ejemplo · Cocina andaluza en Sevilla</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","telephone":"+34 954 123 456","email":"reservas@ejemplo.es",
 "address":{"@type":"PostalAddress","streetAddress":"Calle Sierpes 10","postalCode":"41004"},
 "openingHoursSpecification":[{"dayOfWeek":["Monday","Tuesday"],"opens":"13:00","closes":"16:30"}],
 "sameAs":["https://www.instagram.com/restauranteejemplo/"]}</script>
</head><body>
<nav><a href="/carta">Nuestra carta</a><a href="/contacto">Contacto</a><a href="https://www.thefork.es/restaurante/ejemplo">Reservar mesa</a></nav>
<h1>Restaurante Ejemplo</h1>
<p>Llámanos al <a href="tel:+34954123456">954 12 34 56</a> o escribe a <a href="mailto:info@ejemplo.es?subject=Hola">info@ejemplo.es</a>.</p>
<p>Móvil: 600 111 222. Email alternativo: <span class="__cf_email__" data-cfemail="4f2c20213b2e2c3b200f2a372e223f232a612a3c">[email protected]</span></p>
<a href="https://www.facebook.com/restauranteejemplo">Facebook</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Compartir</a>
<a href="https://wa.me/34600111222">WhatsApp</a>
<img src="/logo.png"><img src="/foto.jpg" alt="Sala">
<p>Menú especial de Navidad 2019 disponible. © 2016 Restaurante Ejemplo</p>
<p>Por las medidas sanitarias del COVID-19 el aforo es reducido.</p>
<p>Horario: lunes a viernes de 13:00 a 16:30</p>
</body></html>`;

describe("parsePage", () => {
  const page = parsePage(HTML, "https://www.ejemplo.es/");
  it("extrae metadatos básicos", () => {
    expect(page.title).toContain("Restaurante Ejemplo");
    expect(page.viewport).toContain("width=device-width");
    expect(page.lang).toBe("es");
    expect(page.h1).toEqual(["Restaurante Ejemplo"]);
  });
  it("detecta tel:, mailto:, emails de Cloudflare, reservas, carta y contacto", () => {
    expect(page.telLinks).toContain("+34954123456");
    expect(page.mailtoLinks).toContain("info@ejemplo.es");
    expect(page.cfEmails[0]).toMatch(/@/);
    expect(page.bookingSignals.some((b) => b.url.includes("thefork"))).toBe(true);
    expect(page.menuLinks.some((m) => m.url.endsWith("/carta"))).toBe(true);
    expect(page.contactPageLinks.some((c) => c.endsWith("/contacto"))).toBe(true);
    expect(page.a11y.imagesWithoutAlt).toBe(1);
  });
  it("extrae teléfonos válidos (clicables y en texto) sin inventar", () => {
    const phones = extractPhones(page, "ES");
    expect(phones.find((p) => p.e164 === "+34954123456")?.clickable).toBe(true);
    expect(phones.find((p) => p.e164 === "+34600111222")?.clickable).toBe(false);
  });
  it("lee schema.org (teléfono, email, CP, horario, sameAs)", () => {
    const s = extractSchemaOrg(page.jsonLd);
    expect(s.types).toContain("Restaurant");
    expect(s.postalCode).toEqual(["41004"]);
    expect(s.openingHours).toEqual([
      { day: 1, open: "13:00", close: "16:30" },
      { day: 2, open: "13:00", close: "16:30" },
    ]);
    expect(s.sameAs[0]).toContain("instagram.com");
  });
  it("detecta señales temporales como posibles (no como hechos)", () => {
    expect(extractCopyrightYears(page.text)).toContain(2016);
    expect(extractDatedMentions(page.text, page.url, 2026).map((d) => d.year)).toContain(2019);
    expect(extractStaleNotices(page.text, page.url).map((n) => n.kind)).toContain("covid");
  });
});

describe("extractEmails", () => {
  it("filtra falsos positivos típicos", () => {
    const out = extractEmails(
      "logo@2x.png nombre@dominio.com hola@mibar.es test@example.com contacto@mibar.es",
    );
    expect(out).toEqual(["hola@mibar.es", "contacto@mibar.es"]);
  });
  it("decodifica emails ofuscados por Cloudflare", () => {
    // clave 0x4f aplicada a "contacto@exampl.es"
    const email = "contacto@exampl.es";
    const key = 0x4f;
    const hex =
      key.toString(16) +
      [...email].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0")).join("");
    expect(decodeCfEmail(hex)).toBe(email);
  });
});

describe("detectPlaceholder", () => {
  it("detecta dominios aparcados, webs en construcción y lorem ipsum", () => {
    expect(detectPlaceholder("This domain is for sale. Buy this domain today")?.kind).toBe("PARKED");
    expect(detectPlaceholder("Web en construcción. Próximamente")?.kind).toBe("UNDER_CONSTRUCTION");
    expect(detectPlaceholder("Lorem ipsum dolor sit amet " + "palabra ".repeat(500))?.kind).toBe(
      "PLACEHOLDER",
    );
    expect(detectPlaceholder("Restaurante con cocina tradicional andaluza desde 1980.")).toBeNull();
  });
});
