import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { ScanForm } from "@/components/scans/scan-form";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui/primitives";
import { OpportunityBadge, ScorePill, WebsiteStatusBadge } from "@/components/ui/badges";
import { fmtRelative, fmtUsd } from "@/components/format";
import { CATEGORIES, categoryLabel } from "@/domain/categories";
import { listPlaceProviders } from "@/providers";
import { getDashboardData } from "@/server/dashboard";

export const dynamic = "force-dynamic";

const SCAN_STATUS: Record<string, string> = {
  PENDING: "En cola",
  DISCOVERING: "Descubriendo",
  ANALYZING: "Analizando",
  COMPLETED: "Completado",
  COMPLETED_WITH_ERRORS: "Con errores",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

export default async function DashboardPage() {
  const d = await getDashboardData();
  const providers = listPlaceProviders().map((p) => ({
    ...p,
    key: p.key === "google_places" ? ("google" as const) : ("osm" as const),
  }));
  const s = d.stats;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Negocios locales con oportunidades de mejora digital, priorizados con evidencias."
      />

      <Card>
        <CardHeader
          title="Nueva exploración"
          description="Introduce una zona: se buscarán negocios, se analizará su web y se calculará la oportunidad."
        />
        <CardBody>
          <ScanForm
            categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label.es }))}
            providers={providers}
          />
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Negocios analizados" value={s.analyzed} href="/businesses" />
        <StatCard label="Oportunidades altas" value={s.high} tone="brand" href="/businesses?level=HIGH" />
        <StatCard
          label="Sin web"
          value={s.noWebsite}
          tone="violet"
          href="/businesses?websiteStatus=SIN_WEB"
        />
        <StatCard label="Web caída" value={s.down} tone="danger" href="/businesses?websiteStatus=WEB_CAIDA" />
        <StatCard
          label="Web con problemas"
          value={s.problems}
          tone="warn"
          href="/businesses?websiteStatus=WEB_FUNCIONAL_CON_PROBLEMAS"
        />
        <StatCard
          label="Problemas de información"
          value={s.infoProblems}
          href="/businesses?infoIssues=true"
        />
        <StatCard label="Con contacto encontrado" value={s.withContact} href="/businesses?hasPhone=true" />
        <StatCard
          label="Última exploración"
          value={d.lastScan ? fmtRelative(d.lastScan.createdAt) : "—"}
          hint={d.lastScan ? `${d.lastScan.city} · ${SCAN_STATUS[d.lastScan.status]}` : undefined}
          href={d.lastScan ? `/scans/${d.lastScan.id}` : undefined}
        />
        <StatCard
          label="Coste estimado (último)"
          value={fmtUsd(d.lastScan?.estimatedCostUsd ?? 0)}
          hint="Según precios de .env"
        />
        <StatCard label="Coste estimado (total)" value={fmtUsd(s.totalCost)} hint="Todas las exploraciones" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Mejores oportunidades"
            description="Ordenadas por Opportunity Score (ayuda para priorizar, no una verdad)."
            action={
              <Link href="/businesses" className="text-xs font-medium text-brand-700 hover:underline">
                Ver todas
              </Link>
            }
          />
          {d.top.length === 0 ? (
            <CardBody>
              <EmptyState
                title="Aún no hay negocios analizados"
                description="Lanza tu primera exploración con el formulario de arriba."
              />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.top.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/businesses/${b.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"
                  >
                    <ScorePill value={b.opportunityScore} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{b.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {b.opportunityReason ?? `${categoryLabel(b.categoryKey)} · ${b.city ?? ""}`}
                      </p>
                    </div>
                    <div className="hidden flex-col items-end gap-1 sm:flex">
                      <WebsiteStatusBadge status={b.websiteStatus} />
                      <OpportunityBadge level={b.opportunityLevel} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Seguimientos"
              icon={<CalendarClock className="h-4 w-4" />}
              action={
                <Link href="/followups" className="text-xs font-medium text-brand-700 hover:underline">
                  Agenda
                </Link>
              }
            />
            <CardBody className="space-y-2">
              {d.due.length === 0 ? (
                <p className="text-sm text-slate-400">No hay seguimientos para hoy.</p>
              ) : (
                d.due.map((b) => (
                  <Link
                    key={b.id}
                    href={`/businesses/${b.id}`}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"
                  >
                    <span className="truncate font-medium text-slate-800">{b.name}</span>
                    <span
                      className={
                        b.nextFollowUpAt && b.nextFollowUpAt < new Date()
                          ? "text-xs font-semibold text-red-600"
                          : "text-xs text-slate-500"
                      }
                    >
                      {fmtRelative(b.nextFollowUpAt)}
                    </span>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Exploraciones recientes"
              action={
                <Link href="/scans" className="text-xs font-medium text-brand-700 hover:underline">
                  Todas
                </Link>
              }
            />
            <CardBody className="space-y-3">
              {d.recentScans.length === 0 ? (
                <p className="text-sm text-slate-400">Todavía no hay exploraciones.</p>
              ) : (
                d.recentScans.map((sc) => (
                  <Link
                    key={sc.id}
                    href={`/scans/${sc.id}`}
                    className="block space-y-1.5 rounded-lg p-2 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">{sc.city}</span>
                      <span className="text-xs text-slate-500">{SCAN_STATUS[sc.status]}</span>
                    </div>
                    <ProgressBar value={sc.totalAnalyzed + sc.totalFailed} max={sc.totalFound} />
                    <p className="text-xs text-slate-500">
                      {sc.totalAnalyzed + sc.totalFailed}/{sc.totalFound} analizados ·{" "}
                      {fmtRelative(sc.createdAt)}
                    </p>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
