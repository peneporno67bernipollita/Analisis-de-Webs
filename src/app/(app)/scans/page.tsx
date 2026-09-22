import Link from "next/link";
import { prisma } from "@/db/client";
import { Card, EmptyState, PageHeader, ProgressBar, buttonClass } from "@/components/ui/primitives";
import { fmtDateTime, fmtUsd } from "@/components/format";
import { categoryLabel } from "@/domain/categories";

export const dynamic = "force-dynamic";
export const metadata = { title: "Escaneos" };

const STATUS: Record<string, string> = {
  PENDING: "En cola",
  DISCOVERING: "Descubriendo",
  ANALYZING: "Analizando",
  COMPLETED: "Completado",
  COMPLETED_WITH_ERRORS: "Completado con errores",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

export default async function ScansPage() {
  const scans = await prisma.scan.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <PageHeader
        title="Escaneos"
        description="Historial de exploraciones por zona."
        actions={
          <Link href="/scans/new" className={buttonClass("primary")}>
            Nuevo escaneo
          </Link>
        }
      />
      {scans.length === 0 ? (
        <EmptyState
          title="Sin escaneos"
          description="Crea tu primera exploración de zona."
          action={
            <Link href="/scans/new" className={buttonClass("primary")}>
              Nuevo escaneo
            </Link>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {scans.map((s) => (
              <li key={s.id}>
                <Link href={`/scans/${s.id}`} className="block px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">
                        {s.city}
                        {s.region ? `, ${s.region}` : ""} · {s.country}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.radiusKm} km ·{" "}
                        {s.allCategories
                          ? "Todos los negocios"
                          : s.categories.map((c) => categoryLabel(c)).join(", ")}{" "}
                        · {s.providerKey === "google_places" ? "Google" : "OSM"} · {fmtDateTime(s.createdAt)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p className="font-medium text-slate-700">{STATUS[s.status]}</p>
                      <p>{fmtUsd(s.estimatedCostUsd ?? 0)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressBar value={s.totalAnalyzed + s.totalFailed} max={s.totalFound} />
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      {s.totalAnalyzed + s.totalFailed}/{s.totalFound}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
