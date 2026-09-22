import dns from "node:dns";
import { assertUrlAllowed, isBlockedIp } from "@/analysis/http/ssrf";
import { createLogger } from "@/shared/logger";

/**
 * Renderizado opcional con Playwright (ENABLE_BROWSER_RENDERING=true) para webs que
 * generan su contenido con JavaScript. Playwright es una dependencia OPCIONAL: si no está
 * instalada, esta función devuelve null y el análisis sigue siendo parcial.
 *
 * Anti-SSRF: todas las peticiones del navegador pasan por page.route y se validan
 * (URL + resolución DNS). Riesgo residual documentado: Chromium resuelve DNS por su cuenta,
 * por lo que un ataque de DNS rebinding muy rápido podría eludir la comprobación. En producción
 * se recomienda ejecutar el worker en una red sin acceso a servicios internos.
 */

const log = createLogger("browser");

export interface RenderResult {
  html: string;
  finalUrl: string;
  consoleErrors: string[];
  horizontalOverflow: boolean | null;
}

async function hostIsPublic(hostname: string): Promise<boolean> {
  try {
    const addrs = await dns.promises.lookup(hostname, { all: true });
    return addrs.length > 0 && !addrs.some((a) => isBlockedIp(a.address));
  } catch {
    return false;
  }
}

export async function renderWithBrowser(
  url: string,
  userAgent: string,
  timeoutMs: number,
): Promise<RenderResult | null> {
  type PW = typeof import("@playwright/test");
  let pw: PW | null = null;
  try {
    const specifier = "playwright";
    pw = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ specifier)) as PW;
  } catch {
    log.warn("Playwright no disponible; se omite el renderizado");
    return null;
  }
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent,
      viewport: { width: 375, height: 812 },
      javaScriptEnabled: true,
    });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && consoleErrors.length < 20) consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on("pageerror", (err) => {
      if (consoleErrors.length < 20) consoleErrors.push(String(err.message).slice(0, 300));
    });
    await page.route("**/*", async (route) => {
      try {
        const u = assertUrlAllowed(route.request().url());
        if (!(await hostIsPublic(u.hostname.replace(/^\[|\]$/g, "")))) return route.abort("blockedbyclient");
        return route.continue();
      } catch {
        return route.abort("blockedbyclient");
      }
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
    const horizontalOverflow = await page
      .evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 5)
      .catch(() => null);
    return { html: await page.content(), finalUrl: page.url(), consoleErrors, horizontalOverflow };
  } catch (err) {
    log.warn("Fallo al renderizar con navegador", { error: err });
    return null;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
