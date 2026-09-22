import type { MetadataRoute } from "next";

/** Manifest de la PWA: permite instalar la app en el móvil ("Añadir a pantalla de inicio"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Business Opportunity Scanner",
    short_name: "BOS",
    description: "Oportunidades comerciales de desarrollo web: negocios, evidencias y seguimiento.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    lang: "es",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Seguimientos de hoy", url: "/followups" },
      { name: "Nuevo escaneo", url: "/scans/new" },
      { name: "Negocios", url: "/businesses" },
    ],
  };
}
