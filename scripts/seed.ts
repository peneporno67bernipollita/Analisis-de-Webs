/**
 * Seed: solo registra los proveedores conocidos (tabla providers).
 * No crea negocios ni datos de ejemplo: la aplicación nunca muestra datos inventados.
 */
import "dotenv/config";
import { prisma } from "@/db/client";

const providers = [
  {
    key: "google_places",
    name: "Google Places API (New)",
    kind: "PLACES",
    notes: "Proveedor principal. Place ID como identificador estable.",
  },
  {
    key: "osm",
    name: "OpenStreetMap (Overpass + Nominatim)",
    kind: "PLACES",
    notes: "Gratuito. Sin reseñas; campo web incompleto.",
  },
  {
    key: "brave",
    name: "Brave Search API",
    kind: "SEARCH",
    notes: "Opcional: búsqueda de web oficial no enlazada.",
  },
  {
    key: "website",
    name: "Web oficial del negocio",
    kind: "WEBSITE",
    notes: "Crawler propio con política anti-SSRF.",
  },
];
for (const p of providers) {
  await prisma.provider.upsert({
    where: { key: p.key },
    create: p,
    update: { name: p.name, kind: p.kind, notes: p.notes },
  });
}
console.log(`Proveedores registrados: ${providers.map((p) => p.key).join(", ")}`);
await prisma.$disconnect();
