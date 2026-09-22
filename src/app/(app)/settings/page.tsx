import { CheckCircle2, XCircle } from "lucide-react";
import { MobileSetup } from "@/components/pwa/mobile-setup";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { getEnv } from "@/config/env";
import { SCORING_CONFIG } from "@/config/scoring";
import { getHealth } from "@/server/health";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const [health, env] = [await getHealth(), getEnv()];
  const c = SCORING_CONFIG;
  return (
    <div className="space-y-5">
      <PageHeader title="Ajustes" description="Estado del sistema, móvil y reglas de priorización." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Móvil" description="Instala la app y activa los avisos de seguimiento." />
          <CardBody>
            <MobileSetup vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Estado del sistema"
            description="Equivalente a `npm run health`. Nunca se muestran secretos."
          />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {health.checks.map((ch) => (
                <li key={ch.name} className="flex items-start gap-2">
                  {ch.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <div>
                    <p className="font-medium text-slate-800">{ch.name}</p>
                    <p className="text-xs text-slate-500">{ch.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Reglas de priorización"
          description="Configurables en src/config/scoring.ts. El score ayuda a priorizar; la decisión es tuya."
        />
        <CardBody className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium text-slate-800">Niveles</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
              <li>Alta oportunidad: score ≥ {c.levels.high}</li>
              <li>Oportunidad media: score ≥ {c.levels.medium}</li>
              <li>Oportunidad baja: score &lt; {c.levels.medium}</li>
              <li>
                Evidencia insuficiente: confianza &lt; {c.levels.minConfidence}, web no verificable, o «sin
                web» basado solo en una fuente poco fiable
              </li>
              <li>Negocios cerrados permanentemente: baja</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-800">Puntos (máximos)</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
              <li>
                Web: hasta {c.website.max} (sin web o caída = {c.website.noWebsite}; problemas por severidad,
                máx. {c.website.problemsCap})
              </li>
              <li>Consistencia/frescura de la información: hasta {c.consistency.max}</li>
              <li>Señales de reseñas (secundarias): hasta {c.reviews.max}</li>
              <li>Actividad de clientes (nº de reseñas, no la nota): hasta {c.presence.max}</li>
              <li>Contactabilidad: hasta {c.contact.max}</li>
              <li>Necesidad típica de la categoría (inferencia): hasta {c.need.max}</li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              La valoración media (estrellas) no suma ni resta: un 4,9 puede tener una web horrible y un 3,8
              una web excelente.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
