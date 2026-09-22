import { NextResponse } from "next/server";
import { buildExportRows } from "@/export/build-rows";
import { EXPORTERS } from "@/export/exporters";
import { parseFilters } from "@/server/business-query";
import { guard } from "@/server/http";

export const dynamic = "force-dynamic";

/** GET /api/export?format=csv|json&<filtros de la tabla>&delimiter=comma */
export async function GET(req: Request) {
  const denied = await guard(req, { rate: { key: "export", limit: 30, windowMs: 60 * 60_000 } });
  if (denied) return denied;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const exporter = EXPORTERS[format];
  if (!exporter) return NextResponse.json({ error: "Formato desconocido" }, { status: 400 });
  if (!exporter.implemented)
    return NextResponse.json(
      { error: `Exportación ${format.toUpperCase()} prevista para una versión posterior` },
      { status: 501 },
    );
  const rows = await buildExportRows(parseFilters(url.searchParams));
  const body = exporter.export(rows, {
    delimiter: url.searchParams.get("delimiter") === "comma" ? "," : ";",
  });
  const filename = `negocios-${new Date().toISOString().slice(0, 10)}.${exporter.extension}`;
  return new NextResponse(body as string, {
    headers: {
      "Content-Type": exporter.contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
