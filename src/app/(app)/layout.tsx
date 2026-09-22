import { MobileNav, MobileTopBar, Sidebar } from "@/components/shell/nav";
import { getEnv, isAuthConfigured } from "@/config/env";
import { prisma } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const env = getEnv();
  const dueCount = await prisma.business
    .count({
      where: { nextFollowUpAt: { lte: new Date() }, leadStatus: { notIn: ["WON", "LOST", "DISCARDED"] } },
    })
    .catch(() => 0);
  const authEnabled = isAuthConfigured(env);
  return (
    <div className="min-h-screen">
      <Sidebar dueCount={dueCount} authEnabled={authEnabled} />
      <MobileTopBar />
      <div className="lg:pl-60">
        {!authEnabled && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Autenticación desactivada (modo desarrollo). Configura AUTH_* en .env antes de exponer la app a
            Internet.
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>
      <MobileNav dueCount={dueCount} />
    </div>
  );
}
