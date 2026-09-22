"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { buttonClass, inputClass, labelClass } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";

interface Props {
  categories: { key: string; label: string }[];
  providers: {
    key: "google" | "osm";
    label: string;
    configured: boolean;
    isDefault: boolean;
    supportsReviews: boolean;
  }[];
  compact?: boolean;
}

export function ScanForm({ categories, providers, compact }: Props) {
  const router = useRouter();
  const defaultProvider =
    providers.find((p) => p.isDefault && p.configured)?.key ??
    providers.find((p) => p.configured)?.key ??
    "osm";
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("España");
  const [radiusKm, setRadiusKm] = useState(5);
  const [maxResults, setMaxResults] = useState(60);
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [provider, setProvider] = useState<"google" | "osm">(defaultProvider);
  const [allCategories, setAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (k: string) => {
    setAll(false);
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  };
  const addFree = () => {
    const parts = freeText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setAll(false);
    setSelected((s) => [...new Set([...s, ...parts])]);
    setFreeText("");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          region,
          country,
          radiusKm,
          maxResults,
          language,
          provider,
          allCategories: allCategories || selected.length === 0,
          categories: allCategories ? [] : selected,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.issues?.map((i: { message: string }) => i.message).join(" · ") ??
            data.error ??
            "No se pudo crear el escaneo",
        );
      router.push(`/scans/${data.scan.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const catLabel = (k: string) => categories.find((c) => c.key === k)?.label ?? k;
  const selectedProvider = providers.find((p) => p.key === provider);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="city">
            Ciudad *
          </label>
          <input
            id="city"
            className={inputClass}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Sevilla"
            required
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="region">
            Provincia / región
          </label>
          <input
            id="region"
            className={inputClass}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Sevilla"
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="country">
            País *
          </label>
          <input
            id="country"
            className={inputClass}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="radius">
            Radio: {radiusKm} km
          </label>
          <input
            id="radius"
            type="range"
            min={0.5}
            max={30}
            step={0.5}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="mt-2 w-full accent-brand-600"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="max">
            Máx. resultados
          </label>
          <input
            id="max"
            type="number"
            min={1}
            max={500}
            className={inputClass}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="lang">
            Idioma
          </label>
          <select
            id="lang"
            className={inputClass}
            value={language}
            onChange={(e) => setLanguage(e.target.value as "es" | "en")}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="provider">
            Proveedor de datos
          </label>
          <select
            id="provider"
            className={inputClass}
            value={provider}
            onChange={(e) => setProvider(e.target.value as "google" | "osm")}
          >
            {providers.map((p) => (
              <option key={p.key} value={p.key} disabled={!p.configured}>
                {p.label}
                {!p.configured ? " (no configurado)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!compact && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={labelClass}>Categorías</span>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={allCategories}
                onChange={(e) => {
                  setAll(e.target.checked);
                  if (e.target.checked) setSelected([]);
                }}
                className="accent-brand-600"
              />
              Todos los negocios
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                type="button"
                key={c.key}
                onClick={() => toggle(c.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  selected.includes(c.key)
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className={inputClass}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFree();
                }
              }}
              placeholder="Otras categorías en texto libre (p. ej. floristerías, ópticas) — solo con Google"
            />
            <button type="button" className={buttonClass("secondary")} onClick={addFree}>
              Añadir
            </button>
          </div>
          {selected.filter((s) => !categories.some((c) => c.key === s)).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected
                .filter((s) => !categories.some((c) => c.key === s))
                .map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                  >
                    {catLabel(s)}
                    <button
                      type="button"
                      aria-label={`Quitar ${s}`}
                      onClick={() => setSelected((x) => x.filter((y) => y !== s))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {selectedProvider?.key === "osm" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          OpenStreetMap es gratuito pero no tiene reseñas y muchas fichas no incluyen la web: los «Sin web» se
          marcarán como evidencia insuficiente salvo que se contrasten con un buscador.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" className={buttonClass("primary")} disabled={busy || !city || !country}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {busy ? "Creando…" : "Iniciar escaneo"}
        </button>
        <span className="text-xs text-slate-500">
          El escaneo se procesa en segundo plano; puedes cerrar la página.
        </span>
      </div>
    </form>
  );
}
