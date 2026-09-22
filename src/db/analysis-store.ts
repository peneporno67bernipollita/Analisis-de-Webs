import { prisma } from "./client";
import type { BusinessAnalysisResult } from "@/analysis/pipeline";
import { CONSISTENCY_CATEGORIES, CONTENT_CATEGORIES, TECHNICAL_CATEGORIES } from "@/domain/types";
import type { Prisma } from "@/generated/prisma/client";

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

/**
 * Persiste el resultado de un análisis en una transacción:
 * analyses + website_audits + evidence + recommendations + contacts, y actualiza la
 * instantánea desnormalizada del negocio para listados rápidos.
 */
export async function saveAnalysis(
  businessId: string,
  scanId: string | null,
  r: BusinessAnalysisResult,
  durationMs: number,
) {
  const technical = r.findings.filter(
    (f) => TECHNICAL_CATEGORIES.includes(f.category) && f.severity !== "INFO",
  );
  const content = r.findings.filter((f) => CONTENT_CATEGORIES.includes(f.category) && f.severity !== "INFO");
  const consistency = r.findings.filter(
    (f) => CONSISTENCY_CATEGORIES.includes(f.category) && f.severity !== "INFO",
  );
  const email = r.contacts.find((c) => c.type === "EMAIL")?.value ?? null;
  const instagram = r.contacts.find((c) => c.type === "INSTAGRAM")?.value ?? null;
  const facebook = r.contacts.find((c) => c.type === "FACEBOOK")?.value ?? null;
  const whatsapp = r.contacts.find((c) => c.type === "WHATSAPP")?.value ?? null;
  const reason = r.score.contributions
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((c) => `+${Math.round(c.points)} ${c.reason}`)
    .join("; ");

  return prisma.$transaction(async (tx) => {
    const analysis = await tx.analysis.create({
      data: {
        businessId,
        scanId,
        status: r.status,
        websiteStatus: r.websiteStatus,
        websiteUrl: r.websiteUrl ?? null,
        websiteSource: r.websiteSource,
        opportunityScore: r.score.opportunityScore,
        opportunityLevel: r.score.level,
        websiteOpportunityScore: r.score.components.websiteOpportunity,
        websiteScore: r.score.components.technicalWebsite,
        informationFreshnessScore: r.score.components.informationConsistency,
        contactScore: r.score.components.digitalContactability,
        evidenceConfidenceScore: r.score.components.evidenceConfidence,
        scoreBreakdown: json({
          ...r.score,
          websiteStatusReason: r.websiteStatusReason,
          comparisons: r.comparisons,
        }),
        summary: r.summary,
        unverified: json(r.unverified),
        reviewSignals: json(r.reviewSignals),
        errors: r.errors.length ? json(r.errors) : undefined,
        durationMs,
      },
    });

    if (r.audit) {
      const a = r.audit;
      await tx.websiteAudit.create({
        data: {
          analysisId: analysis.id,
          businessId,
          requestedUrl: a.requestedUrl,
          finalUrl: a.finalUrl ?? null,
          httpStatus: a.httpStatus ?? null,
          redirectChain: a.redirectChain ? json(a.redirectChain) : undefined,
          isHttps: a.isHttps ?? null,
          tls: a.tls ? json(a.tls) : undefined,
          responseTimeMs: a.responseTimeMs ?? null,
          htmlBytes: a.htmlBytes ?? null,
          pages: json(a.pages),
          resourceStats: a.resourceStats ? json(a.resourceStats) : undefined,
          linkChecks: a.linkChecks ? json(a.linkChecks) : undefined,
          tech: a.tech ? json(a.tech) : undefined,
          robots: a.robots ? json(a.robots) : undefined,
          // Solo datos de contacto/estructura extraídos: no se guarda el HTML ni textos completos
          extracted: a.extraction ? json({ ...a.extraction, textSample: undefined }) : undefined,
          checks: json({
            status: a.status,
            reason: a.statusReason,
            technicalScore: a.technicalScore,
            analysisComplete: a.analysisComplete,
          }),
          renderedWithBrowser: a.renderedWithBrowser,
          errorCode: a.errorCode ?? null,
          errorMessage: a.errorMessage ?? null,
        },
      });
    }

    if (r.findings.length) {
      await tx.evidence.createMany({
        data: r.findings.map((f) => ({
          analysisId: analysis.id,
          businessId,
          code: f.code,
          category: f.category,
          severity: f.severity,
          provenance: f.provenance,
          confidence: f.confidence,
          title: f.title,
          description: f.description,
          items: json(f.evidence),
        })),
      });
    }
    if (r.recommendations.length) {
      await tx.recommendation.createMany({
        data: r.recommendations.map((rec) => ({ analysisId: analysis.id, businessId, ...rec })),
      });
    }

    // Contactos: se reemplazan por los del último análisis
    await tx.contact.deleteMany({ where: { businessId } });
    if (r.contacts.length) {
      await tx.contact.createMany({
        data: r.contacts.map((c) => ({
          businessId,
          analysisId: analysis.id,
          type: c.type,
          value: c.value,
          label: c.label ?? null,
          source: c.source,
          sourceUrl: c.sourceUrl ?? null,
          provenance: c.provenance,
          confidence: c.confidence,
        })),
        skipDuplicates: true,
      });
    }

    await tx.business.update({
      where: { id: businessId },
      data: {
        websiteStatus: r.websiteStatus,
        websiteUrl: r.websiteSource === "none" ? null : (r.websiteUrl ?? null),
        opportunityScore: r.score.opportunityScore,
        opportunityLevel: r.score.level,
        websiteScore: r.score.components.technicalWebsite,
        informationFreshnessScore: r.score.components.informationConsistency,
        contactScore: r.score.components.digitalContactability,
        evidenceConfidenceScore: r.score.components.evidenceConfidence,
        technicalIssueCount: technical.length,
        contentIssueCount: content.length,
        consistencyIssueCount: consistency.length,
        hasPhone: r.contacts.some((c) => c.type === "PHONE"),
        hasEmail: Boolean(email),
        primaryEmail: email,
        instagramUrl: instagram,
        facebookUrl: facebook,
        whatsappUrl: whatsapp,
        opportunityReason: reason || null,
        lastAnalyzedAt: new Date(),
        latestAnalysisId: analysis.id,
      },
    });
    return analysis;
  });
}
