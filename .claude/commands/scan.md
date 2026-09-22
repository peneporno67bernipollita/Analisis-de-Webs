---
description: Escanea negocios de una zona (ej. /scan Sevilla Sevilla España --radius 3 --categories restaurantes)
argument-hint: <ciudad> <provincia> <país> [--radius km] [--categories a,b] [--max n] [--provider google|osm]
allowed-tools: Bash(npm run scan:*), Bash(npm run health), Bash(npm run export:*), Read
---

Usa la skill `scan-zone` para escanear esta zona: $ARGUMENTS

Si faltan provincia o país, pregunta solo si no se pueden deducir con seguridad (p. ej. "Sevilla" → Sevilla, España).
Empieza por `npm run health`, ejecuta `npm run scan -- $ARGUMENTS` (añade `--max 30` si no se indicó) y resume:
negocios analizados, top oportunidades con su motivo, avisos, coste estimado y datos no verificados.
