---
description: Audita la web de un negocio guardado (id) o una URL suelta y explica los hallazgos
argument-hint: <businessId> | --url https://web.es [--category restaurantes]
allowed-tools: Bash(npm run audit:*), Read, Grep
---

Usa la skill `website-audit` con: $ARGUMENTS

- Si el argumento empieza por `http`, ejecútalo como `npm run audit -- --url $ARGUMENTS`.
- Si es un id, `npm run audit -- $ARGUMENTS` (re-analiza y guarda).

Explica el estado de la web, los hallazgos por severidad (indicando cuáles son inferencias), la evidencia de cada uno
y lo que no se ha podido verificar. Si detectas un posible falso positivo, propón el ajuste y el test que lo cubriría.
