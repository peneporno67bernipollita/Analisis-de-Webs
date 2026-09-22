"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";

/** Re-analiza el negocio (encola un job) y refresca la ficha al terminar. */
export function ReanalyzeButton({
  businessId,
  canRefreshProvider,
  initiallyPending,
}: {
  businessId: string;
  canRefreshProvider: boolean;
  initiallyPending: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(initiallyPending);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/businesses/${businessId}/reanalyze`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.pending) {
        setPending(false);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pending, businessId, router]);

  async function run(refreshProvider: boolean) {
    setError(null);
    const res = await fetch(`/api/businesses/${businessId}/reanalyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshProvider }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "No se pudo re-analizar");
      return;
    }
    setPending(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={buttonClass("secondary", "sm")} onClick={() => run(false)} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {pending ? "Analizando…" : "Re-analizar web"}
      </button>
      {canRefreshProvider && !pending && (
        <button
          className={buttonClass("ghost", "sm")}
          title="Vuelve a pedir la ficha a Google (llamada facturable)"
          onClick={() => {
            if (
              confirm(
                "Esto hará una llamada facturable a Google Places para actualizar la ficha. ¿Continuar?",
              )
            )
              void run(true);
          }}
        >
          Actualizar datos del proveedor
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
