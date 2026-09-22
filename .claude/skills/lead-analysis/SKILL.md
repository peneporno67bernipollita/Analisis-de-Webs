---
name: lead-analysis
description: Analiza negocios ya escaneados como oportunidades comerciales de servicios web - prioriza, explica el score, resume evidencias y propone qué ofrecer, sin tomar la decisión por el usuario. Úsala cuando pregunten "¿a quién contacto?", "¿merece la pena este negocio?", "¿qué le vendo?" o pidan un resumen comercial.
---

# Análisis de oportunidades (leads)

## Fuentes de datos

- Base de datos (Prisma): tablas `businesses` (instantánea del último análisis + CRM), `analyses` (`scoreBreakdown`,
  `unverified`, `reviewSignals`), `evidence` (hallazgos), `recommendations`, `contacts`, `manual_notes`.
- API local: `GET /api/businesses?level=HIGH&hasPhone=true` y `GET /api/businesses/<id>` (con `npm run dev` en marcha).
- Exportación: `npm run export -- --format json --level HIGH`.

## Para cada negocio responde (formato breve)

1. **¿Por qué aparece?** → contribuciones del score (`scoreBreakdown.contributions`), p. ej. "+40 No se ha encontrado web oficial".
2. **¿Qué problema tiene?** → hallazgos CRITICAL/HIGH/MEDIUM con su evidencia concreta.
3. **¿Qué evidencia existe?** → cita evidencias reales (URL, valor, fuente). Marca las inferencias como tales.
4. **¿Qué contacto tengo?** → contactos con su fuente. Si no hay email: "Email no encontrado" (nunca lo deduzcas).
5. **¿Qué podría ofrecerle?** → `recommendations` (productType + triggeredBy).
6. **¿Qué no está verificado?** → `unverified` y el nivel `INSUFFICIENT_EVIDENCE`.

## Reglas

- El score es una ayuda para priorizar, no una verdad. La decisión es del usuario.
- No mezcles calidad del negocio (estrellas) con oportunidad digital.
- Si dos fuentes discrepan, muestra ambas.
- No redactes ni envíes mensajes a negocios en nombre del usuario salvo que lo pida explícitamente, y nunca los envíes tú.
- Tras hablar con un negocio, el usuario registra el estado en la ficha (Seguimiento comercial) o vía `PATCH /api/businesses/<id>`.
