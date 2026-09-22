import { findPhoneNumbersInText, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface ParsedPhone {
  e164: string;
  national: string;
  raw: string;
}

export function normalizePhone(raw: string | null | undefined, defaultCountry?: string): ParsedPhone | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^tel:/i, "").trim();
  const parsed = parsePhoneNumberFromString(
    cleaned,
    (defaultCountry?.toUpperCase() as CountryCode) || undefined,
  );
  if (!parsed || !parsed.isPossible()) return null;
  return { e164: parsed.number, national: parsed.formatNational(), raw };
}

/** Extrae teléfonos de un texto libre. Solo devuelve números válidos según libphonenumber. */
export function extractPhonesFromText(text: string, defaultCountry?: string, limit = 10): ParsedPhone[] {
  const found = findPhoneNumbersInText(text, {
    defaultCountry: (defaultCountry?.toUpperCase() as CountryCode) || undefined,
  });
  const out = new Map<string, ParsedPhone>();
  for (const f of found) {
    if (!f.number.isValid()) continue;
    const e164 = f.number.number;
    if (!out.has(e164))
      out.set(e164, { e164, national: f.number.formatNational(), raw: text.slice(f.startsAt, f.endsAt) });
    if (out.size >= limit) break;
  }
  return [...out.values()];
}

export function samePhone(
  a: string | null | undefined,
  b: string | null | undefined,
  defaultCountry?: string,
): boolean {
  const pa = normalizePhone(a, defaultCountry);
  const pb = normalizePhone(b, defaultCountry);
  return Boolean(pa && pb && pa.e164 === pb.e164);
}
