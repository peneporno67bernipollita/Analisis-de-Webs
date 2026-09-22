import { prisma } from "@/db/client";
import { placeToBusinessData } from "@/db/mappers";
import { CATEGORIES, CATEGORY_BY_KEY, inferCategoryKey } from "@/domain/categories";
import { createUsageRecorder } from "@/domain/ports";
import type { PlaceProviderKey } from "@/domain/types";
import { getPlaceProvider } from "@/providers";
import { haversineMeters } from "@/shared/geo";
import { createLogger } from "@/shared/logger";
import { enqueue } from "../queue";
import { addScanUsage, maybeCompleteScan } from "../scan-progress";

const log = createLogger("job:discover");

/** Horas durante las que un análisis previo se reutiliza en lugar de repetirse. */
const REUSE_ANALYSIS_HOURS = 24;

/**
 * DISCOVERY: resolver zona → buscar negocios → normalizar → deduplicar (Place ID) → guardar
 * → encolar un ANALYZE_BUSINESS por negocio.
 */
export async function handleDiscover(scanId: string): Promise<void> {
  const scan = await prisma.scan.findUnique({ where: { id: scanId } });
  if (!scan || scan.status === "CANCELLED") return;
  await prisma.scan.update({
    where: { id: scanId },
    data: { status: "DISCOVERING", startedAt: scan.startedAt ?? new Date(), errorMessage: null },
  });

  const provider = getPlaceProvider(scan.providerKey as PlaceProviderKey);
  if (!provider.isConfigured()) {
    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "FAILED",
        errorMessage: `El proveedor ${provider.label} no está configurado`,
        finishedAt: new Date(),
      },
    });
    return;
  }
  const usage = createUsageRecorder();
  const lang = (scan.language === "en" ? "en" : "es") as "es" | "en";
  try {
    const area = await provider.resolveArea(
      { city: scan.city, region: scan.region ?? undefined, country: scan.country, language: lang },
      usage,
    );
    await prisma.scan.update({
      where: { id: scanId },
      data: { resolvedLabel: area.label, centerLat: area.center.lat, centerLng: area.center.lng },
    });

    const known = scan.categories.filter((c) => CATEGORY_BY_KEY.has(c)).map((c) => CATEGORY_BY_KEY.get(c)!);
    const freeText = scan.categories.filter((c) => !CATEGORY_BY_KEY.has(c));
    const categories = scan.allCategories || (!known.length && !freeText.length) ? CATEGORIES : known;

    const radiusM = scan.radiusKm * 1000;
    const result = await provider.discover(
      {
        area: { type: "CIRCLE", center: area.center, radiusM },
        categories,
        freeTextCategories: scan.allCategories ? [] : freeText,
        maxResults: scan.maxResults,
        language: lang,
        regionCode: area.countryCode,
      },
      usage,
    );

    const fresh = await prisma.scan.findUnique({ where: { id: scanId }, select: { status: true } });
    if (fresh?.status === "CANCELLED") return;

    // Fijar total y estado ANTES de encolar: otros workers pueden terminar análisis mientras seguimos
    // en este bucle, y sus incrementos no deben sobrescribirse después.
    await prisma.scan.update({
      where: { id: scanId },
      data: { totalFound: result.places.length, status: result.places.length ? "ANALYZING" : "COMPLETED" },
    });

    let reused = 0;
    let queued = 0;
    const reuseCutoff = new Date(Date.now() - REUSE_ANALYSIS_HOURS * 3_600_000);
    for (const d of result.places) {
      const categoryKey = inferCategoryKey(d.place.types, d.categoryKey);
      const data = placeToBusinessData(d.place, categoryKey, {
        city: scan.city,
        region: scan.region ?? undefined,
        country: scan.country,
        countryCode: area.countryCode,
      });
      const business = await prisma.business.upsert({
        where: {
          providerKey_providerPlaceId: {
            providerKey: provider.key,
            providerPlaceId: d.place.providerPlaceId,
          },
        },
        create: { providerKey: provider.key, providerPlaceId: d.place.providerPlaceId, ...data },
        update: data,
      });
      await prisma.scanBusiness.upsert({
        where: { scanId_businessId: { scanId, businessId: business.id } },
        create: {
          scanId,
          businessId: business.id,
          matchedQuery: d.matchedQuery,
          distanceMeters: d.place.location ? haversineMeters(area.center, d.place.location) : null,
        },
        update: {},
      });
      if (business.lastAnalyzedAt && business.lastAnalyzedAt > reuseCutoff && !d.place.reviews?.length) {
        reused++;
        continue;
      }
      // Idempotencia: si el descubrimiento se reintenta, no duplicar jobs
      const existing = await prisma.scanJob.findFirst({
        where: { scanId, businessId: business.id, type: "ANALYZE_BUSINESS" },
        select: { id: true },
      });
      if (existing) {
        queued++;
        continue;
      }
      await enqueue("ANALYZE_BUSINESS", {
        scanId,
        businessId: business.id,
        payload: d.place.reviews?.length
          ? { reviews: d.place.reviews.map((r) => ({ ...r, text: r.text.slice(0, 2000) })) }
          : undefined,
      });
      queued++;
    }

    const warnings = [...result.warnings];
    if (reused)
      warnings.push(
        `${reused} negocio(s) ya analizados en las últimas ${REUSE_ANALYSIS_HOURS} h: se reutiliza su análisis.`,
      );
    if (!result.places.length) warnings.push("No se han encontrado negocios con los criterios indicados.");
    await prisma.scan.update({
      where: { id: scanId },
      data: {
        // increment (no asignación): no pisar los análisis ya contabilizados por otros workers
        totalAnalyzed: { increment: reused },
        finishedAt: result.places.length ? null : new Date(),
        warnings,
      },
    });
    log.info("discovery done", { scanId, found: result.places.length, queued, reused });
    await maybeCompleteScan(scanId);
  } finally {
    await addScanUsage(scanId, usage.snapshot());
  }
}
