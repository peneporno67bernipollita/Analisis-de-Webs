"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ProgressBar, buttonClass } from "@/components/ui/primitives";

const TERMINAL = ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"];
const STATUS_TEXT: Record<string, string> = {
  PENDING: "En cola…",
  DISCOVERING: "Buscando negocios en la zona…",
  ANALYZING: "Analizando negocios…",
  COMPLETED: "Completado",
  COMPLETED_WITH_ERRORS: "Completado con errores",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

interface Progress {
  status: string;
  totalFound: number;
  processed: number;
  totalFailed: number;
  jobs: { queued: number; running: number; failed: number };
}

/** Progreso en vivo ("67/120 negocios analizados"). Refresca la página cuando cambia. */
export function ScanProgress({ scanId, initial }: { scanId: string; initial: Progress }) {
  const router = useRouter();
  const [p, setP] = useState<Progress>(initial);
  const last = useRef(`${initial.status}:${initial.processed}`);

  useEffect(() => {
    if (TERMINAL.includes(p.status)) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Progress;
        setP(data);
        const key = `${data.status}:${data.processed}`;
        if (key !== last.current) {
          last.current = key;
          router.refresh();
        }
      } catch {
        /* reintentar en el siguiente ciclo */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [p.status, scanId, router]);

  async function cancel() {
    await fetch(`/api/scans/${scanId}/cancel`, { method: "POST" });
    router.refresh();
    setP((x) => ({ ...x, status: "CANCELLED" }));
  }

  const running = !TERMINAL.includes(p.status);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-slate-800">
          {running && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
          {STATUS_TEXT[p.status] ?? p.status}
        </span>
        <span className="tabular-nums text-slate-600">
          <strong className="text-slate-900">{p.processed}</strong>/{p.totalFound} negocios analizados
          {p.totalFailed > 0 && <span className="text-red-600"> · {p.totalFailed} con error</span>}
        </span>
      </div>
      <ProgressBar value={p.processed} max={p.totalFound || (running ? 1 : 0)} />
      {running && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {p.jobs.running} en curso · {p.jobs.queued} en cola
          </span>
          <button onClick={cancel} className={buttonClass("ghost", "sm")}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
