import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/db/client";
import { BusinessTable, Pagination } from "@/components/businesses/business-table";
import { FiltersBar } from "@/components/businesses/filters-bar";
import { ScanProgress } from "@/components/scans/scan-progress";
import { Card, CardBody, EmptyState, PageHeader, StatCard } from "@/components/ui/primitives";
import { fmtDateTime, fmtUsd } from "@/components/format";
import { CATEGORIES, categoryLabel } from "@/domain/categories";
import { buildOrderBy, buildWhere, filtersToQuery, parseFilters } from "@/server/business-query";

export const dynamic = "force-dynamic";

export default async function ScanDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan) notFound();
  const filters = { ...parseFilters(await props.searchParams), scanId: id };
  const where = buildWhere(filters);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const [total, items, byStatus, high] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      orderBy: buildOrderBy(filters),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.business.groupBy({
      by: ["websiteStatus"],
      where: { scans: { some: { scanId: id } } },
      _count: { _all: true },
    }),
    prisma.business.count({ where: { scans: { some: { scanId: id } }, opportunityLevel: "HIGH" } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.websiteStatus === s)?._count._all ?? 0;
  const [queued, running, failedJobs] = await Promise.all([
    prisma.scanJob.count({ where: { scanId: id, status: "QUEUED" } }),
    prisma.scanJob.count({ where: { scanId: id, status: "RUNNING" } }),
    prisma.scanJob.count({ where: { scanId: id, status: "FAILED" } }),
  ]);
  const warnings = (scan.warnings as string[] | null) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${scan.city}${scan.region ? `, ${scan.region}` : ""}`}
        description={
          <>
            {scan.country} · radio {scan.radiusKm} km ·{" "}
            {scan.allCategories
              ? "todos los negocios"
              : scan.categories.map((c) => categoryLabel(c)).join(", ")}{" "}
            · máx. {scan.maxResults} ·{" "}
            {scan.providerKey === "google_places" ? "Google Places" : "OpenStreetMap"} ·{" "}
            {fmtDateTime(scan.createdAt)}
            {scan.resolvedLabel && (
              <span className="block text-xs text-slate-400">Zona resuelta: {scan.resolvedLabel}</span>
            )}
          </>
        }
      />
      <Card>
        <CardBody>
          <ScanProgress
            scanId={id}
            initial={{
              status: scan.status,
              totalFound: scan.totalFound,
              processed: scan.totalAnalyzed + scan.totalFailed,
              totalFailed: scan.totalFailed,
              jobs: { queued, running, failed: failedJobs },
            }}
          />
          {scan.errorMessage && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{scan.errorMessage}</p>
          )}
          {warnings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Oportunidades altas" value={high} tone="brand" />
        <StatCard label="Sin web" value={count("SIN_WEB")} tone="violet" />
        <StatCard label="Web caída" value={count("WEB_CAIDA")} tone="danger" />
        <StatCard label="Con problemas" value={count("WEB_FUNCIONAL_CON_PROBLEMAS")} tone="warn" />
        <StatCard
          label="Coste estimado"
          value={fmtUsd(scan.estimatedCostUsd ?? 0)}
          hint={
            Object.entries((scan.apiUsage as Record<string, number> | null) ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ") || undefined
          }
        />
      </div>
      <Suspense>
        <FiltersBar categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label.es }))} cities={[]} />
      </Suspense>
      {items.length === 0 ? (
        <EmptyState
          title={scan.totalFound === 0 ? "Todavía no hay negocios" : "Ningún negocio con estos filtros"}
          description={
            scan.totalFound === 0 ? "Aparecerán aquí a medida que se descubran y analicen." : undefined
          }
        />
      ) : (
        <>
          <BusinessTable items={items} />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            hrefFor={(p) => `/scans/${id}${filtersToQuery({ ...filters, scanId: undefined }, { page: p })}`}
          />
        </>
      )}
    </div>
  );
}
