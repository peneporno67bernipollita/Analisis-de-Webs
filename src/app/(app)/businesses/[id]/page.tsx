import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink, HelpCircle, ShoppingBag } from "lucide-react";
import { prisma } from "@/db/client";
import { ContactActions } from "@/components/businesses/contact-actions";
import { LeadPanel } from "@/components/businesses/lead-panel";
import { Notes } from "@/components/businesses/notes";
import { ReanalyzeButton } from "@/components/businesses/reanalyze-button";
import { FindingList, type FindingView } from "@/components/findings/finding-item";
import {
  ConfidenceBadge,
  LeadStatusBadge,
  NotFound,
  OpportunityBadge,
  ProvenanceBadge,
  ScorePill,
  WebsiteStatusBadge,
} from "@/components/ui/badges";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { fmtDate, fmtDateTime, fmtRelative, hostOf, safeHttpUrl } from "@/components/format";
import { categoryLabel } from "@/domain/categories";
import {
  OPPORTUNITY_LABEL,
  SOURCE_LABEL,
  WEBSITE_STATUS_DESCRIPTION,
  WEBSITE_STATUS_LABEL,
} from "@/domain/labels";
import {
  TECHNICAL_CATEGORIES,
  CONTENT_CATEGORIES,
  type EvidenceItem,
  type ReviewSignal,
  type ScoreBreakdown,
} from "@/domain/types";
import type { FieldComparison } from "@/analysis/freshness/consistency";
import { normalizePhone } from "@/shared/phone";

export const dynamic = "force-dynamic";

const SECTIONS = [
  ["resumen", "Resumen"],
  ["negocio", "Negocio"],
  ["contacto", "Contacto"],
  ["web", "Web actual"],
  ["auditoria", "Auditoría técnica"],
  ["desactualizada", "Info desactualizada"],
  ["resenas", "Reseñas"],
  ["oportunidades", "Oportunidades"],
  ["evidencias", "Evidencias"],
  ["recomendaciones", "Qué ofrecer"],
  ["historial", "Historial"],
  ["notas", "Notas"],
] as const;

const CONTACT_LABEL: Record<string, string> = {
  PHONE: "Teléfono",
  EMAIL: "Email",
  CONTACT_FORM: "Formulario de contacto",
  WHATSAPP: "WhatsApp",
  CONTACT_PAGE: "Página de contacto",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  LINKEDIN: "LinkedIn",
  X: "X / Twitter",
  YOUTUBE: "YouTube",
  BOOKING_PAGE: "Reservas / plataforma",
  OTHER: "Otro",
};

function Field({
  label,
  children,
  provenance,
}: {
  label: string;
  children: React.ReactNode;
  provenance?: "OBSERVED" | "INFERRED" | "ANALYZED";
}) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 flex flex-wrap items-center gap-1.5 break-words text-slate-800">
        {children}
        {provenance && <ProvenanceBadge provenance={provenance} />}
      </dd>
    </div>
  );
}

const COMPARISON_STYLE: Record<FieldComparison["result"], [string, string]> = {
  match: ["Coincide", "text-emerald-700"],
  mismatch: ["Conflicto", "text-red-700 font-semibold"],
  not_comparable: ["No comparable", "text-slate-400"],
  missing_in_provider: ["Falta en la ficha", "text-amber-700"],
  missing_in_website: ["Falta en la web", "text-amber-700"],
};

export default async function BusinessDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const b = await prisma.business.findUnique({
    where: { id },
    include: { contacts: true, notes: { orderBy: { createdAt: "desc" } } },
  });
  if (!b) notFound();
  const [analysis, history, pending] = await Promise.all([
    b.latestAnalysisId
      ? prisma.analysis.findUnique({
          where: { id: b.latestAnalysisId },
          include: { audit: true, evidence: true, recommendations: { orderBy: { priority: "asc" } } },
        })
      : null,
    prisma.analysis.findMany({
      where: { businessId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        status: true,
        websiteStatus: true,
        opportunityScore: true,
        opportunityLevel: true,
        durationMs: true,
      },
    }),
    prisma.scanJob.findFirst({
      where: { businessId: id, status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true },
    }),
  ]);

  const breakdown = analysis?.scoreBreakdown as
    (ScoreBreakdown & { websiteStatusReason?: string; comparisons?: FieldComparison[] }) | undefined;
  const findings: FindingView[] = (analysis?.evidence ?? []).map((e) => ({
    id: e.id,
    code: e.code,
    severity: e.severity,
    provenance: e.provenance,
    confidence: e.confidence,
    title: e.title,
    description: e.description,
    items: (e.items as unknown as EvidenceItem[]) ?? [],
  }));
  const catOf = (code: string) => analysis?.evidence.find((e) => e.code === code)?.category ?? "";
  const technical = findings.filter((f) =>
    [...TECHNICAL_CATEGORIES, ...CONTENT_CATEGORIES].includes(catOf(f.code) as never),
  );
  const freshness = findings.filter((f) => ["FRESHNESS", "CONSISTENCY"].includes(catOf(f.code)));
  const reviewSignals = (analysis?.reviewSignals as ReviewSignal[] | null) ?? [];
  const unverified = (analysis?.unverified as string[] | null) ?? [];
  const audit = analysis?.audit;
  const pname = b.providerKey === "google_places" ? "Google" : "OpenStreetMap";
  const provSource = b.providerKey === "google_places" ? "google_places" : "osm";
  const phones = b.contacts.filter((c) => c.type === "PHONE");
  const primaryPhone = b.internationalPhone ?? phones[0]?.value ?? null;
  const displayPhone = (v: string) => normalizePhone(v, b.countryCode ?? undefined)?.national ?? v;
  const email = b.contacts.find((c) => c.type === "EMAIL")?.value ?? null;
  const whatsapp = b.contacts.find((c) => c.type === "WHATSAPP")?.value ?? null;
  const website = b.websiteUrl ?? (b.websiteStatus !== "SIN_WEB" ? b.providerWebsite : null);
  const topProblems = findings
    .filter((f) => ["CRITICAL", "HIGH", "MEDIUM"].includes(f.severity) && !catOf(f.code).startsWith("REVIEW"))
    .slice(0, 3);
  const hours =
    (b.openingHours as { weekdayDescriptions?: string[]; raw?: string; alwaysOpen?: boolean } | null) ?? null;

  return (
    <div className="space-y-5">
      <Link
        href="/businesses"
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Negocios
      </Link>

      {/* Cabecera */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <ScorePill value={b.opportunityScore} size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{b.name}</h1>
            <p className="text-sm text-slate-500">
              {b.categoryKey ? categoryLabel(b.categoryKey) : (b.primaryCategoryLabel ?? "Sin categoría")} ·{" "}
              {b.city ?? "Ciudad no disponible"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <WebsiteStatusBadge status={b.websiteStatus} />
              <OpportunityBadge level={b.opportunityLevel} />
              <LeadStatusBadge status={b.leadStatus} />
            </div>
          </div>
        </div>
        <div className="space-y-2 lg:text-right">
          <ContactActions
            phone={primaryPhone}
            email={email}
            whatsapp={whatsapp}
            mapsUrl={b.mapsUrl}
            website={website}
          />
          <ReanalyzeButton
            businessId={b.id}
            canRefreshProvider={b.providerKey === "google_places"}
            initiallyPending={Boolean(pending)}
          />
        </div>
      </div>

      {/* Navegación de secciones */}
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 text-xs" aria-label="Secciones">
        {SECTIONS.map(([anchor, label]) => (
          <a
            key={anchor}
            href={`#${anchor}`}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 hover:border-slate-300"
          >
            {label}
          </a>
        ))}
      </nav>

      {!analysis ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-600">
              Este negocio todavía no tiene análisis.{" "}
              {pending ? "Hay un análisis en curso." : "Pulsa «Re-analizar web» para lanzarlo."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {/* 1. Resumen */}
            <Card id="resumen">
              <CardHeader
                title="1. Resumen"
                description={`Análisis del ${fmtDateTime(analysis.createdAt)}${analysis.status === "PARTIAL" ? " · análisis parcial" : ""}`}
              />
              <CardBody className="space-y-4">
                <p className="text-sm text-slate-700">{analysis.summary}</p>
                <div className="rounded-xl bg-brand-50/60 p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-900">
                    <HelpCircle className="h-4 w-4" /> ¿Merece la pena contactar? (tú decides)
                  </p>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-slate-500">¿Por qué aparece?</dt>
                      <dd className="text-slate-800">{b.opportunityReason ?? "Sin motivos destacados"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">¿Qué problema tiene?</dt>
                      <dd className="text-slate-800">
                        {topProblems.length
                          ? topProblems.map((f) => f.title).join(" · ")
                          : WEBSITE_STATUS_LABEL[analysis.websiteStatus]}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">¿Qué evidencia existe?</dt>
                      <dd className="text-slate-800">
                        {findings.length} hallazgo(s) con evidencias ·{" "}
                        <a href="#evidencias" className="text-brand-700 hover:underline">
                          ver
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">¿Qué contacto tengo?</dt>
                      <dd className="text-slate-800">
                        {b.contacts.length
                          ? [...new Set(b.contacts.map((c) => CONTACT_LABEL[c.type]))].slice(0, 5).join(", ")
                          : "Ninguno encontrado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">¿Qué podría ofrecerle?</dt>
                      <dd className="text-slate-800">
                        {analysis.recommendations
                          .slice(0, 3)
                          .map((r) => r.productType)
                          .join(", ") || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-500">¿Qué no está verificado?</dt>
                      <dd className="text-slate-800">
                        {unverified.length ? `${unverified.length} aspecto(s) — ver abajo` : "Nada relevante"}
                      </dd>
                    </div>
                  </dl>
                </div>
                {breakdown && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[
                      ["Oportunidad web", breakdown.components.websiteOpportunity],
                      ["Web técnica", breakdown.components.technicalWebsite],
                      ["Consistencia info", breakdown.components.informationConsistency],
                      ["Contactabilidad", breakdown.components.digitalContactability],
                      ["Confianza evidencia", breakdown.components.evidenceConfidence],
                    ].map(([label, v]) => (
                      <div key={label as string} className="rounded-lg border border-slate-100 p-2.5">
                        <p className="text-[11px] text-slate-500">{label}</p>
                        <p className="text-lg font-bold tabular-nums text-slate-900">
                          {v === null || v === undefined ? (
                            <span className="text-sm font-normal text-slate-400">No verificado</span>
                          ) : (
                            v
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {unverified.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                      <AlertTriangle className="h-3.5 w-3.5" /> Datos no verificados
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-900">
                      {unverified.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* 2. Información del negocio */}
            <Card id="negocio">
              <CardHeader
                title="2. Información del negocio"
                description={`Fuente: ${pname}. Datos obtenidos ${b.providerDataFetchedAt ? fmtRelative(b.providerDataFetchedAt) : "—"}.`}
              />
              <CardBody>
                <dl className="divide-y divide-slate-100">
                  <Field label="Nombre" provenance="OBSERVED">
                    {b.name}
                  </Field>
                  <Field label="Categoría">
                    {b.primaryCategoryLabel ?? <NotFound />}{" "}
                    {b.categoryKey && (
                      <span className="text-xs text-slate-400">
                        (catálogo: {categoryLabel(b.categoryKey)})
                      </span>
                    )}
                  </Field>
                  <Field label="Categorías secundarias">
                    {b.secondaryCategories.length ? (
                      <span className="text-xs text-slate-600">
                        {b.secondaryCategories.slice(0, 8).join(", ")}
                      </span>
                    ) : (
                      <NotFound />
                    )}
                  </Field>
                  <Field label="Dirección" provenance={b.formattedAddress ? "OBSERVED" : undefined}>
                    {b.formattedAddress ?? <NotFound />}
                  </Field>
                  <Field label="Ciudad / provincia / país">
                    {[b.city, b.region, b.country].filter(Boolean).join(" · ") || <NotFound />}
                  </Field>
                  <Field label="Coordenadas">
                    {b.lat !== null && b.lng !== null ? (
                      `${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}`
                    ) : (
                      <NotFound />
                    )}
                  </Field>
                  <Field label="Valoración" provenance={b.rating !== null ? "OBSERVED" : undefined}>
                    {b.rating !== null ? (
                      `${b.rating.toFixed(1)} ★ (${b.userRatingCount ?? 0} reseñas)`
                    ) : (
                      <NotFound label={b.providerKey === "osm" ? "No disponible en OSM" : "No encontrado"} />
                    )}
                    {b.rating !== null && (
                      <span className="text-xs text-slate-400">No se usa en el score</span>
                    )}
                  </Field>
                  <Field label="Horario" provenance={hours ? "OBSERVED" : undefined}>
                    {hours?.alwaysOpen ? (
                      "Abierto 24 h"
                    ) : hours?.weekdayDescriptions?.length ? (
                      <ul className="text-xs text-slate-700">
                        {hours.weekdayDescriptions.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    ) : hours?.raw ? (
                      <span className="font-mono text-xs">{hours.raw}</span>
                    ) : (
                      <NotFound />
                    )}
                  </Field>
                  <Field label="Estado del negocio">
                    {b.businessStatus ?? <NotFound label="No verificado" />}
                  </Field>
                  <Field label={`Ficha en ${pname}`}>
                    {safeHttpUrl(b.mapsUrl) ? (
                      <a
                        href={safeHttpUrl(b.mapsUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                      >
                        Abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <NotFound />
                    )}
                  </Field>
                  <Field label="Identificador">
                    <span className="font-mono text-xs text-slate-500">
                      {b.providerKey}:{b.providerPlaceId}
                    </span>
                  </Field>
                </dl>
              </CardBody>
            </Card>

            {/* 3. Contacto */}
            <Card id="contacto">
              <CardHeader
                title="3. Contacto"
                description="Solo datos empresariales públicos, con su fuente. No se generan emails por patrón."
              />
              <CardBody>
                {b.contacts.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No se ha encontrado ninguna forma de contacto pública.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {b.contacts.map((c) => {
                      const href =
                        c.type === "PHONE"
                          ? `tel:${c.value}`
                          : c.type === "EMAIL"
                            ? `mailto:${c.value}`
                            : safeHttpUrl(c.value);
                      return (
                        <li
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">{CONTACT_LABEL[c.type]}</p>
                            {href ? (
                              <a
                                href={href}
                                target={c.type === "PHONE" || c.type === "EMAIL" ? undefined : "_blank"}
                                rel="noopener noreferrer nofollow"
                                className="break-all font-medium text-slate-800 hover:text-brand-700"
                              >
                                {c.type === "PHONE"
                                  ? displayPhone(c.value)
                                  : c.value.replace(/^https?:\/\/(www\.)?/, "")}
                              </a>
                            ) : (
                              <span className="font-medium text-slate-800">{c.value}</span>
                            )}
                            {c.label && c.type !== "PHONE" && (
                              <span className="ml-1 text-xs text-slate-400">({c.label})</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                            <span>{SOURCE_LABEL[c.source] ?? c.source}</span>
                            {safeHttpUrl(c.sourceUrl) && (
                              <a
                                href={safeHttpUrl(c.sourceUrl)}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="text-brand-700 hover:underline"
                                title={c.sourceUrl ?? ""}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            <ConfidenceBadge confidence={c.confidence} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {!b.contacts.some((c) => c.type === "EMAIL") && (
                    <span className="text-slate-500">
                      Email: <NotFound />
                    </span>
                  )}
                  {!b.contacts.some((c) => c.type === "PHONE") && (
                    <span className="text-slate-500">
                      Teléfono: <NotFound />
                    </span>
                  )}
                  {!b.contacts.some((c) => c.type === "WHATSAPP") && (
                    <span className="text-slate-500">
                      WhatsApp: <NotFound />
                    </span>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* 4. Web actual */}
            <Card id="web">
              <CardHeader
                title="4. Web actual"
                description={WEBSITE_STATUS_DESCRIPTION[analysis.websiteStatus]}
              />
              <CardBody>
                <dl className="divide-y divide-slate-100">
                  <Field label="Estado">
                    <WebsiteStatusBadge status={analysis.websiteStatus} />{" "}
                    <span className="text-sm text-slate-600">{breakdown?.websiteStatusReason}</span>
                  </Field>
                  <Field
                    label={`Web en la ficha de ${pname}`}
                    provenance={b.providerWebsite ? "OBSERVED" : undefined}
                  >
                    {safeHttpUrl(b.providerWebsite) ? (
                      <a
                        href={safeHttpUrl(b.providerWebsite)}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="break-all text-brand-700 hover:underline"
                      >
                        {b.providerWebsite}
                      </a>
                    ) : (
                      <NotFound label="No publicada" />
                    )}
                  </Field>
                  {analysis.websiteSource === "search" && (
                    <Field label="Web encontrada vía buscador" provenance="ANALYZED">
                      {analysis.websiteUrl}
                    </Field>
                  )}
                  {audit && (
                    <>
                      <Field label="URL final">
                        {audit.finalUrl ? (
                          <span className="break-all">{audit.finalUrl}</span>
                        ) : (
                          <NotFound label="No disponible" />
                        )}
                      </Field>
                      <Field label="Respuesta HTTP">
                        {audit.httpStatus ?? "—"} {audit.responseTimeMs ? `· ${audit.responseTimeMs} ms` : ""}{" "}
                        {audit.isHttps ? "· HTTPS" : audit.isHttps === false ? "· sin HTTPS" : ""}
                      </Field>
                      {Array.isArray(audit.redirectChain) &&
                        (audit.redirectChain as { url: string; status: number }[]).length > 0 && (
                          <Field label="Redirecciones">
                            <span className="text-xs">
                              {(audit.redirectChain as { url: string; status: number }[])
                                .map((r) => `${r.status} ${hostOf(r.url)}`)
                                .join(" → ")}
                            </span>
                          </Field>
                        )}
                      {audit.tech && Object.keys(audit.tech as object).length > 0 && (
                        <Field label="Tecnología detectada">
                          {Object.entries(audit.tech as Record<string, string>)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </Field>
                      )}
                      <Field label="Páginas analizadas">
                        <span className="text-xs">
                          {((audit.pages as { url: string; status?: number; kind: string }[] | null) ?? [])
                            .map((p) => `${p.kind} (${p.status ?? "error"})`)
                            .join(", ") || "—"}
                        </span>
                      </Field>
                      <Field label="Renderizado con navegador">
                        {audit.renderedWithBrowser ? "Sí" : "No"}
                      </Field>
                    </>
                  )}
                </dl>
              </CardBody>
            </Card>

            {/* 5. Auditoría técnica */}
            <Card id="auditoria">
              <CardHeader
                title="5. Auditoría técnica y de experiencia"
                description={`Score técnico: ${analysis.websiteScore ?? "N/A"}/100 · CRÍTICO > ALTO > MEDIO > BAJO`}
              />
              <CardBody>
                <FindingList
                  findings={technical}
                  empty={
                    analysis.websiteStatus === "SIN_WEB"
                      ? "No hay web propia que auditar."
                      : "Sin problemas técnicos detectados."
                  }
                />
              </CardBody>
            </Card>

            {/* 6. Información posiblemente desactualizada */}
            <Card id="desactualizada">
              <CardHeader
                title="6. Información posiblemente desactualizada"
                description={`Comparación entre ${pname} y la web. Ante un conflicto se muestran ambas fuentes, sin elegir ninguna.`}
              />
              <CardBody className="space-y-4">
                {breakdown?.comparisons?.length ? (
                  <div className="table-scroll">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs text-slate-500">
                        <tr>
                          <th className="py-1 pr-3">Dato</th>
                          <th className="py-1 pr-3">{pname}</th>
                          <th className="py-1 pr-3">Web</th>
                          <th className="py-1">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {breakdown.comparisons.map((c, i) => (
                          <tr key={i}>
                            <td className="py-2 pr-3 text-slate-600">{c.label}</td>
                            <td className="py-2 pr-3">{c.providerValue ?? <NotFound />}</td>
                            <td className="py-2 pr-3">{c.websiteValue ?? <NotFound />}</td>
                            <td className={`py-2 text-xs ${COMPARISON_STYLE[c.result][1]}`}>
                              {COMPARISON_STYLE[c.result][0]}
                              {c.note ? ` · ${c.note}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No hay datos comparables (sin web analizable).</p>
                )}
                <FindingList findings={freshness} empty="No se han encontrado señales de desactualización." />
              </CardBody>
            </Card>

            {/* 7. Reseñas */}
            <Card id="resenas">
              <CardHeader
                title="7. Señales derivadas de reseñas"
                description="Señal secundaria: una reseña no demuestra por sí sola que la web esté desactualizada. Solo se guarda un fragmento corto como evidencia."
              />
              <CardBody>
                {reviewSignals.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    {b.providerKey === "osm"
                      ? "OpenStreetMap no ofrece reseñas."
                      : "No se han detectado menciones relevantes (o no había reseñas disponibles; Google devuelve como máximo 5)."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {reviewSignals.map((s, i) => (
                      <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-slate-800">{s.label}</span>
                          <ConfidenceBadge confidence={s.confidence} />
                          <span className="text-xs text-slate-400">
                            {SOURCE_LABEL[s.source]} {s.publishTime ? `· ${fmtDate(s.publishTime)}` : ""}{" "}
                            {s.rating ? `· ${s.rating}★` : ""}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-600">«{s.evidence}»</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* 8. Oportunidades */}
            <Card id="oportunidades">
              <CardHeader
                title={`8. Oportunidades · Opportunity Score ${analysis.opportunityScore}`}
                description={`${OPPORTUNITY_LABEL[analysis.opportunityLevel]} — ${breakdown?.levelReason ?? ""}`}
              />
              <CardBody className="space-y-3">
                <ul className="space-y-1">
                  {(breakdown?.contributions ?? []).map((c, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span
                        className={`w-12 shrink-0 text-right font-mono font-semibold tabular-nums ${c.points >= 0 ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {c.points >= 0 ? "+" : ""}
                        {Math.round(c.points * 10) / 10}
                      </span>
                      <span className="text-slate-700">
                        {c.reason}
                        {c.inferred && <span className="ml-1 text-xs text-purple-700">(inferencia)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {breakdown?.notes?.length ? (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-500">
                    {breakdown.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                ) : null}
                {breakdown?.evidenceConfidenceReasons?.length ? (
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer">
                      Cómo se calcula la confianza de la evidencia ({breakdown.components.evidenceConfidence})
                    </summary>
                    <ul className="mt-1 list-disc pl-5">
                      {breakdown.evidenceConfidenceReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </CardBody>
            </Card>

            {/* 9. Evidencias */}
            <Card id="evidencias">
              <CardHeader
                title="9. Evidencias"
                description="Todos los hallazgos con su procedencia (obtenido / analizado / inferencia) y confianza."
              />
              <CardBody>
                <FindingList findings={findings} />
              </CardBody>
            </Card>

            {/* 10. Recomendaciones */}
            <Card id="recomendaciones">
              <CardHeader
                title="10. ¿Qué podría venderle a este negocio?"
                icon={<ShoppingBag className="h-4 w-4" />}
                description="Cada recomendación está vinculada a hallazgos concretos."
              />
              <CardBody>
                {analysis.recommendations.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Sin recomendaciones: no hay evidencias que las justifiquen.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {analysis.recommendations.map((r) => (
                      <li key={r.id} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                            {r.productType}
                          </span>
                          <span className="text-sm font-medium text-slate-900">{r.title}</span>
                          <span className="text-xs text-slate-400">Prioridad {r.priority}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{r.description}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">
                          Basado en: {r.triggeredBy.join(", ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* 11. Historial */}
            <Card id="historial">
              <CardHeader title="11. Historial de análisis" />
              <CardBody>
                <ul className="divide-y divide-slate-100 text-sm">
                  {history.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="text-slate-600">{fmtDateTime(h.createdAt)}</span>
                      <span className="flex items-center gap-2">
                        <WebsiteStatusBadge status={h.websiteStatus} />
                        <ScorePill value={h.opportunityScore} size="sm" />
                        <span className="text-xs text-slate-400">
                          {h.status === "PARTIAL" ? "parcial" : ""}{" "}
                          {h.durationMs ? `${Math.round(h.durationMs / 1000)} s` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          {/* Columna lateral: seguimiento comercial + notas */}
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Seguimiento comercial"
                description="Estado del contacto y próximo aviso en el móvil."
              />
              <CardBody>
                <LeadPanel
                  businessId={b.id}
                  leadStatus={b.leadStatus}
                  nextFollowUpAt={b.nextFollowUpAt?.toISOString() ?? null}
                  lastContactedAt={b.lastContactedAt?.toISOString() ?? null}
                />
              </CardBody>
            </Card>
            <Card id="notas">
              <CardHeader title="12. Notas manuales" />
              <CardBody>
                <Notes
                  businessId={b.id}
                  notes={b.notes.map((n) => ({
                    id: n.id,
                    content: n.content,
                    createdAt: n.createdAt.toISOString(),
                  }))}
                />
              </CardBody>
            </Card>
            <p className="px-1 text-xs text-slate-400">
              Datos de {pname} ({provSource === "osm" ? "© OpenStreetMap contributors, ODbL" : "Google Maps"}
              ). El score es una ayuda para priorizar, no una verdad.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
