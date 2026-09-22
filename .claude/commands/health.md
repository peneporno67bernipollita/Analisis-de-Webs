---
description: Comprueba el estado del sistema (config, base de datos, worker, proveedores, auth, push)
allowed-tools: Bash(npm run health), Bash(npm run typecheck), Read
---

Ejecuta `npm run health` y explica cada comprobación que falle con su solución concreta:

- Base de datos: ¿PostgreSQL arrancado? ¿`DATABASE_URL` correcta? ¿migraciones aplicadas (`npm run db:deploy`)?
- Worker: con `WORKER_MODE=inprocess` necesita `npm run dev`/`npm start` en marcha; con `external`, `npm run worker`.
- Proveedores: Google requiere `GOOGLE_MAPS_API_KEY` con "Places API (New)" habilitada; OSM no requiere clave.
- Autenticación: obligatoria en producción (`AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `AUTH_SECRET`).

Nunca muestres valores de secretos, solo si están configurados.
