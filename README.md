# Business Opportunity Scanner

Aplicación web (instalable en el móvil como PWA) para **descubrir negocios locales, analizar su presencia web con
evidencias y priorizar oportunidades comerciales** de desarrollo web — sin inventar datos y sin tomar la decisión por ti.

```
Zona → descubrir negocios → detectar/analizar su web → contactos públicos → reseñas → scoring explicable → ficha + seguimiento
```

> **Principio del producto:** cada valoración se basa en señales observables y explicables. Si algo no se ha podido
> verificar, la app lo dice ("No encontrado" / "No verificado"). Las inferencias se marcan como inferencias y los
> conflictos entre fuentes se muestran, nunca se resuelven en silencio.

---

## Índice

1. [Qué hace](#qué-hace)
2. [Puesta en marcha rápida](#puesta-en-marcha-rápida)
3. [Instalación desde cero (Windows) — lo que se hizo en este equipo](#instalación-desde-cero-windows--lo-que-se-hizo-en-este-equipo)
4. [Configuración (.env)](#configuración-env)
5. [Uso](#uso)
6. [Móvil y uso 24/7](#móvil-y-uso-247)
7. [Arquitectura](#arquitectura)
8. [Scoring explicable](#scoring-explicable)
9. [Seguridad](#seguridad)
10. [Datos, privacidad y cumplimiento](#datos-privacidad-y-cumplimiento)
11. [Tests y calidad](#tests-y-calidad)
12. [Claude Code (skills y comandos)](#claude-code-skills-y-comandos)
13. [Registro de trabajo (fases implementadas)](#registro-de-trabajo-fases-implementadas)
14. [Limitaciones conocidas y próximos pasos](#limitaciones-conocidas-y-próximos-pasos)

Documentación detallada en [`docs/`](docs): [arquitectura](docs/ARCHITECTURE.md) · [scoring](docs/SCORING.md) ·
[seguridad](docs/SECURITY.md) · [cumplimiento](docs/COMPLIANCE.md) · [despliegue y móvil](docs/DEPLOYMENT.md) ·
[decisiones técnicas](docs/DECISIONS.md).

---

## Qué hace

| Paso                           | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Zona**                    | Ciudad, provincia/región, país, radio (km), categorías (catálogo o texto libre), máx. resultados, idioma, proveedor.                                                                                                                                                                                                                                                                                                                                                                      |
| **2. Descubrimiento**          | Google Places API (New) — proveedor principal, Place ID como identificador — u OpenStreetMap (gratuito). Deduplicación por identificador del proveedor. Radios grandes se dividen en teselas.                                                                                                                                                                                                                                                                                             |
| **3. Detección de web**        | Distingue web propia de perfiles de terceros (Facebook, Instagram, TripAdvisor, Just Eat, Booking, Linktree…), webs `*.business.site` discontinuadas, subdominios gratuitos y, opcionalmente, busca la web oficial en un buscador (verificada por teléfono o nombre+ubicación).                                                                                                                                                                                                           |
| **4. Auditoría web**           | Disponibilidad HTTP/HTTPS, redirecciones, certificado, DNS, dominios aparcados, webs en construcción, enlaces/imágenes/recursos rotos, favicon, title/description, viewport/responsive, HTML obsoleto, H1, idioma, datos estructurados, rendimiento, contenido mixto, CMS antiguo, accesibilidad básica, CTA, formularios, teléfono clicable, WhatsApp, horarios, dirección/mapa, reservas, carta, lorem ipsum, imágenes de stock… Cada hallazgo con severidad `CRÍTICO/ALTO/MEDIO/BAJO`. |
| **5. Frescura y consistencia** | Compara teléfono, dirección, horario y estado de la ficha con la web; detecta avisos COVID, eventos de años pasados, copyright antiguo, sitemap sin actualizar, dominios enlazados desaparecidos y horarios contradictorios. Todo formulado como _posibles señales_.                                                                                                                                                                                                                      |
| **6. Reseñas**                 | Señales operativas (horario/teléfono/dirección incorrectos, reservas, carta, dificultad de contacto…) como **señal secundaria**, guardando solo un fragmento ≤160 caracteres.                                                                                                                                                                                                                                                                                                             |
| **7. Contacto**                | Teléfono, email publicado, formulario, WhatsApp, página de contacto, redes empresariales — con su fuente. **Nunca** genera emails por patrón.                                                                                                                                                                                                                                                                                                                                             |
| **8. Scoring**                 | Opportunity Score 0-100 con desglose `+N motivo`, 5 componentes y nivel (Alta / Media / Baja / Evidencia insuficiente) según reglas configurables. La valoración (estrellas) no se usa.                                                                                                                                                                                                                                                                                                   |
| **9. Ficha**                   | Resumen con respuesta rápida a _¿por qué aparece? ¿qué problema tiene? ¿qué evidencia? ¿qué contacto? ¿qué ofrecerle? ¿qué no está verificado?_ + 12 secciones.                                                                                                                                                                                                                                                                                                                           |
| **10. Seguimiento comercial**  | Estado del lead, próximo seguimiento con **aviso push en el móvil**, notas, agenda de seguimientos.                                                                                                                                                                                                                                                                                                                                                                                       |
| **11. Exportación**            | CSV pensado para Excel en español (`;`, UTF-8 con BOM, anti inyección de fórmulas) y JSON. XLSX/PDF preparados en la arquitectura.                                                                                                                                                                                                                                                                                                                                                        |

---

## Puesta en marcha rápida

Requisitos: **Node.js ≥ 22** (probado con 24.19) y **PostgreSQL** (probado con 17).

```bash
npm install                     # instala dependencias y genera el cliente Prisma
cp .env.example .env            # y rellena DATABASE_URL, AUTH_* (ver abajo)
npm run db:deploy               # aplica las migraciones
npm run db:seed                 # registra los proveedores (no crea datos de ejemplo)
npm run dev                     # http://localhost:3000  (incluye el worker de jobs)
```

Comprobación: `npm run health`.

---

## Instalación desde cero (Windows) — lo que se hizo en este equipo

Este equipo no tenía Node.js, PostgreSQL ni Docker. Se instaló lo siguiente (con confirmación del usuario):

| Software       | Versión                                           | Cómo                                                                                                                                                                               |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js LTS    | 24.19.0                                           | `winget install --id OpenJS.NodeJS.LTS -e`                                                                                                                                         |
| PostgreSQL     | 17.11 (servicio `postgresql-x64-17`, puerto 5432) | `winget install --id PostgreSQL.PostgreSQL.17 -e --override "--mode unattended --unattendedmodeui none --superpassword <...> --serverport 5432 --disable-components stackbuilder"` |
| Docker Desktop | 4.91.0                                            | `winget install --id Docker.DockerDesktop -e`                                                                                                                                      |

Notas de la instalación:

- **PostgreSQL**: la contraseña aleatoria del superusuario no llegó a guardarse (la ruta temporal superaba el límite de
  260 caracteres de Windows), así que se restableció con un script elevado que: hizo copia de `pg_hba.conf`, activó
  temporalmente `trust` solo para `127.0.0.1/::1`, fijó una contraseña nueva a `postgres`, creó el rol `bos`
  (LOGIN, CREATEDB) y la base de datos `bos`, y **restauró el `pg_hba.conf` original** (autenticación por contraseña).
  Las credenciales generadas están en `.local/CREDENCIALES-LOCALES.txt` (carpeta ignorada por git).
- **Docker Desktop** necesita **WSL2** (no estaba instalado). Tras reiniciar Windows, abre Docker Desktop y acepta
  instalar/activar WSL2 (o ejecuta `wsl --install` como administrador). Hasta entonces `docker compose` no funcionará.
- **Rutas largas**: Windows tiene `LongPathsEnabled=0`; por eso el proyecto vive en una ruta corta (`Desktop\Analisis Webs`).
- `.env` se generó automáticamente con: `DATABASE_URL` del rol `bos`, `AUTH_USERNAME=admin`, un hash scrypt de una
  contraseña aleatoria (en `.local/CREDENCIALES-LOCALES.txt`), `AUTH_SECRET` aleatorio y claves VAPID para notificaciones.

Pasos para reproducirlo en otro PC Windows:

```bash
winget install --id OpenJS.NodeJS.LTS -e
winget install --id PostgreSQL.PostgreSQL.17 -e
```

Después crea el usuario y la base de datos (desde "SQL Shell (psql)" como `postgres`):

```sql
CREATE ROLE bos WITH LOGIN CREATEDB PASSWORD 'una-contraseña-segura';
CREATE DATABASE bos OWNER bos;
```

y sigue la [puesta en marcha rápida](#puesta-en-marcha-rápida).

### Alternativa con Docker

```bash
# en .env: POSTGRES_PASSWORD, AUTH_USERNAME, AUTH_PASSWORD_HASH, AUTH_SECRET (+ claves opcionales)
docker compose up -d --build        # PostgreSQL + migraciones + app en http://localhost:3000
```

> El `Dockerfile` y `docker-compose.yml` están escritos pero **no se han podido probar en este equipo** porque Docker
> requiere reiniciar para activar WSL2.

---

## Configuración (.env)

Todas las variables están documentadas en [`.env.example`](.env.example). Las principales:

| Variable                                                             | Obligatoria   | Descripción                                                                                                                               |
| -------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                       | Sí            | Conexión PostgreSQL.                                                                                                                      |
| `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `AUTH_SECRET`                 | En producción | Login. Hash con `npm run auth:hash -- "contraseña"`. Secreto ≥32 caracteres. En desarrollo, si faltan, la app queda abierta con un aviso. |
| `GOOGLE_MAPS_API_KEY`                                                | No            | Activa Google Places API (New). Sin ella se usa OpenStreetMap.                                                                            |
| `GOOGLE_PLACES_FETCH_REVIEWS`                                        | No            | Pide hasta 5 reseñas en la misma llamada (SKU más caro).                                                                                  |
| `GOOGLE_MAX_REQUESTS_PER_SCAN`                                       | No            | Tope de llamadas a Google por escaneo (control de coste).                                                                                 |
| `SEARCH_PROVIDER=brave`, `SEARCH_API_KEY`                            | No            | Busca la web oficial cuando la ficha no la enlaza; mejora mucho la fiabilidad de "sin web".                                               |
| `CRAWLER_*`, `RESPECT_ROBOTS_TXT`                                    | No            | Límites del crawler.                                                                                                                      |
| `ENABLE_BROWSER_RENDERING`                                           | No            | Playwright para webs que requieren JavaScript (`npx playwright install chromium`).                                                        |
| `WORKER_MODE`                                                        | No            | `inprocess` (por defecto), `external` (`npm run worker`), `off`.                                                                          |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No            | Notificaciones push (`npx web-push generate-vapid-keys`).                                                                                 |
| `PRICE_*`                                                            | No            | Precios para estimar el coste de cada escaneo. **Verifícalos** en tu consola de Google Cloud.                                             |

### Google Places API (New)

1. Google Cloud Console → crea un proyecto y activa la facturación.
2. APIs y servicios → habilita **"Places API (New)"**.
3. Credenciales → crea una clave de API y **restríngela** a "Places API (New)" (y por IP si despliegas en un servidor).
4. Ponla en `GOOGLE_MAPS_API_KEY` y reinicia.

Uso eficiente: se usa Text Search (hasta 20 resultados por llamada, se factura por llamada) con `FieldMask` mínimo,
restricción rectangular + filtro exacto por distancia y reparto por turnos entre categorías. El coste estimado de cada
escaneo aparece en la UI.

---

## Uso

### Interfaz

- **Dashboard**: formulario de exploración, tarjetas resumen (analizados, sin web, caídas, con problemas, problemas de
  información, con contacto, oportunidades altas, última exploración, coste estimado), mejores oportunidades, seguimientos.
- **Escaneos**: historial y progreso en vivo ("67/120 negocios analizados"), avisos, coste.
- **Negocios**: tabla (tarjetas en móvil) con filtros rápidos y avanzados (categoría, estado web, oportunidad, rating,
  nº reseñas, con teléfono/email/web, problemas técnicos o de información, ciudad, fecha de análisis, estado comercial),
  orden y exportación CSV/JSON de lo filtrado.
- **Ficha del negocio**: resumen y 12 secciones (información, contacto, web actual, auditoría, información posiblemente
  desactualizada, reseñas, oportunidades, evidencias, "¿qué podría venderle?", historial, notas) + panel comercial.
- **Seguimientos**: agenda (vencidos, hoy, próximos, por contactar) con botón de llamada.
- **Ajustes**: instalar la app, activar notificaciones, estado del sistema y reglas de scoring.

### Línea de comandos

```bash
npm run scan -- Sevilla Sevilla España --radius 3 --categories restaurantes,peluquerias_estetica --max 40 --provider osm
npm run audit -- --url https://una-web.es --category restaurantes      # auditoría suelta (no guarda)
npm run audit -- <businessId>                                          # re-analiza y guarda
npm run export -- --format csv --level HIGH --hasPhone true            # → exports/
npm run health
npm run data:purge-provider                                            # retención de datos de Google
```

Categorías del catálogo: `restaurantes, bares_cafeterias, peluquerias_estetica, gimnasios, clinicas, talleres, tiendas,
abogados_asesorias, alojamientos, inmobiliarias, veterinarios, autoescuelas`.

---

## Móvil y uso 24/7

La app es una **PWA**: se instala desde el navegador del móvil sin tiendas de aplicaciones.

- **Android (Chrome)**: abre la URL de la app → menú ⋮ → _Instalar aplicación_.
- **iPhone (Safari)**: Compartir → _Añadir a pantalla de inicio_ (las notificaciones requieren iOS 16.4+ y la app instalada).
- En **Ajustes → Móvil** activa las notificaciones: recibirás un aviso cuando venza un seguimiento o termine un escaneo.
- En la ficha: botones grandes de **Llamar, WhatsApp, Email, Mapa y Web** (solo abren la app correspondiente; la aplicación
  nunca envía mensajes por ti).

**Para usarla 24/7 desde el móvil, la app tiene que estar desplegada en un servidor accesible** (tu PC apagado = app
apagada). Opciones y pasos en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): VPS/servicio con Docker (recomendado),
Railway/Render/Fly.io, o tu PC encendido + Tailscale (red privada sin exponer nada a Internet). El login es obligatorio
en producción y se sirve siempre bajo HTTPS.

---

## Arquitectura

```
src/
  app/            UI (App Router) y API (route handlers)          ← UI / API
  components/     componentes de interfaz
  domain/         tipos, categorías, etiquetas y PUERTOS (interfaces) ← dominio
  providers/      Google Places, OpenStreetMap, Brave Search        ← proveedores intercambiables
  analysis/       motor de análisis: http seguro, web, frescura, reseñas, contactos, scoring, recomendaciones
  jobs/           cola en PostgreSQL + worker + handlers (discover / analyze)
  db/             cliente Prisma, mapeos y persistencia
  server/         servicios de aplicación (escaneos, consultas, health, push, http)
  export/         exportadores (CSV, JSON; XLSX/PDF preparados)
  config/         env (zod), reglas de scoring, precios
  shared/         utilidades (logger con redacción, geo, teléfonos, texto, URLs, rate limit)
  auth/           contraseña (scrypt) y sesión firmada (HMAC)
prisma/           esquema y migraciones
scripts/          CLI (scan, audit, export, health, worker, seed…)
tests/            unit (Vitest) y e2e (Playwright)
```

Interfaces (en `src/domain/ports.ts`): `PlaceProvider`, `SearchProvider`, `WebsiteAnalyzer`,
`ContactDiscoveryProvider`, `ReviewAnalyzer`, `ScoringEngine`. Detalle y diagrama del flujo de jobs en
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Stack: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 (`@prisma/adapter-pg`) ·
PostgreSQL 17 · zod · cheerio · libphonenumber-js · web-push · Vitest · Playwright · ESLint · Prettier.

Tablas: `businesses`, `scans`, `scan_businesses`, `analyses`, `website_audits`, `contacts`, `evidence`,
`recommendations`, `providers`, `scan_jobs`, `manual_notes`, `worker_heartbeats`, `push_subscriptions`.

---

## Scoring explicable

Opportunity Score (0-100) = suma de contribuciones visibles en la ficha, por ejemplo:

```
OPPORTUNITY SCORE: 66 — Alta oportunidad (score ≥ 60)
+40 No se ha encontrado web oficial
+15 Negocio con actividad de clientes (150 reseñas en Google)
 +6 Teléfono disponible
 +5 Categoría que suele depender de reservas/citas online (inferencia)
```

Componentes 0-100: oportunidad web, web técnica, consistencia de la información, contactabilidad y **confianza de la
evidencia**. Niveles: Alta ≥60 · Media ≥40 · Baja · **Evidencia insuficiente** (confianza baja, web no verificable o
"sin web" basado solo en una fuente poco fiable como OSM). Entidades públicas y negocios cerrados → Baja.
Reglas editables en [`src/config/scoring.ts`](src/config/scoring.ts); explicación completa en [docs/SCORING.md](docs/SCORING.md).

---

## Seguridad

Resumen (detalle en [docs/SECURITY.md](docs/SECURITY.md)):

- **Anti-SSRF explícito** en el crawler: solo http/https y puertos 80/443/8080/8443, sin credenciales en URL, bloqueo de
  localhost, redes privadas, link-local/metadata (169.254.169.254), CGNAT, IPv6 ULA/link-local, IPv4 mapeada/NAT64,
  hostnames internos (`*.local`, `*.internal`, `metadata.google.internal`…), validación **en el socket** (anti DNS
  rebinding) y en cada redirección; límites de tiempo, tamaño (también tras descompresión) y páginas.
- Login con scrypt + cookie de sesión firmada `httpOnly`; proxy que protege UI y API; comprobación de origen en
  peticiones mutantes; rate limiting (login, escaneos, exportación…); validación zod de todas las entradas.
- Enlaces de terceros saneados (`safeHttpUrl`), CSV sin inyección de fórmulas, cabeceras de seguridad, errores sin
  detalles internos, logs con redacción de secretos, secretos solo en `.env` (ignorado por git).
- `npm audit`: 4 avisos "high" en la CLI de Prisma (dependencias de desarrollo `mysql2` y `deepmerge-ts`, no usadas en
  tiempo de ejecución); la única "solución" automática es bajar a Prisma 6, por lo que se acepta y se revisará al salir
  un parche de Prisma 7.

---

## Datos, privacidad y cumplimiento

Lee [docs/COMPLIANCE.md](docs/COMPLIANCE.md) antes de un uso comercial. Puntos clave:

- Solo datos públicos y APIs oficiales; nada de scraping de Google Maps.
- **Condiciones de Google Maps Platform**: limitan el almacenamiento de contenido de Places (el Place ID sí puede
  guardarse). La app guarda `providerDataFetchedAt` e incluye `npm run data:purge-provider` (retención configurable).
  Revisa tú las condiciones vigentes.
- **OpenStreetMap**: licencia ODbL — la app muestra la atribución "© OpenStreetMap contributors".
- Reseñas: solo fragmentos breves como evidencia; sin autores.
- **RGPD / LSSI (España)**: los datos de autónomos pueden ser datos personales; la LSSI (art. 21) prohíbe enviar
  comunicaciones comerciales por email sin consentimiento previo. La app **no envía nada**: úsala para priorizar y
  contacta respetando la normativa (p. ej. llamada o visita comercial, con derecho de oposición).

---

## Tests y calidad

```bash
npm run test         # 90 tests unitarios (Vitest)
npm run typecheck    # TypeScript estricto
npm run lint         # ESLint (config de Next.js)
npm run build        # build de producción
npm run test:e2e     # Playwright (PW_CHANNEL=msedge para usar Edge; o `npx playwright install chromium`)
```

Cubren: política anti-SSRF (IPs, notaciones alternativas, IPv6 mapeada/NAT64, hostnames, puertos, protocolos),
robots.txt, clasificación de URLs de terceros, extracción HTML (teléfonos, emails incl. ofuscados por Cloudflare,
schema.org, reservas, carta, señales temporales, placeholders), consistencia (incl. un falso positivo real de horarios
duplicados detectado durante las pruebas), reseñas, scoring (la valoración no influye, OSM → evidencia insuficiente,
cerrados/entidades públicas), recomendaciones con evidencia, normalización de Google/OSM, CSV, contraseñas y sesiones.

Verificado además de extremo a extremo con datos reales (OpenStreetMap, Sevilla): descubrimiento, análisis de webs
reales, progreso en vivo en la UI, re-análisis, ficha, filtros y vista móvil.

---

## Claude Code (skills y comandos)

- [`CLAUDE.md`](CLAUDE.md): reglas del producto, comandos, mapa de la arquitectura y convenciones.
- Skills en `.claude/skills/`: **scan-zone**, **website-audit**, **lead-analysis**, **security-review**.
- Comandos en `.claude/commands/`: **/scan**, **/audit**, **/review**, **/export**, **/health**.

Ejemplos: `/scan Sevilla Sevilla España --radius 3 --categories restaurantes`, `/audit <id>`, `/review`, `/export --level HIGH`, `/health`.

> Claude Code incluye comandos integrados con nombres parecidos (p. ej. su propia revisión de seguridad); si un nombre
> coincide, invoca la skill del proyecto por su nombre completo o pide "usa la skill security-review del proyecto".

---

## Registro de trabajo (fases implementadas)

| Fase                                       | Estado | Resumen                                                                                                             |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------- |
| 1. Scaffold + arquitectura + configuración | ✅     | Next.js 16 + TS + Tailwind 4, capas separadas, `.env.example`, validación zod, Prettier/ESLint.                     |
| 2. Discovery                               | ✅     | Google Places (New) con FieldMask, paginación, teselas, presupuesto; OSM (Nominatim + Overpass) con reintentos.     |
| 3. Persistencia                            | ✅     | Prisma 7 + PostgreSQL 17, 2 migraciones, upsert por (proveedor, Place ID), sin duplicados.                          |
| 4. Detección de webs                       | ✅     | Terceros vs. web propia, `business.site`, subdominios gratuitos, dominio que redirige a redes, búsqueda verificada. |
| 5. Auditoría web                           | ✅     | +45 comprobaciones, severidades, robots.txt, renderizado opcional con Playwright, SSRF.                             |
| 6. Contactos                               | ✅     | Proveedor + web + schema.org, con fuente y confianza; formularios deduplicados; sin emails inventados.              |
| 7. Scoring                                 | ✅     | Motor por reglas configurables, 5 componentes, desglose y nivel con motivo.                                         |
| 8. Dashboard                               | ✅     | Tarjetas, formulario, mejores oportunidades, seguimientos, escaneos recientes.                                      |
| 9. Ficha de negocio                        | ✅     | 12 secciones + "¿merece la pena contactar?" + CRM ligero.                                                           |
| 10. Exportación                            | ✅     | CSV y JSON (UI, API y CLI); XLSX/PDF preparados.                                                                    |
| 11. Claude Code                            | ✅     | CLAUDE.md, 4 skills, 5 comandos, settings con permisos.                                                             |
| 12. Tests + seguridad                      | ✅     | 90 unit + 8 E2E (escritorio y móvil), revisión de seguridad, `npm audit` documentado.                               |
| Extra: móvil 24/7                          | ✅     | PWA instalable, notificaciones push de seguimiento, vista móvil, Dockerfile/compose, guía de despliegue.            |

Correcciones hechas gracias a las pruebas con datos reales: falso "requiere JavaScript" en páginas mínimas; web Angular
con scripts en 404 ahora se clasifica como caída; horarios duplicados en schema.org ya no generan discrepancia (y los
horarios contradictorios de la propia web se distinguen); páginas `/cita-…` con formulario cuentan como reserva; "sin web"
basado solo en OSM → evidencia insuficiente; entidades públicas → baja.

---

## Limitaciones conocidas y próximos pasos

- **OpenStreetMap**: muchas fichas no incluyen la web → los "sin web" de OSM son poco fiables (se marcan así). Para uso
  comercial usa Google Places y/o configura `SEARCH_PROVIDER`.
- Google devuelve como máximo 5 reseñas por negocio: la señal de reseñas es limitada (y secundaria).
- Sin renderizado con navegador, las webs 100 % JavaScript solo se analizan parcialmente (se indica como "No verificado").
- Contraste de colores y diseño responsive real solo se miden con renderizado (Playwright).
- Comparación de horarios solo con datos estructurados (schema.org); los horarios en texto libre se muestran para revisión manual.
- Rate limiting en memoria (una instancia). Con varias instancias, usar Redis.
- No probado: Docker (pendiente de reinicio para WSL2) y Google Places real (requiere tu clave).
- Próximos pasos sugeridos: áreas por polígono (el modelo ya tiene `areaType`/`areaGeoJson`), exportación XLSX/PDF,
  consulta RDAP de caducidad de dominios, métricas Lighthouse opcionales, multiusuario con roles.
