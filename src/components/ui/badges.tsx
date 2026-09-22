import {
  CONFIDENCE_LABEL,
  LEAD_STATUS_LABEL,
  OPPORTUNITY_LABEL,
  PROVENANCE_LABEL,
  SEVERITY_LABEL,
  WEBSITE_STATUS_LABEL,
} from "@/domain/labels";
import type {
  Confidence,
  LeadStatus,
  OpportunityLevel,
  Provenance,
  Severity,
  WebsiteStatus,
} from "@/domain/types";
import { cn } from "./cn";

export function Badge({
  className,
  children,
  title,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

const WEB_STYLES: Record<WebsiteStatus, string> = {
  SIN_WEB: "bg-violet-50 text-violet-700 ring-violet-200",
  WEB_CAIDA: "bg-red-50 text-red-700 ring-red-200",
  WEB_FUNCIONAL_CON_PROBLEMAS: "bg-amber-50 text-amber-800 ring-amber-200",
  WEB_ACEPTABLE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  WEB_NO_VERIFICABLE: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function WebsiteStatusBadge({ status }: { status: WebsiteStatus | null | undefined }) {
  if (!status) return <Badge className="bg-slate-50 text-slate-500 ring-slate-200">Sin analizar</Badge>;
  return <Badge className={WEB_STYLES[status]}>{WEBSITE_STATUS_LABEL[status]}</Badge>;
}

const OPP_STYLES: Record<OpportunityLevel, string> = {
  HIGH: "bg-brand-600 text-white ring-brand-600",
  MEDIUM: "bg-brand-50 text-brand-700 ring-brand-200",
  LOW: "bg-slate-50 text-slate-600 ring-slate-200",
  INSUFFICIENT_EVIDENCE:
    "bg-white text-slate-500 ring-slate-300 ring-dashed border border-dashed border-slate-300",
};

export function OpportunityBadge({ level }: { level: OpportunityLevel | null | undefined }) {
  if (!level) return null;
  return <Badge className={OPP_STYLES[level]}>{OPPORTUNITY_LABEL[level]}</Badge>;
}

const SEV_STYLES: Record<Severity, string> = {
  CRITICAL: "bg-red-600 text-white ring-red-600",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-200",
  MEDIUM: "bg-amber-50 text-amber-800 ring-amber-200",
  LOW: "bg-sky-50 text-sky-700 ring-sky-200",
  INFO: "bg-slate-50 text-slate-500 ring-slate-200",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge className={SEV_STYLES[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const style =
    provenance === "INFERRED"
      ? "bg-white text-purple-700 ring-purple-200"
      : provenance === "OBSERVED"
        ? "bg-white text-slate-600 ring-slate-200"
        : "bg-white text-teal-700 ring-teal-200";
  return <Badge className={style}>{PROVENANCE_LABEL[provenance]}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence | string }) {
  const c = (["LOW", "MEDIUM", "HIGH"].includes(confidence) ? confidence : "MEDIUM") as Confidence;
  const style =
    c === "HIGH"
      ? "text-slate-700 ring-slate-300"
      : c === "MEDIUM"
        ? "text-slate-500 ring-slate-200"
        : "text-slate-400 ring-slate-200";
  return <Badge className={cn("bg-white", style)}>{CONFIDENCE_LABEL[c]}</Badge>;
}

const LEAD_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-slate-50 text-slate-600 ring-slate-200",
  TO_CONTACT: "bg-sky-50 text-sky-700 ring-sky-200",
  CONTACTED: "bg-brand-50 text-brand-700 ring-brand-200",
  INTERESTED: "bg-amber-50 text-amber-800 ring-amber-200",
  PROPOSAL_SENT: "bg-violet-50 text-violet-700 ring-violet-200",
  WON: "bg-emerald-600 text-white ring-emerald-600",
  LOST: "bg-slate-100 text-slate-500 ring-slate-200",
  DISCARDED: "bg-slate-100 text-slate-400 ring-slate-200",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge className={LEAD_STYLES[status]}>{LEAD_STATUS_LABEL[status]}</Badge>;
}

/** Valor ausente: nunca se muestra un dato inventado. */
export function NotFound({ label = "No encontrado" }: { label?: string }) {
  return <span className="text-sm italic text-slate-400">{label}</span>;
}

export function ScorePill({
  value,
  size = "md",
}: {
  value: number | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  if (value === null || value === undefined) return <span className="text-sm text-slate-400">—</span>;
  const color =
    value >= 60
      ? "bg-brand-600 text-white"
      : value >= 40
        ? "bg-brand-100 text-brand-800"
        : "bg-slate-100 text-slate-600";
  const dims =
    size === "lg" ? "h-14 min-w-14 text-2xl" : size === "sm" ? "h-6 min-w-8 text-xs" : "h-8 min-w-10 text-sm";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-2 font-bold tabular-nums",
        color,
        dims,
      )}
    >
      {value}
    </span>
  );
}
