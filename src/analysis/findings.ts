import type {
  Confidence,
  EvidenceItem,
  Finding,
  FindingCategory,
  Provenance,
  Severity,
} from "@/domain/types";

/** Constructor compacto de hallazgos. */
export function finding(
  code: string,
  category: FindingCategory,
  severity: Severity,
  title: string,
  description: string,
  evidence: EvidenceItem[] = [],
  opts: { provenance?: Provenance; confidence?: Confidence } = {},
): Finding {
  return {
    code,
    category,
    severity,
    title,
    description,
    evidence,
    provenance: opts.provenance ?? "ANALYZED",
    confidence: opts.confidence ?? "HIGH",
  };
}

export const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Evita duplicados por código conservando el más severo. */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  for (const f of findings) {
    const prev = map.get(f.code);
    if (!prev || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[prev.severity]) map.set(f.code, f);
  }
  return sortFindings([...map.values()]);
}
