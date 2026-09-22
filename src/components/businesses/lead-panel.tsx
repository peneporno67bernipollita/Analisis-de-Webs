"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { LEAD_STATUS_LABEL } from "@/domain/labels";
import type { LeadStatus } from "@/domain/types";
import { buttonClass, inputClass, labelClass } from "@/components/ui/primitives";

function toLocalInput(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60_000).toISOString().slice(0, 16);
}

/** Seguimiento comercial: estado, próximo seguimiento (con aviso push) y "marcar contactado". */
export function LeadPanel({
  businessId,
  leadStatus,
  nextFollowUpAt,
  lastContactedAt,
}: {
  businessId: string;
  leadStatus: LeadStatus;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<LeadStatus>(leadStatus);
  const [followUp, setFollowUp] = useState(toLocalInput(nextFollowUpAt));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/businesses/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al guardar");
      setMsg(okMsg);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const quick = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    setFollowUp(toLocalInput(d.toISOString()));
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass} htmlFor="lead-status">
          Estado comercial
        </label>
        <select
          id="lead-status"
          className={inputClass}
          value={status}
          onChange={(e) => {
            const v = e.target.value as LeadStatus;
            setStatus(v);
            void patch({ leadStatus: v }, "Estado actualizado");
          }}
          disabled={busy}
        >
          {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="follow-up">
          Próximo seguimiento
        </label>
        <input
          id="follow-up"
          type="datetime-local"
          className={inputClass}
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[
            ["Mañana", 1],
            ["3 días", 3],
            ["1 semana", 7],
            ["2 semanas", 14],
          ].map(([l, d]) => (
            <button
              key={l}
              type="button"
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
              onClick={() => quick(d as number)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            className={buttonClass("primary", "sm")}
            disabled={busy}
            onClick={() =>
              patch(
                { nextFollowUpAt: followUp ? new Date(followUp).toISOString() : null },
                followUp ? "Seguimiento programado" : "Seguimiento eliminado",
              )
            }
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar seguimiento
          </button>
          {followUp && (
            <button
              className={buttonClass("ghost", "sm")}
              disabled={busy}
              onClick={() => {
                setFollowUp("");
                void patch({ nextFollowUpAt: null }, "Seguimiento eliminado");
              }}
            >
              Quitar
            </button>
          )}
        </div>
      </div>
      <div className="border-t border-slate-100 pt-3">
        <button
          className={buttonClass("secondary", "sm")}
          disabled={busy}
          onClick={() => patch({ markContacted: true }, "Marcado como contactado")}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como contactado hoy
        </button>
        {lastContactedAt && (
          <p className="mt-1 text-xs text-slate-500">
            Último contacto: {new Date(lastContactedAt).toLocaleString("es-ES")}
          </p>
        )}
      </div>
      {msg && <p className="text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
