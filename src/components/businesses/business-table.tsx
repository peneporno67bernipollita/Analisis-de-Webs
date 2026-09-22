import Link from "next/link";
import { ChevronRight, Mail, Phone } from "lucide-react";
import type { Business } from "@/generated/prisma/client";
import { categoryLabel } from "@/domain/categories";
import {
  LeadStatusBadge,
  NotFound,
  OpportunityBadge,
  ScorePill,
  WebsiteStatusBadge,
} from "@/components/ui/badges";
import { fmtDate, hostOf, safeHttpUrl } from "@/components/format";
import { normalizePhone } from "@/shared/phone";

function phoneOf(b: Business) {
  const raw = b.nationalPhone ?? b.internationalPhone;
  if (!raw) return null;
  return normalizePhone(raw, b.countryCode ?? undefined)?.national ?? raw;
}

function Problems({ b }: { b: Business }) {
  const parts: string[] = [];
  if (b.technicalIssueCount) parts.push(`${b.technicalIssueCount} técnicos`);
  if (b.contentIssueCount) parts.push(`${b.contentIssueCount} contenido`);
  if (b.consistencyIssueCount) parts.push(`${b.consistencyIssueCount} info`);
  return parts.length ? (
    <span className="text-xs text-slate-600">{parts.join(" · ")}</span>
  ) : (
    <span className="text-xs text-slate-400">—</span>
  );
}

/** Tabla principal (escritorio) + tarjetas (móvil). */
export function BusinessTable({ items }: { items: Business[] }) {
  return (
    <>
      <div className="table-scroll hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Negocio</th>
              <th className="px-3 py-3">Categoría</th>
              <th className="px-3 py-3">Ciudad</th>
              <th className="px-3 py-3">Web</th>
              <th className="px-3 py-3">Estado web</th>
              <th className="px-3 py-3 text-center">Opportunity</th>
              <th className="px-3 py-3">Problemas</th>
              <th className="px-3 py-3">Teléfono</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Último análisis</th>
              <th className="px-3 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((b) => {
              const phone = phoneOf(b);
              const web = safeHttpUrl(b.websiteUrl ?? b.providerWebsite);
              return (
                <tr key={b.id} className="hover:bg-slate-50/70">
                  <td className="max-w-[220px] px-4 py-3">
                    <Link
                      href={`/businesses/${b.id}`}
                      className="block truncate font-medium text-slate-900 hover:text-brand-700"
                    >
                      {b.name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <OpportunityBadge level={b.opportunityLevel} />
                      {b.leadStatus !== "NEW" && <LeadStatusBadge status={b.leadStatus} />}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {b.categoryKey ? categoryLabel(b.categoryKey) : (b.primaryCategoryLabel ?? "—")}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{b.city ?? "—"}</td>
                  <td className="max-w-[160px] truncate px-3 py-3">
                    {web ? (
                      <a
                        href={web}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-brand-700 hover:underline"
                      >
                        {hostOf(web)}
                      </a>
                    ) : (
                      <NotFound />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <WebsiteStatusBadge status={b.websiteStatus} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ScorePill value={b.opportunityScore} />
                  </td>
                  <td className="px-3 py-3">
                    <Problems b={b} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {phone ? (
                      <a
                        href={`tel:${b.internationalPhone ?? phone}`}
                        className="text-slate-700 hover:text-brand-700"
                      >
                        {phone}
                      </a>
                    ) : (
                      <NotFound />
                    )}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-3">
                    {b.primaryEmail ? (
                      <a href={`mailto:${b.primaryEmail}`} className="text-slate-700 hover:text-brand-700">
                        {b.primaryEmail}
                      </a>
                    ) : (
                      <NotFound />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">
                    {fmtDate(b.lastAnalyzedAt)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/businesses/${b.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                    >
                      Ficha <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {items.map((b) => {
          const phone = phoneOf(b);
          return (
            <li key={b.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <Link href={`/businesses/${b.id}`} className="flex items-start gap-3">
                <ScorePill value={b.opportunityScore} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{b.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {b.categoryKey ? categoryLabel(b.categoryKey) : (b.primaryCategoryLabel ?? "")} ·{" "}
                    {b.city ?? ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <WebsiteStatusBadge status={b.websiteStatus} />
                    <OpportunityBadge level={b.opportunityLevel} />
                    {b.leadStatus !== "NEW" && <LeadStatusBadge status={b.leadStatus} />}
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 text-slate-300" />
              </Link>
              {(phone || b.primaryEmail) && (
                <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
                  {phone && (
                    <a
                      href={`tel:${b.internationalPhone ?? phone}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-50 py-2 text-xs font-medium text-slate-700"
                    >
                      <Phone className="h-3.5 w-3.5" /> Llamar
                    </a>
                  )}
                  {b.primaryEmail && (
                    <a
                      href={`mailto:${b.primaryEmail}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-50 py-2 text-xs font-medium text-slate-700"
                    >
                      <Mail className="h-3.5 w-3.5" /> Email
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (p: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-xs text-slate-500">{total} negocio(s)</p>;
  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-xs text-slate-500">
        {total} negocios · página {page} de {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
            href={hrefFor(page - 1)}
          >
            Anterior
          </Link>
        )}
        {page < pages && (
          <Link
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
            href={hrefFor(page + 1)}
          >
            Siguiente
          </Link>
        )}
      </div>
    </div>
  );
}
