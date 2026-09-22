---
description: Exporta negocios a CSV/JSON con los mismos filtros que la tabla (ej. /export --level HIGH --hasPhone true)
argument-hint: [--format csv|json] [--scanId id] [--level HIGH] [--websiteStatus SIN_WEB] [--hasPhone true] ...
allowed-tools: Bash(npm run export:*), Read
---

Exporta los negocios con: `npm run export -- $ARGUMENTS`

Filtros disponibles (ver `src/server/business-query.ts`): `q, scanId, category, city, websiteStatus, level, leadStatus,
minRating, maxRating, minReviews, hasPhone, hasEmail, hasWebsite, technicalIssues, infoIssues, analyzedFrom, analyzedTo, sort`.

Indica la ruta del archivo generado (carpeta `exports/`, ignorada por git) y cuántas filas tiene. El CSV usa `;` y BOM
UTF-8 para abrirse bien en Excel en español. XLSX y PDF están previstos pero aún no implementados.
