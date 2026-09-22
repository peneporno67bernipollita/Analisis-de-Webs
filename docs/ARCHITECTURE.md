# Arquitectura

## Capas

| Capa              | Carpeta                           | Responsabilidad                                                                     | Depende de              |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------- | ----------------------- |
| UI                | `src/app/(app)`, `src/components` | Páginas (Server Components) y componentes de cliente mínimos                        | server, domain          |
| API               | `src/app/api`                     | Route handlers finos: validan (zod), protegen (`guard`) y delegan                   | server, db              |
| Servicios         | `src/server`                      | Casos de uso: crear/cancelar escaneos, consultas con filtros, health, push          | db, jobs, providers     |
| Dominio           | `src/domain`                      | Tipos, catálogo de categorías, etiquetas y **puertos**                              | —                       |
| Proveedores       | `src/providers`                   | Implementaciones de `PlaceProvider` / `SearchProvider`                              | domain, shared          |
| Motor de análisis | `src/analysis`                    | Pipeline puro (sin BD): web, frescura, reseñas, contactos, scoring, recomendaciones | domain, shared          |
| Jobs              | `src/jobs`                        | Cola PostgreSQL, worker y handlers (orquestan análisis + persistencia)              | analysis, db, providers |
| Base de datos     | `prisma/`, `src/db`               | Esquema, migraciones, cliente, mapeos y guardado transaccional                      | —                       |
| Configuración     | `src/config`                      | `env.ts` (zod, perezoso), `scoring.ts`, `pricing.ts`                                | —                       |
| Utilidades        | `src/shared`                      | logger, errores, async, geo, teléfonos, texto, URLs, rate limit                     | —                       |

## Puertos (src/domain/ports.ts)

```ts
PlaceProvider            resolveArea(), discover(), getDetails?()       Google Places (New), OSM
SearchProvider           search()                                      Brave Search
WebsiteAnalyzer          analyze(url, ctx) → WebsiteAuditResult        HttpWebsiteAnalyzer
ContactDiscoveryProvider discover(place, audit) → ContactPoint[]       DefaultContactDiscovery
ReviewAnalyzer           analyze(reviews) → señales + hallazgos         KeywordReviewAnalyzer
ScoringEngine            score(input) → ScoreBreakdown                  RuleBasedScoringEngine
```

Añadir un proveedor = implementar la interfaz y registrarlo en `src/providers/index.ts`. El área de búsqueda ya admite
`{ type: "POLYGON", geojson }` en el tipo `SearchArea` y en el modelo (`scans.area_type`, `scans.area_geojson`).

## Flujo de un escaneo (jobs)

```
POST /api/scans ──► scans (PENDING) + scan_jobs[DISCOVER]
                         │
        worker (claimNext: FOR UPDATE SKIP LOCKED)
                         │
   DISCOVER ── resolveArea ─► discover ─► upsert businesses (providerKey, providerPlaceId)
                         │                  └─ scan_businesses (distancia, consulta)
                         └─► N × scan_jobs[ANALYZE_BUSINESS] (payload transitorio: reseñas)
                                              │
   ANALYZE_BUSINESS ── pipeline.analyzeBusiness():
        1. detección de web (terceros, business.site, buscador verificado)
        2. auditoría (safeFetch + robots + crawl limitado + comprobaciones de red)
        3. consistencia / frescura (ficha vs web, señales temporales)
        4. reseñas (señal secundaria)
        5. contactos (con fuente)
        6. scoring + recomendaciones
     ─► saveAnalysis() en transacción: analyses, website_audits, evidence, recommendations, contacts,
        instantánea en businesses ─► payload del job = NULL
                         │
   recordBusinessOutcome ─► totalAnalyzed/totalFailed ─► COMPLETED(_WITH_ERRORS) + push "Escaneo completado"
```

Tolerancia a fallos:

- Un negocio problemático nunca aborta el escaneo: el pipeline captura errores parciales (análisis `PARTIAL`) y el job
  falla/reintenta de forma aislada (`maxAttempts`, backoff exponencial). Tras agotar reintentos cuenta como `totalFailed`.
- Proveedores: reintentos con backoff en 429/5xx; 401/403 no se reintentan (mensaje claro de configuración).
- Worker caído: los jobs `RUNNING` con lock > 10 min se re-encolan (`recoverStaleJobs`).
- El descubrimiento es idempotente (no duplica negocios ni jobs si se reintenta).
- Análisis recientes (< 24 h) se reutilizan en nuevos escaneos.

Modos del worker (`WORKER_MODE`): `inprocess` (arranca en `src/instrumentation.ts` junto al servidor Next.js),
`external` (`npm run worker`, escalable a varios procesos gracias a `SKIP LOCKED`) u `off`.

## Modelo de datos (resumen)

- `businesses`: datos normalizados del proveedor + instantánea del último análisis (para filtrar/ordenar rápido) + CRM
  (`lead_status`, `next_follow_up_at`, `follow_up_notified_at`, `last_contacted_at`). Único por `(provider_key, provider_place_id)`.
- `analyses`: un registro por análisis (historial) con `score_breakdown` (componentes, contribuciones, regla de nivel,
  comparaciones), `unverified`, `review_signals`, `errors`.
- `evidence`: un hallazgo por fila (código, categoría, severidad, procedencia, confianza, evidencias JSON).
- `website_audits`: datos técnicos de la auditoría (sin HTML).
- `contacts`: contactos del último análisis con fuente y URL.
- `recommendations`: con `triggered_by` (códigos de hallazgo que la justifican).
- `scans`, `scan_businesses`, `scan_jobs`, `providers`, `manual_notes`, `worker_heartbeats`, `push_subscriptions`.

## Procedencia de los datos

Cada hallazgo y contacto indica si es `OBSERVED` (obtenido de una fuente), `ANALYZED` (resultado de una comprobación
técnica) o `INFERRED` (deducción, siempre etiquetada). La UI muestra "No encontrado"/"No verificado" cuando falta algo.
