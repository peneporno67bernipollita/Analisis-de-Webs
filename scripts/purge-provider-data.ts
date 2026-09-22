/**
 * Retención de datos de proveedores (`npm run data:purge-provider`).
 * Borra los datos cacheados de Google Places con más de PROVIDER_DATA_TTL_DAYS días,
 * conservando el Place ID (que sí puede almacenarse) y tu trabajo propio (notas, estado comercial).
 * Para volver a verlos, re-analiza el negocio con "Actualizar datos del proveedor".
 * Revisa las condiciones vigentes de Google Maps Platform: docs/COMPLIANCE.md.
 */
import "dotenv/config";
import { getEnv } from "@/config/env";
import { prisma } from "@/db/client";

const days = getEnv().PROVIDER_DATA_TTL_DAYS;
const cutoff = new Date(Date.now() - days * 86_400_000);
const res = await prisma.business.updateMany({
  where: { providerKey: "google_places", providerDataFetchedAt: { lt: cutoff } },
  data: {
    formattedAddress: null,
    street: null,
    postalCode: null,
    lat: null,
    lng: null,
    nationalPhone: null,
    internationalPhone: null,
    rating: null,
    userRatingCount: null,
    openingHours: undefined,
    businessStatus: null,
    mapsUrl: null,
    providerDataFetchedAt: null,
  },
});
await prisma.$executeRaw`UPDATE businesses SET opening_hours = NULL WHERE provider_key = 'google_places' AND provider_data_fetched_at IS NULL`;
await prisma.$executeRaw`UPDATE analyses SET review_signals = NULL WHERE created_at < ${cutoff}`;
console.log(
  `Datos de proveedor purgados en ${res.count} negocio(s) (anteriores a ${cutoff.toISOString().slice(0, 10)}).`,
);
await prisma.$disconnect();
