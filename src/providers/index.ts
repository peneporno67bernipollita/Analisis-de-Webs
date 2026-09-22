import { defaultPlaceProvider, getEnv } from "@/config/env";
import type { PlaceProvider, SearchProvider } from "@/domain/ports";
import type { PlaceProviderKey } from "@/domain/types";
import { GooglePlacesProvider } from "./places/google-places";
import { OsmProvider } from "./places/osm";
import { BraveSearchProvider } from "./search/brave";

/**
 * Registro de proveedores. Para añadir uno nuevo: implementar la interfaz (src/domain/ports.ts)
 * y añadirlo aquí. El resto de la aplicación no conoce implementaciones concretas.
 */

export function getPlaceProvider(key: PlaceProviderKey): PlaceProvider {
  switch (key) {
    case "google_places":
      return new GooglePlacesProvider();
    case "osm":
      return new OsmProvider();
  }
}

export function providerKeyFromShort(short: "google" | "osm"): PlaceProviderKey {
  return short === "google" ? "google_places" : "osm";
}

export function listPlaceProviders(): {
  key: PlaceProviderKey;
  label: string;
  configured: boolean;
  supportsReviews: boolean;
  isDefault: boolean;
}[] {
  const def = providerKeyFromShort(defaultPlaceProvider());
  return (["google_places", "osm"] as const).map((key) => {
    const p = getPlaceProvider(key);
    return {
      key,
      label: p.label,
      configured: p.isConfigured(),
      supportsReviews: p.supportsReviews,
      isDefault: key === def,
    };
  });
}

export function getSearchProvider(): SearchProvider | null {
  const env = getEnv();
  if (env.SEARCH_PROVIDER === "brave") {
    const p = new BraveSearchProvider();
    return p.isConfigured() ? p : null;
  }
  return null;
}
