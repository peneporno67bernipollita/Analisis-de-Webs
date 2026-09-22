import { expect, test } from "@playwright/test";

/**
 * Pruebas de humo independientes de si el login está activado:
 * - con login: la UI redirige a /login y la API responde 401 sin sesión;
 * - sin login (desarrollo): el dashboard carga y muestra el formulario de escaneo.
 * No crean escaneos (evitan coste y tráfico a terceros).
 */

test("la PWA expone manifest y service worker", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const json = await manifest.json();
  expect(json.display).toBe("standalone");
  expect(json.icons.length).toBeGreaterThan(0);
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
  expect(await sw.text()).toContain("notificationclick");
});

test("login o dashboard según configuración", async ({ page, request }) => {
  await page.goto("/");
  if (page.url().includes("/login")) {
    await expect(page.getByLabel("Usuario")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    const api = await request.get("/api/businesses");
    expect(api.status()).toBe(401);
  } else {
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByLabel("Ciudad *")).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar escaneo" })).toBeVisible();
  }
});

test("la API valida la entrada de escaneos", async ({ request, baseURL }) => {
  const res = await request.post("/api/scans", {
    data: { city: "", country: "" },
    headers: { Origin: baseURL! },
  });
  expect([400, 401]).toContain(res.status());
});

test("la API rechaza peticiones mutantes de otro origen", async ({ request }) => {
  const res = await request.post("/api/scans", {
    data: { city: "Sevilla", country: "España", radiusKm: 1 },
    headers: { Origin: "https://evil.example" },
  });
  expect([401, 403]).toContain(res.status());
});
