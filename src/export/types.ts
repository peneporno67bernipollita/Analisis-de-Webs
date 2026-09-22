/** Fila de exportación orientada a trabajo comercial. */
export interface ExportRow {
  nombre: string;
  categoria: string;
  ciudad: string;
  direccion: string;
  web: string;
  estado_web: string;
  opportunity_score: number | "";
  nivel_oportunidad: string;
  website_score: number | "";
  problemas: string;
  telefono: string;
  email: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  maps: string;
  motivo_oportunidad: string;
  estado_comercial: string;
  proximo_seguimiento: string;
  fecha_analisis: string;
}

export interface Exporter {
  readonly format: "csv" | "json" | "xlsx" | "pdf";
  readonly contentType: string;
  readonly extension: string;
  readonly implemented: boolean;
  export(rows: ExportRow[], options?: { delimiter?: "," | ";" }): string | Buffer;
}
