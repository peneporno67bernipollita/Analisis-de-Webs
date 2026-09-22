---
name: security-review
description: Revisión de seguridad específica de este proyecto (anti-SSRF del crawler, autenticación, validación de entradas, secretos, exposición de datos de terceros, CSV injection). Úsala antes de desplegar, al tocar src/analysis/http, src/auth, src/proxy.ts o las rutas de src/app/api, o cuando pidan revisar la seguridad.
---

# Revisión de seguridad del proyecto

Recorre esta lista y reporta hallazgos con archivo:línea, impacto y corrección propuesta.

## 1. SSRF (crítico: el crawler visita URLs de terceros)

- [ ] Ningún `fetch(`/`http.request` sobre URLs procedentes de negocios, buscadores o usuarios fuera de `safeFetch`.
      Buscar: `grep -rn "fetch(" src --include=*.ts | grep -v safe-fetch` y revisar cada uno (solo APIs fijas: Google, OSM, Brave).
- [ ] `src/analysis/http/ssrf.ts`: rangos bloqueados (loopback, privadas, link-local/metadata 169.254.169.254, CGNAT,
      IPv6 ULA/link-local, IPv4 mapeada/NAT64), hostnames internos, puertos permitidos, sin credenciales en URL.
- [ ] La validación de IP ocurre en el `lookup` del socket (anti DNS-rebinding) y en cada redirección.
- [ ] Límites: timeout total, `maxBytes` tras descompresión, nº de redirecciones, nº de páginas/enlaces.
- [ ] Playwright (si `ENABLE_BROWSER_RENDERING`): `page.route` valida cada petición.
- [ ] Web Push: `POST /api/push/subscribe` solo acepta endpoints de servicios push conocidos.
- Tests: `npx vitest run tests/unit/ssrf.test.ts`.

## 2. Autenticación y acceso

- [ ] `src/proxy.ts` protege UI y API; en producción sin AUTH_* responde 503.
- [ ] Cada Route Handler mutante llama a `guard(req, { mutate: true })` (sesión + mismo origen).
- [ ] Cookie de sesión `httpOnly`, `sameSite=lax`, `secure` en producción; HMAC con `timingSafeEqual`.
- [ ] Login con rate limit por IP y global; contraseña con scrypt.

## 3. Entradas y salidas

- [ ] Todas las entradas de API validadas con zod (`ScanInputSchema`, `BusinessFiltersSchema`, etc.).
- [ ] Enlaces a datos de terceros renderizados con `safeHttpUrl` (sin `javascript:`), `rel="noopener noreferrer nofollow"`.
- [ ] CSV: `sanitizeCell` neutraliza fórmulas (`= + - @`).
- [ ] Errores de API sin detalles internos (`apiError`).

## 4. Secretos y datos

- [ ] Sin secretos en el repo: `git grep -nE "AIza|sk-|postgres(ql)?://[^:]+:[^@]+@" -- . ':!*.example'`.
- [ ] `.env`, `.env.*` (salvo `.env.example`) y `.local/` en `.gitignore`.
- [ ] Logs con redacción (`src/shared/logger.ts`); nada de API keys en URLs de log.
- [ ] Datos de terceros mínimos: reseñas solo como fragmento; payload de jobs vaciado; retención `npm run data:purge-provider`.

## 5. Dependencias y despliegue

- [ ] `npm audit --omit=dev` sin vulnerabilidades altas sin justificar.
- [ ] Cabeceras de seguridad en `next.config.ts`; HTTPS delante de la app en producción.
- [ ] Worker con acceso de red de salida a Internet pero **sin** acceso a redes internas si es posible.

Finaliza con: `npm run typecheck && npm run lint && npm run test`.
