import { Suspense } from "react";
import { prisma } from "@/db/client";
import { BusinessTable, Pagination } from "@/components/businesses/business-table";
import { FiltersBar } from "@/components/businesses/filters-bar";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { CATEGORIES } from "@/domain/categories";
import { buildOrderBy, buildWhere, filtersToQuery, parseFilters } from "@/server/business-query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Negocios" };

export default async function BusinessesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await props.searchParams);
  const where = buildWhere(filters);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const [total, items, cities] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      orderBy: buildOrderBy(filters),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.business.findMany({
      where: { city: { not: null } },
      distinct: ["city"],
      select: { city: true },
      orderBy: { city: "asc" },
      take: 200,
    }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Negocios"
        description="Todos los negocios descubiertos. Filtra, ordena por oportunidad y exporta."
      />
      <Suspense>
        <FiltersBar
          categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label.es }))}
          cities={cities.map((c) => c.city!).filter(Boolean)}
        />
      </Suspense>
      {items.length === 0 ? (
        <EmptyState title="Sin resultados" description="Prueba a quitar filtros o lanza un nuevo escaneo." />
      ) : (
        <>
          <BusinessTable items={items} />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            hrefFor={(p) => `/businesses${filtersToQuery(filters, { page: p })}`}
          />
        </>
      )}
    </div>
  );
}
