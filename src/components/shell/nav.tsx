"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarClock, LayoutDashboard, LogOut, Radar, Settings } from "lucide-react";
import { cn } from "@/components/ui/cn";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/scans", label: "Escaneos", icon: Radar },
  { href: "/businesses", label: "Negocios", icon: Building2 },
  { href: "/followups", label: "Seguimientos", icon: CalendarClock },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

function useActive() {
  const path = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? path === href : path === href || path.startsWith(`${href}/`);
}

export function Sidebar({ dueCount, authEnabled }: { dueCount: number; authEnabled: boolean }) {
  const isActive = useActive();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-extrabold text-white">
          B
        </span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-slate-900">Opportunity Scanner</p>
          <p className="text-[11px] text-slate-500">Oportunidades web locales</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Principal">
        {ITEMS.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              isActive(href, exact)
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="flex-1">{label}</span>
            {href === "/followups" && dueCount > 0 && (
              <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
                {dueCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <Link
          href="/scans/new"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Radar className="h-4 w-4" aria-hidden /> Nuevo escaneo
        </Link>
        {authEnabled && (
          <form action="/api/auth/logout" method="post" className="mt-2">
            <button className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-50">
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Cerrar sesión
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}

export function MobileNav({ dueCount }: { dueCount: number }) {
  const isActive = useActive();
  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
      aria-label="Principal móvil"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, exact }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive(href, exact) ? "text-brand-700" : "text-slate-500",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
              {href === "/followups" && dueCount > 0 && (
                <span className="absolute right-1/4 top-1 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
                  {dueCount}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-extrabold text-white">
          B
        </span>
        <span className="text-sm font-bold text-slate-900">Opportunity Scanner</span>
      </Link>
      <Link
        href="/scans/new"
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
      >
        Escanear
      </Link>
    </header>
  );
}
