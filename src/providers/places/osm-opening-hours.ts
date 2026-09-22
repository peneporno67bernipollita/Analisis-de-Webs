import type { OpeningHours, OpeningPeriod } from "@/domain/types";

/**
 * Parser conservador del formato opening_hours de OSM para los casos más comunes:
 *   "Mo-Fr 09:00-14:00,17:00-20:00; Sa 10:00-14:00"   "24/7"   "Mo-Su 08:00-23:00"
 * Si alguna parte no se entiende devuelve solo `raw` (sin periodos) para no comparar
 * horarios con datos mal interpretados.
 */

const DAY_INDEX: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };

function expandDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const p = part.trim().toLowerCase();
    const range = /^([a-z]{2})-([a-z]{2})$/.exec(p);
    if (range) {
      const a = DAY_INDEX[range[1]];
      const b = DAY_INDEX[range[2]];
      if (a === undefined || b === undefined) return null;
      // Orden OSM: Mo..Su. Convertimos a índice lunes=0 para iterar y volvemos a domingo=0.
      const toMon = (d: number) => (d + 6) % 7;
      let i = toMon(a);
      const end = toMon(b);
      for (let guard = 0; guard < 7; guard++) {
        out.add((i + 1) % 7);
        if (i === end) break;
        i = (i + 1) % 7;
      }
      continue;
    }
    const d = DAY_INDEX[p];
    if (d === undefined) return null;
    out.add(d);
  }
  return [...out];
}

export function parseOsmOpeningHours(raw: string | undefined): OpeningHours | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  if (text === "24/7") return { periods: [], alwaysOpen: true, raw: text };
  const periods: OpeningPeriod[] = [];
  for (const ruleRaw of text.split(";")) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    if (/^PH\b/i.test(rule)) continue; // festivos: se ignoran
    const m =
      /^([A-Za-z,\- ]+?)\s+(off|closed|\d{2}:\d{2}-\d{2}:\d{2}(?:\s*,\s*\d{2}:\d{2}-\d{2}:\d{2})*)$/i.exec(
        rule,
      );
    let daySpec: string;
    let timeSpec: string;
    if (m) {
      daySpec = m[1].replace(/\s+/g, "");
      timeSpec = m[2];
    } else if (/^\d{2}:\d{2}-\d{2}:\d{2}(\s*,\s*\d{2}:\d{2}-\d{2}:\d{2})*$/.test(rule)) {
      daySpec = "Mo-Su";
      timeSpec = rule;
    } else {
      return { periods: [], raw: text };
    }
    const days = expandDays(daySpec);
    if (!days) return { periods: [], raw: text };
    if (/^(off|closed)$/i.test(timeSpec)) continue;
    for (const range of timeSpec.split(",")) {
      const [open, close] = range.trim().split("-");
      for (const day of days) periods.push({ day, open, close });
    }
  }
  return { periods, raw: text };
}
