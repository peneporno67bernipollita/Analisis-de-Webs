import { ScanForm } from "@/components/scans/scan-form";
import { Card, CardBody, PageHeader } from "@/components/ui/primitives";
import { CATEGORIES } from "@/domain/categories";
import { listPlaceProviders } from "@/providers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo escaneo" };

export default function NewScanPage() {
  const providers = listPlaceProviders().map((p) => ({
    ...p,
    key: p.key === "google_places" ? ("google" as const) : ("osm" as const),
  }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nuevo escaneo"
        description="Busca negocios en una zona, analiza su presencia web y prioriza oportunidades."
      />
      <Card>
        <CardBody>
          <ScanForm
            categories={CATEGORIES.map((c) => ({ key: c.key, label: c.label.es }))}
            providers={providers}
          />
        </CardBody>
      </Card>
      <p className="mt-4 text-xs text-slate-500">
        Solo se usan datos públicos y APIs oficiales. La aplicación nunca contacta con los negocios: solo te
        facilita el contacto.
      </p>
    </div>
  );
}
