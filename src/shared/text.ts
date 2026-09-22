/** Utilidades de texto: normalización, fragmentos de evidencia y similitud simple. */

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeText(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, " ").trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

/** Devuelve un fragmento corto alrededor de la posición `index` (para evidencias). */
export function snippetAround(text: string, index: number, matchLength: number, radius = 70): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + matchLength + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}

const STOPWORDS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "y",
  "e",
  "en",
  "del",
  "al",
  "a",
  "the",
  "and",
  "of",
  "sl",
  "s",
  "l",
  "sa",
  "slu",
  "bar",
  "restaurante",
  "cafe",
  "cafeteria",
  "clinica",
  "centro",
  "taller",
  "tienda",
  "peluqueria",
]);

export function nameTokens(name: string): string[] {
  return normalizeText(name)
    .replace(/[^a-z0-9ñ ]/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Proporción de tokens significativos del nombre presentes en `haystack` (0..1). */
export function nameCoverage(name: string, haystack: string): number {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return 0;
  const hay = normalizeText(haystack);
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits / tokens.length;
}

export function uniq<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}
