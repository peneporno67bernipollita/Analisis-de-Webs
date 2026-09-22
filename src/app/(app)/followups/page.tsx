import Link from "next/link";
import { Phone } from "lucide-react";
import { prisma } from "@/db/client";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { LeadStatusBadge, ScorePill, WebsiteStatusBadge } from "@/components/ui/badges";
import { fmtDateTime, fmtRelative } from "@/components/format";
import type { Business } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguimientos" };

function Row({ b, overdue }: { b: Business; overdue?: boolean }) {
  const phone = b.internationalPhone ?? b.nationalPhone;
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <ScorePill value={b.opportunityScore} size="sm" />
      <Link href={`/businesses/${b.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{b.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <LeadStatusBadge status={b.leadStatus} />
          <WebsiteStatusBadge status={b.websiteStatus} />
          <span className={overdue ? "text-xs font-semibold text-red-600" : "text-xs text-slate-500"}>
            {fmtDateTime(b.nextFollowUpAt)} ({fmtRelative(b.nextFollowUpAt)})
          </span>
        </div>
      </Link>
      {phone && (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
          aria-label={`Llamar a ${b.name}`}
        >
          <Phone className="h-4 w-4" />
        </a>
      )}
    </li>
  );
}

export default async function FollowUpsPage() {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const active = { leadStatus: { notIn: ["WON", "LOST", "DISCARDED"] as ("WON" | "LOST" | "DISCARDED")[] } };
  const [overdue, today, upcoming, toContact] = await Promise.all([
    prisma.business.findMany({
      where: { ...active, nextFollowUpAt: { lt: now } },
      orderBy: { nextFollowUpAt: "asc" },
      take: 100,
    }),
    prisma.business.findMany({
      where: { ...active, nextFollowUpAt: { gte: now, lte: endOfToday } },
      orderBy: { nextFollowUpAt: "asc" },
    }),
    prisma.business.findMany({
      where: { ...active, nextFollowUpAt: { gt: endOfToday } },
      orderBy: { nextFollowUpAt: "asc" },
      take: 50,
    }),
    prisma.business.findMany({
      where: { leadStatus: "TO_CONTACT", nextFollowUpAt: null },
      orderBy: [{ opportunityScore: { sort: "desc", nulls: "last" } }],
      take: 50,
    }),
  ]);
  const empty = !overdue.length && !today.length && !upcoming.length && !toContact.length;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Seguimientos"
        description="Tu agenda comercial. Activa las notificaciones en Ajustes para recibir avisos en el móvil."
      />
      {empty && (
        <EmptyState
          title="No tienes seguimientos programados"
          description="Abre la ficha de un negocio, cambia su estado a «Por contactar» o programa un próximo seguimiento."
          action={
            <Link
              href="/businesses?level=HIGH"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Ver oportunidades altas
            </Link>
          }
        />
      )}
      {overdue.length > 0 && (
        <Card>
          <CardHeader title={`Vencidos (${overdue.length})`} />
          <ul className="divide-y divide-slate-100">
            {overdue.map((b) => (
              <Row key={b.id} b={b} overdue />
            ))}
          </ul>
        </Card>
      )}
      {today.length > 0 && (
        <Card>
          <CardHeader title={`Hoy (${today.length})`} />
          <ul className="divide-y divide-slate-100">
            {today.map((b) => (
              <Row key={b.id} b={b} />
            ))}
          </ul>
        </Card>
      )}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader title="Próximos" />
          <ul className="divide-y divide-slate-100">
            {upcoming.map((b) => (
              <Row key={b.id} b={b} />
            ))}
          </ul>
        </Card>
      )}
      {toContact.length > 0 && (
        <Card>
          <CardHeader title="Por contactar (sin fecha)" />
          <ul className="divide-y divide-slate-100">
            {toContact.map((b) => (
              <Row key={b.id} b={b} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
