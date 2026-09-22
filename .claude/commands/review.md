---
description: Revisión de calidad del proyecto (tipos, lint, tests, build) y de las reglas del producto
argument-hint: [ruta o área opcional]
allowed-tools: Bash(npm run typecheck), Bash(npm run lint), Bash(npm run test), Bash(npm run build), Bash(git diff:*), Bash(git status), Read, Grep, Glob
---

Revisa el proyecto (o el área indicada: $ARGUMENTS):

1. Ejecuta `npm run typecheck`, `npm run lint` y `npm run test`; si tocaste UI o rutas, también `npm run build`.
2. Revisa el diff (`git diff`) contra las **reglas absolutas** de `CLAUDE.md`:
   - ¿Algún dato podría mostrarse inventado o una inferencia como hecho?
   - ¿Hallazgos nuevos con procedencia/confianza y evidencia?
   - ¿Recomendaciones con `triggeredBy`? ¿El rating afecta al score? (no debe)
   - ¿Peticiones de red fuera de `safeFetch`? ¿Rutas API sin `guard()`?
3. Si hay cambios de seguridad sensibles, aplica también la skill `security-review`.
4. Informa de problemas encontrados con archivo:línea y corrige los evidentes.
