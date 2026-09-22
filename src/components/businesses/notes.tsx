"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui/primitives";

export function Notes({
  businessId,
  notes,
}: {
  businessId: string;
  notes: { id: string; content: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/businesses/${businessId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "No se pudo guardar");
      return;
    }
    setText("");
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar esta nota?")) return;
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="space-y-2">
        <textarea
          className={inputClass}
          rows={3}
          maxLength={5000}
          placeholder="Notas de la llamada, interés, presupuesto, próximos pasos…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className={buttonClass("primary", "sm")} disabled={busy || !text.trim()}>
          Añadir nota
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
      {notes.length === 0 ? (
        <p className="text-sm text-slate-400">Sin notas todavía.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="group rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm text-slate-700">{n.content}</p>
                <button
                  onClick={() => remove(n.id)}
                  aria-label="Borrar nota"
                  className="text-slate-300 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {new Date(n.createdAt).toLocaleString("es-ES")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
