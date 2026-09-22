"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Filter, Search, X } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";

interface Props {
  categories: { key: string; label: string }[];
  cities: string[];
  hideScan?: boolean;
}

const QUICK: { label: string; params: Record<string, string> }[] = [
  { label: "Alta oportunidad", params: { level: "HIGH" } },
  { label: "Sin web", params: { websiteStatus: "SIN_WEB" } },
  { label: "Web caída", params: { websiteStatus: "WEB_CAIDA" } },
  { label: "Web con problemas", params: { websiteStatus: "WEB_FUNCIONAL_CON_PROBLEMAS" } },
  { label: "Info inconsistente", params: { infoIssues: "true" } },
  { label: "Con teléfono", params: { hasPhone: "true" } },
  { label: "Con email", params: { hasEmail: "true" } },
];

export function FiltersBar({ categories, cities }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [open, setOpen] = useState(false);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const isQuickActive = (p: Record<string, string>) => Object.entries(p).every(([k, v]) => sp.get(k) === v);
  const toggleQuick = (p: Record<string, string>) =>
    update(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, isQuickActive(p) ? null : v])));

  const select = (name: string, label: string, options: [string, string][]) => (
    <label className="block text-xs text-slate-600">
      <span className="mb-1 block font-medium">{label}</span>
      <select
        className={inputClass}
        value={sp.get(name) ?? ""}
        onChange={(e) => update({ [name]: e.target.value })}
      >
        <option value="">Todos</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  const exportHref = (format: string) => {
    const p = new URLSearchParams(sp.toString());
    p.delete("page");
    p.set("format", format);
    return `/api/export?${p.toString()}`;
  };

  return (
    <div className={cn("space-y-3", pending && "opacity-70")}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className={cn(inputClass, "pl-9")}
            placeholder="Buscar por nombre o dirección…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <div className="flex gap-2">
          <button
            className={buttonClass("secondary")}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <Filter className="h-4 w-4" /> Filtros
          </button>
          <a className={buttonClass("secondary")} href={exportHref("csv")}>
            <Download className="h-4 w-4" /> CSV
          </a>
          <a className={cn(buttonClass("ghost"), "hidden sm:inline-flex")} href={exportHref("json")}>
            JSON
          </a>
        </div>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {QUICK.map((f) => (
          <button
            key={f.label}
            onClick={() => toggleQuick(f.params)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
              isQuickActive(f.params)
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            {f.label}
          </button>
        ))}
        {[...sp.keys()].filter((k) => !["page", "sort", "dir"].includes(k)).length > 0 && (
          <button
            onClick={() => start(() => router.replace(pathname))}
            className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            <X className="h-3 w-3" /> Limpiar
          </button>
        )}
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6">
          {select(
            "category",
            "Categoría",
            categories.map((c) => [c.key, c.label]),
          )}
          {select("websiteStatus", "Estado web", [
            ["SIN_WEB", "Sin web"],
            ["WEB_CAIDA", "Web caída"],
            ["WEB_FUNCIONAL_CON_PROBLEMAS", "Web con problemas"],
            ["WEB_ACEPTABLE", "Web aceptable"],
            ["WEB_NO_VERIFICABLE", "No verificable"],
          ])}
          {select("level", "Oportunidad", [
            ["HIGH", "Alta"],
            ["MEDIUM", "Media"],
            ["LOW", "Baja"],
            ["INSUFFICIENT_EVIDENCE", "Evidencia insuficiente"],
          ])}
          {select("leadStatus", "Estado comercial", [
            ["NEW", "Nuevo"],
            ["TO_CONTACT", "Por contactar"],
            ["CONTACTED", "Contactado"],
            ["INTERESTED", "Interesado"],
            ["PROPOSAL_SENT", "Propuesta enviada"],
            ["WON", "Cliente"],
            ["LOST", "Perdido"],
            ["DISCARDED", "Descartado"],
          ])}
          {select(
            "city",
            "Ciudad",
            cities.map((c) => [c, c]),
          )}
          {select("hasWebsite", "Web", [
            ["true", "Con web"],
            ["false", "Sin web"],
          ])}
          {select("technicalIssues", "Problemas técnicos", [
            ["true", "Con problemas"],
            ["false", "Sin problemas"],
          ])}
          {select("infoIssues", "Problemas de información", [
            ["true", "Con problemas"],
            ["false", "Sin problemas"],
          ])}
          {select("hasPhone", "Teléfono", [
            ["true", "Con teléfono"],
            ["false", "Sin teléfono"],
          ])}
          {select("hasEmail", "Email", [
            ["true", "Con email"],
            ["false", "Sin email"],
          ])}
          <label className="block text-xs text-slate-600">
            <span className="mb-1 block font-medium">Rating mínimo</span>
            <input
              type="number"
              step={0.1}
              min={0}
              max={5}
              className={inputClass}
              defaultValue={sp.get("minRating") ?? ""}
              onBlur={(e) => update({ minRating: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-600">
            <span className="mb-1 block font-medium">Rating máximo</span>
            <input
              type="number"
              step={0.1}
              min={0}
              max={5}
              className={inputClass}
              defaultValue={sp.get("maxRating") ?? ""}
              onBlur={(e) => update({ maxRating: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-600">
            <span className="mb-1 block font-medium">Mín. reseñas</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              defaultValue={sp.get("minReviews") ?? ""}
              onBlur={(e) => update({ minReviews: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-600">
            <span className="mb-1 block font-medium">Analizado desde</span>
            <input
              type="date"
              className={inputClass}
              defaultValue={sp.get("analyzedFrom") ?? ""}
              onChange={(e) => update({ analyzedFrom: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-600">
            <span className="mb-1 block font-medium">Analizado hasta</span>
            <input
              type="date"
              className={inputClass}
              defaultValue={sp.get("analyzedTo") ?? ""}
              onChange={(e) => update({ analyzedTo: e.target.value })}
            />
          </label>
          {select("sort", "Ordenar por", [
            ["opportunity", "Oportunidad"],
            ["reviews", "Nº reseñas"],
            ["rating", "Rating"],
            ["websiteScore", "Score web"],
            ["analyzed", "Fecha de análisis"],
            ["name", "Nombre"],
          ])}
        </div>
      )}
    </div>
  );
}
