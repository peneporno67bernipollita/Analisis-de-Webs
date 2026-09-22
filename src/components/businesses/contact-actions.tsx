import { Globe, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { safeHttpUrl } from "@/components/format";

function waLink(value: string): string | undefined {
  if (/^https?:/i.test(value)) return safeHttpUrl(value);
  return `https://wa.me/${value.replace(/[^\d]/g, "")}`;
}

/**
 * Acciones rápidas de contacto (pensadas para el móvil). Solo abren la app correspondiente:
 * la aplicación nunca envía mensajes, emails ni llamadas automáticamente.
 */
export function ContactActions({
  phone,
  email,
  whatsapp,
  mapsUrl,
  website,
}: {
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  mapsUrl?: string | null;
  website?: string | null;
}) {
  const wa = whatsapp ? waLink(whatsapp) : undefined;
  const maps = safeHttpUrl(mapsUrl);
  const web = safeHttpUrl(website);
  const items = [
    phone && { href: `tel:${phone.replace(/[^\d+]/g, "")}`, label: "Llamar", icon: Phone, primary: true },
    wa && { href: wa, label: "WhatsApp", icon: MessageCircle, external: true },
    email && /^[^@\s]+@[^@\s]+$/.test(email) && { href: `mailto:${email}`, label: "Email", icon: Mail },
    maps && { href: maps, label: "Mapa", icon: MapPin, external: true },
    web && { href: web, label: "Web", icon: Globe, external: true },
  ].filter(Boolean) as {
    href: string;
    label: string;
    icon: typeof Phone;
    primary?: boolean;
    external?: boolean;
  }[];
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
      {items.map(({ href, label, icon: Icon, primary, external }) => (
        <a
          key={label}
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
          className={
            primary
              ? "flex flex-col items-center gap-1 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 sm:flex-row sm:text-sm"
              : "flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 sm:flex-row sm:text-sm"
          }
        >
          <Icon className="h-4 w-4" aria-hidden /> {label}
        </a>
      ))}
    </div>
  );
}
