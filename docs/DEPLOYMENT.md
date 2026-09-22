# Despliegue y uso desde el móvil (24/7)

La app es una **PWA**: el móvil la instala desde el navegador. Para tenerla disponible 24/7 debe ejecutarse en un
servidor siempre encendido. Elige una opción:

| Opción                                              | Coste aprox. | Dificultad | Notas                                                                                                            |
| --------------------------------------------------- | ------------ | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **A. VPS con Docker** (Hetzner, DigitalOcean, OVH…) | 4–10 €/mes   | Media      | Recomendado. `docker compose up -d` + dominio + HTTPS.                                                           |
| **B. Railway / Render / Fly.io**                    | 5–20 $/mes   | Baja       | Plataforma gestionada con PostgreSQL. Necesita un proceso Node persistente (no serverless) para el worker.       |
| **C. Tu PC + Tailscale**                            | 0 €          | Baja       | Solo funciona con el PC encendido. El móvil accede por la red privada de Tailscale, sin exponer nada a Internet. |

> Vercel (serverless) no es adecuado tal cual: el worker de jobs necesita un proceso de larga duración.

## Requisitos comunes de producción

1. Variables en `.env` (ver `.env.example`): `DATABASE_URL`, **`AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `AUTH_SECRET`**
   (obligatorias en producción: sin ellas la app responde 503), claves VAPID para notificaciones y, si procede,
   `GOOGLE_MAPS_API_KEY`, `SEARCH_PROVIDER`/`SEARCH_API_KEY`.
2. **HTTPS obligatorio**: necesario para instalar la PWA y para las notificaciones push.
3. Migraciones: `npm run db:deploy` (o el servicio `migrate` de docker compose).
4. Programa `npm run data:purge-provider` diariamente si usas Google Places.

Generar credenciales:

```bash
npm run auth:hash -- "una-contraseña-larga-y-única"      # → AUTH_PASSWORD_HASH
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # → AUTH_SECRET
npx web-push generate-vapid-keys                          # → NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

## A. VPS con Docker

```bash
# En el servidor (Ubuntu), con Docker instalado:
git clone https://github.com/<usuario>/Analisis-de-Webs.git && cd Analisis-de-Webs
cp .env.example .env && nano .env         # POSTGRES_PASSWORD, AUTH_*, VAPID_*, claves opcionales
docker compose up -d --build
```

HTTPS con Caddy (proxy inverso con certificado automático), por ejemplo `/etc/caddy/Caddyfile`:

```
oportunidades.tudominio.es {
  reverse_proxy localhost:3000
}
```

Apunta el DNS del dominio al servidor, reinicia Caddy y abre `https://oportunidades.tudominio.es` en el móvil.

Copias de seguridad: `docker compose exec db pg_dump -U bos bos > backup.sql` (prográmalo con cron).

## B. Plataforma gestionada (ej. Railway)

1. Crea un proyecto desde el repositorio de GitHub y añade un servicio PostgreSQL.
2. Variables: `DATABASE_URL` (la de la plataforma), `AUTH_*`, `VAPID_*`, `NODE_ENV=production`, `WORKER_MODE=inprocess`.
3. Build: `npm ci && npm run build` · Pre-deploy: `npm run db:deploy` · Start: `npm start`.
4. Usa el dominio HTTPS que te da la plataforma (o uno propio).

## C. PC propio + Tailscale (sin exponer nada a Internet)

1. En el PC: `npm run build && npm start` (o `npm run dev`), con `AUTH_*` configurado.
2. Instala [Tailscale](https://tailscale.com/) en el PC y en el móvil con la misma cuenta.
3. `tailscale serve --bg 3000` publica la app con HTTPS solo dentro de tu red Tailscale.
4. En el móvil abre la URL `https://<nombre-del-pc>.<tu-tailnet>.ts.net` e instálala.

## Instalar en el móvil

- **Android (Chrome)**: abre la URL → menú ⋮ → _Instalar aplicación_.
- **iPhone (Safari)**: Compartir → _Añadir a pantalla de inicio_. Notificaciones: iOS 16.4+ y abrir la app desde el icono.
- Dentro de la app: **Ajustes → Móvil → Activar notificaciones** (y "Enviar prueba").

## Worker separado (opcional)

Con varios servidores web o escaneos grandes: `WORKER_MODE=external` en el servidor web y uno o más procesos
`npm run worker` (se reparten el trabajo con `FOR UPDATE SKIP LOCKED`).
