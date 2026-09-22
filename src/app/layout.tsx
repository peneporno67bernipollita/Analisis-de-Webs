import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Business Opportunity Scanner", template: "%s · BOS" },
  description:
    "Descubre negocios locales, analiza su presencia web con evidencias y prioriza oportunidades comerciales.",
  applicationName: "Business Opportunity Scanner",
  appleWebApp: { capable: true, title: "BOS", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full font-sans">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
