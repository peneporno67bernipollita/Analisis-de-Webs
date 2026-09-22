import type { Business } from "@/generated/prisma/client";
import type { NormalizedPlace, OpeningHours, PlaceProviderKey, ReviewInput } from "@/domain/types";

/** Reconstruye el negocio normalizado a partir de la fila guardada (+ reseñas transitorias). */
export function businessToPlace(b: Business, reviews?: ReviewInput[]): NormalizedPlace {
  return {
    provider: b.providerKey as PlaceProviderKey,
    providerPlaceId: b.providerPlaceId,
    name: b.name,
    primaryType: b.primaryCategory ?? undefined,
    primaryTypeLabel: b.primaryCategoryLabel ?? undefined,
    types: b.secondaryCategories,
    formattedAddress: b.formattedAddress ?? undefined,
    street: b.street ?? undefined,
    postalCode: b.postalCode ?? undefined,
    city: b.city ?? undefined,
    region: b.region ?? undefined,
    country: b.country ?? undefined,
    countryCode: b.countryCode ?? undefined,
    location: b.lat !== null && b.lng !== null ? { lat: b.lat, lng: b.lng } : undefined,
    nationalPhone: b.nationalPhone ?? undefined,
    internationalPhone: b.internationalPhone ?? undefined,
    websiteUri: b.providerWebsite ?? undefined,
    mapsUrl: b.mapsUrl ?? undefined,
    rating: b.rating ?? undefined,
    userRatingCount: b.userRatingCount ?? undefined,
    openingHours: (b.openingHours as OpeningHours | null) ?? undefined,
    businessStatus: b.businessStatus ?? undefined,
    email: b.providerEmail ?? undefined,
    socials: (b.providerSocials as NormalizedPlace["socials"] | null) ?? undefined,
    reviews,
    attribution: b.providerKey === "google_places" ? "Google Maps" : "© OpenStreetMap contributors",
  };
}

/** Campos de proveedor para crear/actualizar un Business (upsert por providerKey + providerPlaceId). */
export function placeToBusinessData(
  p: NormalizedPlace,
  categoryKey: string | undefined,
  fallback: { city?: string; region?: string; country?: string; countryCode?: string },
) {
  return {
    name: p.name,
    categoryKey: categoryKey ?? null,
    primaryCategory: p.primaryType ?? null,
    primaryCategoryLabel: p.primaryTypeLabel ?? null,
    secondaryCategories: p.types,
    formattedAddress: p.formattedAddress ?? null,
    street: p.street ?? null,
    postalCode: p.postalCode ?? null,
    city: p.city ?? fallback.city ?? null,
    region: p.region ?? fallback.region ?? null,
    country: p.country ?? fallback.country ?? null,
    countryCode: p.countryCode ?? fallback.countryCode ?? null,
    lat: p.location?.lat ?? null,
    lng: p.location?.lng ?? null,
    nationalPhone: p.nationalPhone ?? null,
    internationalPhone: p.internationalPhone ?? null,
    providerWebsite: p.websiteUri ?? null,
    mapsUrl: p.mapsUrl ?? null,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    openingHours: p.openingHours ? (JSON.parse(JSON.stringify(p.openingHours)) as object) : undefined,
    businessStatus: p.businessStatus ?? null,
    providerEmail: p.email ?? null,
    providerSocials: p.socials ? (p.socials as object) : undefined,
    providerDataFetchedAt: new Date(),
  };
}
