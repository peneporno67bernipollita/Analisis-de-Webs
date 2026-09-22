import type { Exporter, ExportRow } from "./types";

export const EXPORT_COLUMNS: (keyof ExportRow)[] = [
  "nombre",
  "categoria",
  "ciudad",
  "direccion",
  "web",
  "estado_web",
  "opportunity_score",
  "nivel_oportunidad",
  "website_score",
  "problemas",
  "telefono",
  "email",
  "whatsapp",
  "instagram",
  "facebook",
  "maps",
  "motivo_oportunidad",
  "estado_comercial",
  "proximo_seguimiento",
  "fecha_analisis",
];

/**
 * Protección contra inyección de fórmulas en hojas de cálculo (CSV injection):
 * celdas que empiezan por = + - @ tab o CR se prefijan con apóstrofo. Los teléfonos se exportan
 * en formato nacional para no necesitar el prefijo.
 */
export function sanitizeCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  s = s.replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s;
}

function csvEscape(s: string, delimiter: string): string {
  return /["\n\r]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvExporter: Exporter = {
  format: "csv",
  contentType: "text/csv; charset=utf-8",
  extension: "csv",
  implemented: true,
  export(rows, options) {
    const d = options?.delimiter ?? ";";
    const lines = [
      EXPORT_COLUMNS.join(d),
      ...rows.map((r) => EXPORT_COLUMNS.map((c) => csvEscape(sanitizeCell(r[c]), d)).join(d)),
    ];
    // BOM para que Excel detecte UTF-8 (tildes y ñ)
    return "﻿" + lines.join("\r\n") + "\r\n";
  },
};

export const jsonExporter: Exporter = {
  format: "json",
  contentType: "application/json; charset=utf-8",
  extension: "json",
  implemented: true,
  export(rows) {
    return JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2);
  },
};

/** Preparados para una versión posterior (arquitectura lista, sin implementación todavía). */
const planned = (format: "xlsx" | "pdf", contentType: string): Exporter => ({
  format,
  contentType,
  extension: format,
  implemented: false,
  export() {
    throw new Error(`Exportación ${format.toUpperCase()} aún no implementada`);
  },
});

export const EXPORTERS: Record<string, Exporter> = {
  csv: csvExporter,
  json: jsonExporter,
  xlsx: planned("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  pdf: planned("pdf", "application/pdf"),
};
