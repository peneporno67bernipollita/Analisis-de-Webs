import { defaultPlaceProvider } from "@/config/env";
import { prisma } from "@/db/client";
import { ScanInputSchema, type ScanInput } from "@/domain/scan-input";
import { enqueue, cancelScanJobs } from "@/jobs/queue";
import { getPlaceProvider, providerKeyFromShort } from "@/providers";
import { ConfigurationError } from "@/shared/errors";

/** Crea un escaneo y encola su descubrimiento. El procesamiento ocurre en el worker. */
export async function createScan(raw: unknown) {
  const input: ScanInput = ScanInputSchema.parse(raw);
  const providerKey = providerKeyFromShort(input.provider ?? defaultPlaceProvider());
  const provider = getPlaceProvider(providerKey);
  if (!provider.isConfigured()) {
    throw new ConfigurationError(
      `El proveedor "${provider.label}" no está configurado (revisa GOOGLE_MAPS_API_KEY en .env).`,
    );
  }
  const categories = [...new Set(input.categories.map((c) => c.trim()).filter(Boolean))];
  const scan = await prisma.scan.create({
    data: {
      providerKey,
      city: input.city,
      region: input.region || null,
      country: input.country,
      radiusKm: input.radiusKm,
      categories,
      allCategories: input.allCategories || categories.length === 0,
      maxResults: input.maxResults,
      language: input.language,
      areaType: "CIRCLE",
    },
  });
  await enqueue("DISCOVER", { scanId: scan.id, maxAttempts: 3 });
  return scan;
}

export async function cancelScan(scanId: string) {
  await prisma.scan.updateMany({
    where: { id: scanId, status: { in: ["PENDING", "DISCOVERING", "ANALYZING"] } },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
  await cancelScanJobs(scanId);
}
