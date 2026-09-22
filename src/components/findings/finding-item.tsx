import { ExternalLink } from "lucide-react";
import { ConfidenceBadge, ProvenanceBadge, SeverityBadge } from "@/components/ui/badges";
import { SOURCE_LABEL } from "@/domain/labels";
import type { EvidenceItem, Provenance, Severity } from "@/domain/types";
import { safeHttpUrl } from "@/components/format";

export interface FindingView {
  id?: string;
  code: string;
  severity: Severity;
  provenance: Provenance;
  confidence: string;
  title: string;
  description: string;
  items: EvidenceItem[];
}

export function FindingItem({ f, compact }: { f: FindingView; compact?: boolean }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={f.severity} />
        <span className="text-sm font-medium text-slate-900">{f.title}</span>
      </div>
      {!compact && <p className="mt-1 text-sm text-slate-600">{f.description}</p>}
      {!compact && f.items.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
          {f.items.map((e, i) => {
            const href = safeHttpUrl(e.url);
            return (
              <li key={i} className="text-xs text-slate-600">
                <span className="font-medium text-slate-700">{e.label}</span>
                {e.value && (
                  <>
                    : <span className="break-words">{e.value}</span>
                  </>
                )}
                <span className="ml-1 text-slate-400">· {SOURCE_LABEL[e.source] ?? e.source}</span>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="ml-1 inline-flex items-center text-brand-700 hover:underline"
                    title={href}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1">
          <ProvenanceBadge provenance={f.provenance} />
          <ConfidenceBadge confidence={f.confidence} />
          <span className="rounded bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
            {f.code}
          </span>
        </div>
      )}
    </li>
  );
}

export function FindingList({
  findings,
  empty = "Sin hallazgos en esta sección.",
}: {
  findings: FindingView[];
  empty?: string;
}) {
  if (!findings.length) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <ul className="space-y-2">
      {findings.map((f, i) => (
        <FindingItem key={f.id ?? `${f.code}-${i}`} f={f} />
      ))}
    </ul>
  );
}
