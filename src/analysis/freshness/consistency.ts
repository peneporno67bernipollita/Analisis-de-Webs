import type { WebsiteExtraction } from "@/domain/ports";
import type { EvidenceItem, Finding, NormalizedPlace, OpeningPeriod } from "@/domain/types";
import { finding } from "@/analysis/findings";
import { normalizePhone } from "@/shared/phone";
import { normalizeText } from "@/shared/text";

/**
 * Consistencia y frescura de la información.
 * Compara la información pública del proveedor (Google/OSM) con la de la web del negocio y busca
 * señales temporales. NUNCA elige silenciosamente una fuente: cuando hay conflicto se muestran ambas.
 * Toda conclusión sobre "desactualización" se formula como "posible" y se marca como inferencia.
 */

export interface FieldComparison {
  field: "phone" | "address" | "hours" | "status";
  label: string;
  providerValue: string | null;
  websiteValue: string | null;
  result: "match" | "mismatch" | "not_comparable" | "missing_in_provider" | "missing_in_website";
  note?: string;
}

export interface ConsistencyResult {
  findings: Finding[];
  comparisons: FieldComparison[];
  score: number | null;
  unverified: string[];
}

const DAY_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function providerSource(place: NormalizedPlace): "google_places" | "osm" {
  return place.provider;
}
function providerName(place: NormalizedPlace): string {
  return place.provider === "google_places" ? "Google" : "OpenStreetMap";
}

/** "9:00" → "09:00"; como hora de cierre, "00:00"/"23:59" → "24:00" (evita falsos conflictos de formato). */
function normTime(t: string, isClose = false): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return t.trim();
  const v = `${m[1].padStart(2, "0")}:${m[2]}`;
  return isClose && (v === "00:00" || v === "23:59") ? "24:00" : v;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** true si algún par de intervalos "HH:MM-HH:MM" se solapa (turnos partidos NO se solapan). */
export function intervalsOverlap(intervals: string[]): boolean {
  const parsed = intervals
    .map((i) => i.split("-"))
    .filter((p) => p.length === 2)
    .map(([o, c]) => [toMin(o), toMin(c) <= toMin(o) ? toMin(c) + 1440 : toMin(c)] as const)
    .sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < parsed.length; i++) if (parsed[i][0] < parsed[i - 1][1]) return true;
  return false;
}

/** Intervalos por día, deduplicados (las webs a veces declaran el mismo horario dos veces). */
export function hoursByDay(periods: OpeningPeriod[]): Map<number, string> {
  const map = new Map<number, Set<string>>();
  for (const p of periods) {
    const set = map.get(p.day) ?? new Set<string>();
    set.add(`${normTime(p.open)}-${normTime(p.close, true)}`);
    map.set(p.day, set);
  }
  return new Map([...map.entries()].map(([d, s]) => [d, [...s].sort().join(", ")]));
}

export function analyzeConsistency(
  place: NormalizedPlace,
  x: WebsiteExtraction | undefined,
  now = new Date(),
): ConsistencyResult {
  const findings: Finding[] = [];
  const comparisons: FieldComparison[] = [];
  const unverified: string[] = [];
  const src = providerSource(place);
  const pname = providerName(place);
  let penalty = 0;
  let comparable = 0;

  if (!x) {
    return {
      findings,
      comparisons,
      score: null,
      unverified: ["Consistencia de la información: no hay web analizable con la que comparar."],
    };
  }

  // ---------- Teléfono
  const country = place.countryCode;
  const providerPhone = normalizePhone(place.internationalPhone ?? place.nationalPhone, country);
  const webPhones = new Map<string, string>();
  for (const p of x.phones) webPhones.set(p.e164, p.national);
  for (const t of x.schemaOrg.telephone ?? []) {
    const p = normalizePhone(t, country);
    if (p) webPhones.set(p.e164, p.national);
  }
  if (providerPhone && webPhones.size) {
    comparable++;
    if (webPhones.has(providerPhone.e164)) {
      comparisons.push({
        field: "phone",
        label: "Teléfono",
        providerValue: providerPhone.national,
        websiteValue: webPhones.get(providerPhone.e164)!,
        result: "match",
      });
    } else {
      penalty += 25;
      const webList = [...webPhones.values()].join(", ");
      comparisons.push({
        field: "phone",
        label: "Teléfono",
        providerValue: providerPhone.national,
        websiteValue: webList,
        result: "mismatch",
        note: "Conflicto entre fuentes",
      });
      findings.push(
        finding(
          "PHONE_MISMATCH",
          "CONSISTENCY",
          "MEDIUM",
          `El teléfono de ${pname} no aparece en la web`,
          `${pname} muestra un teléfono distinto a los publicados en la web. Puede que uno esté desactualizado o que el negocio use varios números: no se da prioridad a ninguna fuente, verifícalo manualmente.`,
          [
            { label: `Teléfono en ${pname}`, value: providerPhone.national, source: src },
            { label: "Teléfono(s) en la web", value: webList, source: "website", url: x.phones[0]?.url },
          ],
          { confidence: webPhones.size <= 2 ? "MEDIUM" : "LOW" },
        ),
      );
    }
  } else if (!providerPhone && webPhones.size) {
    comparisons.push({
      field: "phone",
      label: "Teléfono",
      providerValue: null,
      websiteValue: [...webPhones.values()].join(", "),
      result: "missing_in_provider",
    });
    findings.push(
      finding(
        "PROVIDER_MISSING_PHONE",
        "CONSISTENCY",
        "LOW",
        `La ficha de ${pname} no tiene teléfono, pero la web sí`,
        "Conviene añadir el teléfono a la ficha pública del negocio.",
        [
          {
            label: "Teléfono en la web",
            value: [...webPhones.values()][0],
            source: "website",
            url: x.phones[0]?.url,
          },
        ],
      ),
    );
    penalty += 5;
  } else if (providerPhone && !webPhones.size) {
    comparisons.push({
      field: "phone",
      label: "Teléfono",
      providerValue: providerPhone.national,
      websiteValue: null,
      result: "missing_in_website",
    });
  } else {
    comparisons.push({
      field: "phone",
      label: "Teléfono",
      providerValue: null,
      websiteValue: null,
      result: "not_comparable",
    });
  }

  // ---------- Dirección (código postal + calle)
  const webPostals = [...new Set([...(x.schemaOrg.postalCode ?? []), ...x.postalCodes])];
  const providerPostal = place.postalCode?.trim();
  if (providerPostal && webPostals.length) {
    comparable++;
    if (webPostals.includes(providerPostal)) {
      comparisons.push({
        field: "address",
        label: "Código postal",
        providerValue: providerPostal,
        websiteValue: providerPostal,
        result: "match",
      });
    } else {
      const fromSchema = (x.schemaOrg.postalCode ?? []).length > 0;
      penalty += fromSchema ? 25 : 10;
      comparisons.push({
        field: "address",
        label: "Código postal",
        providerValue: providerPostal,
        websiteValue: webPostals.join(", "),
        result: "mismatch",
        note: "Conflicto entre fuentes",
      });
      findings.push(
        finding(
          "ADDRESS_MISMATCH",
          "CONSISTENCY",
          fromSchema ? "MEDIUM" : "LOW",
          "Posible discrepancia de dirección entre la ficha y la web",
          `El código postal de ${pname} no coincide con el que aparece en la web. Puede indicar un traslado no actualizado en alguna de las dos fuentes.`,
          [
            { label: `Dirección en ${pname}`, value: place.formattedAddress ?? providerPostal, source: src },
            { label: "Código(s) postal(es) en la web", value: webPostals.join(", "), source: "website" },
            ...(x.addressTexts[0]
              ? [{ label: "Dirección en la web", value: x.addressTexts[0], source: "website" as const }]
              : []),
          ],
          { confidence: fromSchema ? "MEDIUM" : "LOW", provenance: "ANALYZED" },
        ),
      );
    }
  } else if (place.street && x.addressTexts.length) {
    const tokens = normalizeText(place.street)
      .split(/[\s,]+/)
      .filter((t) => t.length >= 4 && !/^(calle|avenida|plaza|paseo|carretera)$/.test(t));
    const hay = normalizeText(x.addressTexts.join(" "));
    if (tokens.length) {
      comparable++;
      const hit = tokens.some((t) => hay.includes(t));
      comparisons.push({
        field: "address",
        label: "Calle",
        providerValue: place.street,
        websiteValue: x.addressTexts[0],
        result: hit ? "match" : "not_comparable",
        note: hit ? undefined : "No se ha podido confirmar la calle en la web",
      });
      if (!hit)
        unverified.push(
          "Dirección: la calle de la ficha no se ha encontrado en el texto de la web (puede estar escrita de otra forma).",
        );
    }
  } else {
    comparisons.push({
      field: "address",
      label: "Dirección",
      providerValue: place.formattedAddress ?? null,
      websiteValue: x.addressTexts[0] ?? null,
      result: "not_comparable",
    });
  }

  // ---------- Horarios (solo datos estructurados; el texto libre no se compara automáticamente)
  const providerPeriods = place.openingHours?.periods ?? [];
  const webPeriods = x.schemaOrg.openingHours ?? [];
  if (providerPeriods.length && webPeriods.length) {
    comparable++;
    const a = hoursByDay(providerPeriods);
    const b = hoursByDay(webPeriods);
    const days = [...new Set([...a.keys(), ...b.keys()])].sort();
    const differing = days.filter((d) => (a.get(d) ?? "cerrado") !== (b.get(d) ?? "cerrado"));
    // Días en los que la web se contradice a sí misma (intervalos solapados, no turnos partidos)
    const contradictory = differing.filter((d) =>
      intervalsOverlap((b.get(d) ?? "").split(", ").filter(Boolean)),
    );
    // Si la web se contradice pero uno de sus horarios coincide con la ficha, no es discrepancia con la ficha
    const diffs = differing.filter((d) => {
      if (!contradictory.includes(d)) return true;
      const prov = (a.get(d) ?? "").split(", ").filter(Boolean);
      const web = new Set((b.get(d) ?? "").split(", "));
      return !(prov.length > 0 && prov.every((i) => web.has(i)));
    });
    if (contradictory.length) {
      penalty += 10;
      findings.push(
        finding(
          "WEBSITE_HOURS_CONTRADICTORY",
          "CONSISTENCY",
          "LOW",
          "La web declara horarios contradictorios",
          "Los datos estructurados de la web incluyen horarios distintos y solapados para el mismo día: probablemente uno de ellos está desactualizado.",
          contradictory.slice(0, 4).map((d) => ({
            label: DAY_ES[d],
            value: `Web: ${b.get(d)} | ${pname}: ${a.get(d) ?? "cerrado"}`,
            source: "website" as const,
          })),
          { confidence: "HIGH" },
        ),
      );
    }
    if (diffs.length === 0) {
      comparisons.push({
        field: "hours",
        label: "Horario",
        providerValue: "coincide",
        websiteValue: "coincide",
        result: "match",
      });
    } else {
      penalty += 20;
      const evidence: EvidenceItem[] = diffs.slice(0, 4).map((d) => ({
        label: DAY_ES[d],
        value: `${pname}: ${a.get(d) ?? "cerrado"} | Web: ${b.get(d) ?? "cerrado"}`,
        source: "system",
      }));
      comparisons.push({
        field: "hours",
        label: "Horario",
        providerValue: `${diffs.length} día(s) distintos`,
        websiteValue: "ver evidencias",
        result: "mismatch",
        note: "Conflicto entre fuentes",
      });
      findings.push(
        finding(
          "HOURS_MISMATCH",
          "CONSISTENCY",
          "MEDIUM",
          `El horario de la web no coincide con el de ${pname}`,
          "Los horarios estructurados de la web (schema.org) difieren de los de la ficha pública. Alguna de las dos fuentes podría estar desactualizada.",
          evidence,
          { confidence: "MEDIUM" },
        ),
      );
    }
  } else if (providerPeriods.length && x.hoursTexts.length) {
    comparisons.push({
      field: "hours",
      label: "Horario",
      providerValue: place.openingHours?.weekdayDescriptions?.join(" · ") ?? "disponible",
      websiteValue: x.hoursTexts[0],
      result: "not_comparable",
      note: "Horario de la web en texto libre: compáralo manualmente",
    });
    unverified.push(
      "Horarios: la web los publica en texto libre y no se comparan automáticamente con la ficha (revisa las evidencias).",
    );
  } else {
    comparisons.push({
      field: "hours",
      label: "Horario",
      providerValue: providerPeriods.length ? "disponible" : null,
      websiteValue: x.hoursTexts[0] ?? null,
      result: "not_comparable",
    });
  }

  // ---------- Estado del negocio vs avisos de la web
  const tempClosed = x.staleNotices.find((n) => n.kind === "temporarily_closed");
  if (tempClosed && (place.businessStatus === "OPERATIONAL" || !place.businessStatus)) {
    penalty += 20;
    comparisons.push({
      field: "status",
      label: "Estado",
      providerValue: place.businessStatus ?? "sin dato",
      websiteValue: "cerrado temporalmente",
      result: "mismatch",
    });
    findings.push(
      finding(
        "STATUS_CONFLICT",
        "CONSISTENCY",
        "MEDIUM",
        "La web anuncia un cierre temporal que la ficha no refleja",
        "Posible aviso antiguo que no se retiró de la web, o ficha pública sin actualizar.",
        [
          { label: "Texto en la web", value: tempClosed.text, source: "website", url: tempClosed.url },
          { label: `Estado en ${pname}`, value: place.businessStatus ?? "sin dato", source: src },
        ],
        { provenance: "INFERRED", confidence: "MEDIUM" },
      ),
    );
  }

  // ---------- Señales temporales
  const covid = x.staleNotices.find((n) => n.kind === "covid");
  if (covid) {
    penalty += 15;
    findings.push(
      finding(
        "STALE_COVID_NOTICE",
        "FRESHNESS",
        "MEDIUM",
        "Posible aviso de COVID-19 sin retirar",
        "La web contiene referencias a medidas de la pandemia. Posible señal de información desactualizada.",
        [{ label: "Texto encontrado", value: covid.text, source: "website", url: covid.url }],
        { provenance: "INFERRED", confidence: "MEDIUM" },
      ),
    );
  }
  if (x.datedMentions.length) {
    const oldest = Math.min(...x.datedMentions.map((d) => d.year));
    const strong = x.datedMentions.length >= 2 || oldest <= now.getFullYear() - 3;
    penalty += strong ? 15 : 8;
    findings.push(
      finding(
        "OLD_DATED_CONTENT",
        "FRESHNESS",
        strong ? "MEDIUM" : "LOW",
        "Posibles eventos o promociones de años anteriores",
        "Se han encontrado menciones a eventos/promociones con años pasados. Posibles señales de información desactualizada (verifica si se presentan como actuales).",
        x.datedMentions.slice(0, 4).map((d) => ({
          label: `Mención (${d.year})`,
          value: d.text,
          source: "website" as const,
          url: d.url,
        })),
        { provenance: "INFERRED", confidence: strong ? "MEDIUM" : "LOW" },
      ),
    );
  }
  if (x.copyrightYears.length) {
    const latest = Math.max(...x.copyrightYears);
    if (latest <= now.getFullYear() - 3) {
      penalty += 5;
      findings.push(
        finding(
          "OLD_COPYRIGHT",
          "FRESHNESS",
          "LOW",
          `Año de copyright antiguo (${latest})`,
          "Señal débil: un año de copyright antiguo no implica necesariamente que el contenido esté desactualizado.",
          [{ label: "Copyright", value: String(latest), source: "website" }],
          { provenance: "INFERRED", confidence: "LOW" },
        ),
      );
    }
  }
  if (x.latestSitemapLastmod) {
    const ageDays = (now.getTime() - Date.parse(x.latestSitemapLastmod)) / 86_400_000;
    if (ageDays > 730) {
      penalty += 5;
      findings.push(
        finding(
          "SITEMAP_STALE",
          "FRESHNESS",
          "LOW",
          "El sitemap indica que la web no se actualiza desde hace más de 2 años",
          "Fecha de última modificación declarada por la propia web. Es una señal, no una prueba.",
          [
            {
              label: "Última modificación declarada",
              value: x.latestSitemapLastmod.slice(0, 10),
              source: "website",
            },
          ],
          { provenance: "INFERRED", confidence: "MEDIUM" },
        ),
      );
    }
  }
  if (!comparable)
    unverified.push(
      "No se ha podido comparar teléfono, dirección ni horario estructurado entre la ficha y la web.",
    );

  const signals = findings.length;
  const score = comparable === 0 && signals === 0 ? null : Math.max(0, 100 - penalty);
  return { findings, comparisons, score, unverified };
}
