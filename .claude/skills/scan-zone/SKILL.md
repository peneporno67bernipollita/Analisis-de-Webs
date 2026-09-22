---
name: scan-zone
description: Lanza y supervisa un escaneo de negocios de una zona (ciudad/provincia/país) con el pipeline real del proyecto, y resume resultados y oportunidades con sus evidencias. Úsala cuando pidan escanear, explorar o buscar negocios/oportunidades en una ciudad o zona.
---

# Escanear una zona

Objetivo: ejecutar el flujo real DISCOVERY → ANALYSIS → ENRICHMENT → SCORING para una zona y resumir el resultado
sin inventar nada.

## Pasos

1. Comprueba el sistema: `npm run health`. Si la base de datos falla, detente e indica cómo arrancar PostgreSQL.
2. Elige proveedor:
   - `google` si `GOOGLE_MAPS_API_KEY` está configurada (health lo indica). Tiene coste: avisa del límite `GOOGLE_MAX_REQUESTS_PER_SCAN`.
   - `osm` en otro caso (gratuito; sin reseñas; el campo web está incompleto → muchos "Sin web" quedarán como evidencia insuficiente).
3. Traduce la petición a argumentos. Categorías del catálogo (`src/domain/categories.ts`): `restaurantes, bares_cafeterias,
peluquerias_estetica, gimnasios, clinicas, talleres, tiendas, abogados_asesorias, alojamientos, inmobiliarias,
veterinarios, autoescuelas`. Con Google también se admite texto libre.
4. Ejecuta (procesa en el propio proceso y muestra progreso):
   ```bash
   npm run scan -- "<ciudad>" "<provincia>" "<país>" --radius <km> --categories <a,b> --max <n> --provider <google|osm>
   ```
   Empieza con `--max 20-30` y radio pequeño salvo que pidan más.
5. Resume para el usuario:
   - nº de negocios encontrados/analizados/con error y coste estimado;
   - top oportunidades con **su motivo** (`opportunityReason`) y nivel;
   - avisos del escaneo (límites, categorías ignoradas…);
   - qué NO está verificado (p. ej. "sin web" basado solo en OSM).
6. Sugiere revisar las fichas en la UI (`/scans/<id>`) o exportar: `npm run export -- --scanId <id>`.

## Reglas

- No afirmes que un negocio "no tiene web" si el nivel es `INSUFFICIENT_EVIDENCE`: di "no se ha encontrado web verificable".
- Nunca contactes con negocios ni generes emails. Solo informa de los contactos públicos encontrados y su fuente.
- Si el proveedor devuelve 403/401: la clave no es válida o "Places API (New)" no está habilitada; no reintentes en bucle.
