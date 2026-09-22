import type { ContactDiscoveryProvider, WebsiteAuditResult } from "@/domain/ports";
import type { ContactPoint, ContactType, NormalizedPlace } from "@/domain/types";
import { normalizePhone } from "@/shared/phone";
import { classifyThirdParty, normalizeWebsiteUrl } from "@/shared/url";

/**
 * Recopila formas públicas de contacto EMPRESARIAL con su fuente.
 * Reglas:
 *  - Nunca se generan emails por patrón (info@dominio…): solo los publicados.
 *  - Cada dato guarda su origen (proveedor, web, schema.org) y la URL donde se encontró.
 *  - No se buscan datos personales (propietarios, empleados…).
 */

const PRIORITY: ContactType[] = [
  "PHONE",
  "EMAIL",
  "CONTACT_FORM",
  "WHATSAPP",
  "CONTACT_PAGE",
  "INSTAGRAM",
  "FACEBOOK",
  "BOOKING_PAGE",
  "TIKTOK",
  "LINKEDIN",
  "X",
  "YOUTUBE",
  "OTHER",
];

function socialTypeFromUrl(url: string): ContactType | null {
  try {
    const u = new URL(url);
    const tp = classifyThirdParty(u.hostname, u.pathname);
    if (!tp) return null;
    if (tp.kind === "MESSAGING" && /whatsapp|wa\.me|wa\.link/.test(u.hostname)) return "WHATSAPP";
    if (tp.kind === "BOOKING_PLATFORM" || tp.kind === "DELIVERY") return "BOOKING_PAGE";
    const map: Record<string, ContactType> = {
      Instagram: "INSTAGRAM",
      Facebook: "FACEBOOK",
      TikTok: "TIKTOK",
      LinkedIn: "LINKEDIN",
      "X/Twitter": "X",
      YouTube: "YOUTUBE",
    };
    return map[tp.label] ?? "OTHER";
  } catch {
    return null;
  }
}

export class DefaultContactDiscovery implements ContactDiscoveryProvider {
  discover(place: NormalizedPlace, audit: WebsiteAuditResult | null): ContactPoint[] {
    const out = new Map<string, ContactPoint>();
    const provSource = place.provider;
    const add = (c: ContactPoint) => {
      const key = `${c.type}:${c.value.toLowerCase()}`;
      if (!out.has(key)) out.set(key, c);
    };

    // Proveedor
    const phone = normalizePhone(place.internationalPhone ?? place.nationalPhone, place.countryCode);
    if (phone)
      add({
        type: "PHONE",
        value: phone.e164,
        label: place.nationalPhone ?? phone.national,
        source: provSource,
        provenance: "OBSERVED",
        confidence: "HIGH",
      });
    else if (place.nationalPhone)
      add({
        type: "PHONE",
        value: place.nationalPhone,
        label: place.nationalPhone,
        source: provSource,
        provenance: "OBSERVED",
        confidence: "MEDIUM",
      });
    if (place.email)
      add({
        type: "EMAIL",
        value: place.email.toLowerCase(),
        source: provSource,
        provenance: "OBSERVED",
        confidence: "HIGH",
      });
    for (const [k, v] of Object.entries(place.socials ?? {})) {
      if (!v) continue;
      const url = /^https?:/i.test(v)
        ? v
        : k === "instagram"
          ? `https://www.instagram.com/${v.replace(/^@/, "")}`
          : k === "facebook"
            ? `https://www.facebook.com/${v}`
            : v;
      const type = socialTypeFromUrl(url) ?? "OTHER";
      add({ type, value: url, source: provSource, provenance: "OBSERVED", confidence: "HIGH" });
    }
    // La "web" del proveedor puede ser un perfil social / plataforma de reservas
    const provUrl = normalizeWebsiteUrl(place.websiteUri);
    if (provUrl) {
      const t = socialTypeFromUrl(provUrl.toString());
      if (t)
        add({
          type: t,
          value: provUrl.toString(),
          label: "Enlazado como web en la ficha",
          source: provSource,
          provenance: "OBSERVED",
          confidence: "HIGH",
        });
    }

    // Web
    const x = audit?.extraction;
    if (x) {
      for (const p of x.phones)
        add({
          type: "PHONE",
          value: p.e164,
          label: p.national,
          source: "website",
          sourceUrl: p.url,
          provenance: "OBSERVED",
          confidence: p.clickable ? "HIGH" : "MEDIUM",
        });
      for (const e of x.emails)
        add({
          type: "EMAIL",
          value: e.value,
          source: "website",
          sourceUrl: e.url,
          provenance: "OBSERVED",
          confidence: e.viaMailto ? "HIGH" : "MEDIUM",
        });
      for (const f of x.contactForms)
        add({
          type: "CONTACT_FORM",
          value: f.url,
          label: `Formulario (${f.fields} campos)`,
          source: "website",
          sourceUrl: f.url,
          provenance: "OBSERVED",
          confidence: "HIGH",
        });
      for (const w of x.whatsapp)
        add({
          type: "WHATSAPP",
          value: w.url,
          source: "website",
          sourceUrl: w.foundOn,
          provenance: "OBSERVED",
          confidence: "HIGH",
        });
      for (const c of x.contactPages)
        add({
          type: "CONTACT_PAGE",
          value: c,
          source: "website",
          sourceUrl: c,
          provenance: "OBSERVED",
          confidence: "HIGH",
        });
      for (const s of x.socials)
        add({
          type: s.type,
          value: s.url,
          source: "website",
          sourceUrl: s.foundOn,
          provenance: "OBSERVED",
          confidence: "HIGH",
        });
      for (const b of x.bookingLinks) {
        if (/^https?:/i.test(b.url) && socialTypeFromUrl(b.url) === "BOOKING_PAGE")
          add({
            type: "BOOKING_PAGE",
            value: b.url,
            label: b.label,
            source: "website",
            provenance: "OBSERVED",
            confidence: "HIGH",
          });
      }
    }
    return [...out.values()].sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));
  }
}
