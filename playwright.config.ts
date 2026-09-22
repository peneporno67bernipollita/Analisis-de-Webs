import { defineConfig, devices } from "@playwright/test";

/**
 * E2E de humo. Requiere la app en marcha (o la arranca con `npm run dev`).
 * Navegador: por defecto el Chromium de Playwright (`npx playwright install chromium`);
 * en Windows puedes usar Edge ya instalado con PW_CHANNEL=msedge.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL || undefined } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
