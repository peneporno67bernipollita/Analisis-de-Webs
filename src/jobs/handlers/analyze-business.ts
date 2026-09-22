import { analyzeBusiness, type BusinessAnalysisResult } from "@/analysis/pipeline";
import { DefaultContactDiscovery } from "@/analysis/contacts/discovery";
import { KeywordReviewAnalyzer } from "@/analysis/reviews/analyzer";
import { RuleBasedScoringEngine } from "@/analysis/scoring/engine";
import { HttpWebsiteAnalyzer } from "@/analysis/website/analyzer";
import { saveAnalysis } from "@/db/analysis-store";
import { prisma } from "@/db/client";
import { businessToPlace, placeToBusinessData } from "@/db/mappers";
import { createUsageRecorder, type UsageRecorder } from "@/domain/ports";
import type { PlaceProviderKey, ReviewInput } from "@/domain/types";
import { getPlaceProvider, getSearchProvider } from "@/providers";
import { NotFoundError } from "@/shared/errors";
import { addScanUsage } from "../scan-progress";

/**
 * ANALYSIS + ENRICHMENT de un negocio: detección de web, auditoría, contactos, reseñas,
 * scoring y persistencia. Un fallo aquí nunca aborta el escaneo completo.
 */
export async function runBusinessAnalysis(
  businessId: string,
  opts: {
    scanId?: string | null;
    reviews?: ReviewInput[];
    refreshProvider?: boolean;
    usage?: UsageRecorder;
  } = {},
): Promise<BusinessAnalysisResult> {
  let business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw new NotFoundError(`Negocio ${businessId} no encontrado`);
  const usage = opts.usage ?? createUsageRecorder();
  const provider = getPlaceProvider(business.providerKey as PlaceProviderKey);
  let reviews = opts.reviews;

  if (opts.refreshProvider && provider.getDetails && provider.isConfigured()) {
    const fresh = await provider.getDetails(business.providerPlaceId, "es", usage);
    if (fresh) {
      business = await prisma.business.update({
        where: { id: businessId },
        data: placeToBusinessData(fresh, business.categoryKey ?? undefined, {}),
      });
      reviews = fresh.reviews ?? reviews;
    }
  }

  const scan = opts.scanId
    ? await prisma.scan.findUnique({ where: { id: opts.scanId }, select: { language: true } })
    : null;
  const started = Date.now();
  const result = await analyzeBusiness(
    businessToPlace(business, reviews),
    { categoryKey: business.categoryKey ?? undefined, language: scan?.language ?? "es" },
    {
      websiteAnalyzer: new HttpWebsiteAnalyzer(),
      contactDiscovery: new DefaultContactDiscovery(),
      reviewAnalyzer: new KeywordReviewAnalyzer(),
      scoring: new RuleBasedScoringEngine(),
      searchProvider: getSearchProvider(),
      providerWebsiteReliability: provider.websiteFieldReliability,
      providerSupportsReviews: provider.supportsReviews,
      usage,
    },
  );
  await saveAnalysis(businessId, opts.scanId ?? null, result, Date.now() - started);
  if (opts.scanId) await addScanUsage(opts.scanId, usage.snapshot());
  return result;
}

/** Usado por la CLI (`npm run audit -- <id>`): analiza inmediatamente, sin pasar por la cola. */
export async function reanalyzeBusinessNow(businessId: string, refreshProvider = false) {
  return runBusinessAnalysis(businessId, { refreshProvider });
}
