export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Divide un círculo grande en sub-círculos solapados (malla) para superar el límite
 * de resultados por consulta de los proveedores. Devuelve el propio círculo si es pequeño.
 */
export function tileCircle(
  center: LatLng,
  radiusM: number,
  tileRadiusM: number,
): { center: LatLng; radiusM: number }[] {
  if (radiusM <= tileRadiusM * 1.2) return [{ center, radiusM }];
  const step = tileRadiusM * Math.SQRT2; // solape suficiente para cubrir el área
  const tiles: { center: LatLng; radiusM: number }[] = [];
  const latStep = (step / EARTH_RADIUS_M) * (180 / Math.PI);
  const lngStep = latStep / Math.cos((center.lat * Math.PI) / 180);
  const n = Math.ceil(radiusM / step);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const c = { lat: center.lat + i * latStep, lng: center.lng + j * lngStep };
      if (haversineMeters(center, c) <= radiusM + tileRadiusM * 0.5)
        tiles.push({ center: c, radiusM: tileRadiusM });
    }
  }
  // Ordena del centro hacia fuera: si se agota el presupuesto se cubre primero lo más cercano.
  return tiles.sort((a, b) => haversineMeters(center, a.center) - haversineMeters(center, b.center));
}
