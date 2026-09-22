---
name: website-audit
description: Audita la web de un negocio (por URL o por id de negocio) con el analizador del proyecto e interpreta los hallazgos con severidad, procedencia y evidencia. Úsala para depurar falsos positivos/negativos del análisis web, añadir nuevas comprobaciones o explicar por qué una web se clasificó de cierta forma.
---

# Auditoría web

## Ejecutar

```bash
npm run audit -- --url https://ejemplo.es --category restaurantes   # no guarda nada
npm run audit -- --url https://ejemplo.es --json                      # salida completa
npm run audit -- <businessId>                                         # re-analiza y guarda en BD
```

## Cómo interpretar

- Estado (`WebsiteStatus`): `SIN_WEB`, `WEB_CAIDA`, `WEB_FUNCIONAL_CON_PROBLEMAS`, `WEB_ACEPTABLE`, `WEB_NO_VERIFICABLE`.
  Reglas en `src/analysis/website/analyzer.ts` (sección "Estado final"): CRITICAL/HIGH o ≥3 MEDIUM → con problemas.
- Cada hallazgo tiene `code`, `severity`, `provenance` (OBSERVED/ANALYZED/INFERRED), `confidence` y `evidence[]`.
- "No verificado" lista lo que no se pudo comprobar (JS sin renderizar, robots.txt, contraste…). No lo conviertas en problema.

## Depurar un falso positivo / negativo (flujo recomendado)

1. Reproduce con `--url` y `--json`. Mira `extraction` (teléfonos, emails, schema.org, reservas, carta…).
2. Contrasta con la web real usando `curl -s -A "Mozilla/5.0" <url>` (no uses fetch directo desde código de la app).
3. Corrige la heurística en `src/analysis/website/html.ts` (extracción) o `analyzer.ts` / `freshness/consistency.ts` (reglas).
4. Añade un test en `tests/unit/` con un fragmento HTML mínimo que reproduzca el caso.
5. `npm run test && npm run typecheck`.

## Añadir una comprobación nueva

- Usa `finding(code, category, severity, title, description, evidence, { provenance, confidence })`.
- Si es una deducción (p. ej. "no es responsive" a partir de HTML), `provenance: "INFERRED"` y dilo en la descripción.
- Severidad proporcional al impacto comercial; las mejoras menores son `LOW`.
- Si procede, añade puntos en `src/config/scoring.ts` y una recomendación con `triggers` en `src/analysis/recommendations/engine.ts`.
- Toda petición de red: `safeFetch` (anti-SSRF). Respeta `robots.txt` y los límites de páginas/enlaces.
