@AGENTS.md

# Business Opportunity Scanner — guía para Claude

Aplicación (Next.js 16 + TypeScript + Prisma 7 + PostgreSQL) que descubre negocios locales, audita su
presencia web con **evidencias**, calcula un **scoring explicable** y ayuda a gestionar el seguimiento comercial
(PWA instalable en el móvil). Documentación completa en `README.md` y `docs/`.

## Reglas absolutas del producto (no negociables)

1. **No fabricar datos.** Nunca inventar teléfonos, emails, horarios, reseñas, webs, redes, servicios ni ubicaciones.
   Si falta un dato: "No encontrado" / "No verificado". **Nunca** generar emails por patrón (`info@dominio`).
2. **Distinguir procedencia** en todo hallazgo: `OBSERVED` (obtenido), `ANALYZED` (comprobado técnicamente),
   `INFERRED` (deducción, siempre etiquetada como tal). Nunca presentar una inferencia como hecho.
3. **Conflictos entre fuentes: mostrar ambas**, no elegir silenciosamente (ver `src/analysis/freshness/consistency.ts`).
4. **Lenguaje prudente**: "Posibles señales de información desactualizada", no "la web está desactualizada".
5. **Una ficha de terceros (Facebook, Instagram, TripAdvisor, Just Eat…) NO es web propia** (`src/shared/url.ts`).
6. **La valoración (estrellas) NO entra en el score.** El nº de reseñas solo mide actividad.
7. **La app nunca contacta con negocios** (ni emails, ni llamadas, ni WhatsApp automáticos). Solo facilita el contacto.
8. **Toda petición a webs externas pasa por `safeFetch`** (`src/analysis/http/safe-fetch.ts`) con la política anti-SSRF
   de `src/analysis/http/ssrf.ts`. Nunca usar `fetch` directo contra URLs que vengan de datos de negocio o del usuario.
9. **No almacenar contenido de terceros innecesario**: reseñas solo como fragmento ≤160 caracteres; el payload de los
   jobs se vacía al terminar; no se guarda HTML.
10. **Nunca escribir secretos en el código** ni en logs (`src/shared/logger.ts` redacta).

## Comandos

```bash
npm run dev          # Next.js + worker de jobs en el mismo proceso (WORKER_MODE=inprocess)
npm run worker       # Worker independiente (WORKER_MODE=external)
npm run test         # Vitest (tests/unit)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run build        # Build de producción
npm run db:migrate   # prisma migrate dev (Prisma 7: el cliente se genera con `npm run db:generate`)
npm run scan -- Sevilla Sevilla España --radius 3 --categories restaurantes --max 30 [--provider osm|google]
npm run audit -- --url https://web.es [--category restaurantes]   # auditoría suelta (no guarda)
npm run audit -- <businessId>                                     # re-analiza y guarda
npm run export -- --format csv --level HIGH
npm run health
```

## Mapa de la arquitectura

| Capa              | Carpeta                           | Notas                                                                                                                                                           |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI                | `src/app/(app)`, `src/components` | Server Components + client components mínimos. PWA en `src/app/manifest.ts`, `public/sw.js`                                                                     |
| API               | `src/app/api/**/route.ts`         | Siempre `guard()` de `src/server/http.ts` (sesión, mismo origen, rate limit)                                                                                    |
| Dominio           | `src/domain`                      | Tipos, categorías, etiquetas, **puertos** (`ports.ts`): PlaceProvider, SearchProvider, WebsiteAnalyzer, ContactDiscoveryProvider, ReviewAnalyzer, ScoringEngine |
| Proveedores       | `src/providers`                   | Google Places (New), OSM (Overpass/Nominatim), Brave Search. Registro en `index.ts`                                                                             |
| Motor de análisis | `src/analysis`                    | `pipeline.ts` orquesta: detección web → auditoría → consistencia → reseñas → contactos → scoring → recomendaciones                                              |
| Base de datos     | `prisma/schema.prisma`, `src/db`  | Prisma 7 con `@prisma/adapter-pg`; cliente generado en `src/generated/prisma` (no editar)                                                                       |
| Jobs              | `src/jobs`                        | Cola en PostgreSQL (`FOR UPDATE SKIP LOCKED`), reintentos, recuperación de bloqueos                                                                             |
| Configuración     | `src/config`                      | `env.ts` (zod), `scoring.ts` (reglas configurables), `pricing.ts`                                                                                               |
| Utilidades        | `src/shared`                      | logger con redacción, geo, teléfonos (libphonenumber), texto, URLs, rate limit                                                                                  |

## Convenciones

- Next.js 16: `params`/`searchParams` son `Promise`; el middleware se llama `src/proxy.ts`; páginas con BD usan `export const dynamic = "force-dynamic"`.
- Textos de UI en español. Nuevos hallazgos: usar `finding()` de `src/analysis/findings.ts` con código en MAYÚSCULAS, severidad
  (`CRITICAL > HIGH > MEDIUM > LOW > INFO`), procedencia y confianza. **No convertir mejoras menores en grandes oportunidades.**
- Nuevo hallazgo → revisar si afecta a `src/config/scoring.ts` y `src/analysis/recommendations/engine.ts` (toda recomendación debe tener `triggeredBy`).
- Nuevo proveedor → implementar la interfaz de `src/domain/ports.ts` y registrarlo en `src/providers/index.ts`.
- Tras cambiar `prisma/schema.prisma`: `npm run db:migrate -- --name <cambio>` y `npm run db:generate`.
- Antes de dar algo por terminado: `npm run typecheck && npm run lint && npm run test` (y `npm run build` si tocas UI/rutas).
- En desarrollo el worker in-process no recarga código: reinicia `npm run dev` tras cambiar `src/jobs` o `src/analysis`.

## Skills y comandos del proyecto

- Skills (`.claude/skills/`): `scan-zone`, `website-audit`, `lead-analysis`, `security-review`.
- Comandos (`.claude/commands/`): `/scan`, `/audit`, `/review`, `/export`, `/health`.
