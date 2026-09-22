const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const fmtDate = (d: Date | string | null | undefined) => (d ? dateFmt.format(new Date(d)) : "—");
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? dateTimeFmt.format(new Date(d)) : "—";

export function fmtRelative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const units: [number, string][] = [
    [86_400_000, "día"],
    [3_600_000, "hora"],
    [60_000, "minuto"],
  ];
  for (const [ms, name] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      const label = `${n} ${name}${n > 1 ? "s" : ""}`;
      return future ? `en ${label}` : `hace ${label}`;
    }
  }
  return "ahora";
}

export const fmtUsd = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n < 0.01 && n > 0 ? "<0,01" : n.toFixed(2).replace(".", ",")} $`;

/** Solo URLs http(s) válidas: los datos de terceros (p. ej. OSM) no son de confianza. */
export function safeHttpUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `http://${url}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
