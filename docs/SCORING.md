# Scoring explicable

El score **no es una verdad**: es una ayuda para decidir a quién contactar primero. Todo se configura en
[`src/config/scoring.ts`](../src/config/scoring.ts) y se explica en la ficha de cada negocio.

## Opportunity Score (0-100)

Suma de contribuciones, cada una con su motivo:

| Bloque                        | Máx. | Cómo suma                                                                                                                                                                                                                                                       |
| ----------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                           | 40   | Sin web oficial o web caída: **40**. Web con problemas: CRÍTICO 15, ALTO 7, MEDIO 3, BAJO 0,5 por hallazgo (máx. 35). Web aceptable: máx. 8 (mejoras menores). No verificable: 0.                                                                               |
| Consistencia / frescura       | 20   | Teléfono distinto 8 · dirección 6 · horario 6 · estado 6 · aviso COVID 5 · eventos antiguos 4 · ficha sin enlace a la web 4 · dominios enlazados desaparecidos 3 · sitemap antiguo 2 · ficha sin teléfono 2 · horarios contradictorios 2 · copyright antiguo 1. |
| Reseñas (secundario)          | 10   | Horario/teléfono/dirección/info/carta incorrectos 4 · otras señales 2. Marcado como inferencia.                                                                                                                                                                 |
| Actividad de clientes         | 15   | Nº de reseñas: ≥100 → 15, ≥30 → 10, ≥10 → 6, ≥1 → 3. **La nota media no se usa.**                                                                                                                                                                               |
| Contactabilidad               | 10   | Teléfono 6 · email 2 · formulario o WhatsApp 2.                                                                                                                                                                                                                 |
| Necesidad típica (inferencia) | 5    | Categorías de reservas/citas o carta sin ese sistema en la web.                                                                                                                                                                                                 |
| Penalizaciones                | —    | Cerrado temporalmente −15. Cerrado permanentemente → 0.                                                                                                                                                                                                         |

## Componentes (0-100)

| Componente              | Significado                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website Opportunity     | Parte "web" del score normalizada (cuánto margen de mejora web hay).                                                                                                        |
| Technical Website       | Calidad técnica de la web (100 − penalizaciones por severidad). "No verificado" si no hay web.                                                                              |
| Information Consistency | 100 − penalizaciones por discrepancias/señales de desactualización. "No verificado" si no hay nada comparable.                                                              |
| Digital Contactability  | Teléfono 40, email 25, formulario 10, WhatsApp 10, página de contacto 5, redes 10.                                                                                          |
| Evidence Confidence     | Cuánto nos podemos fiar del resultado: datos base 35 + calidad de la determinación del estado web + reseñas analizadas + ficha completa. Las razones se listan en la ficha. |

## Niveles (reglas, en este orden)

1. Cerrado permanentemente → **Baja**.
2. Posible entidad pública (inferido por el nombre: centro de salud, ayuntamiento…) → **Baja**.
3. "Sin web" basado solo en un proveedor poco fiable para ese dato (OSM) y sin contraste con buscador → **Evidencia insuficiente**.
4. Confianza de la evidencia < 40 → **Evidencia insuficiente**.
5. Web no verificable y score < 60 → **Evidencia insuficiente**.
6. Score ≥ 60 → **Alta** · ≥ 40 → **Media** · resto → **Baja**.

## Por qué no se usa la valoración

Un 4,9 puede tener una web horrible y un 3,8 una web excelente: la calidad del negocio no es la oportunidad de mejora
digital. El nº de reseñas sí indica que el negocio está activo y tiene clientes (lo que hace la oportunidad más real).

## Recomendaciones ("¿Qué podría venderle?")

Motor en `src/analysis/recommendations/engine.ts`: cada recomendación tiene `triggeredBy` con los códigos de hallazgo
que la justifican; sin hallazgos no hay recomendación. Ejemplos: sin web → web corporativa local (+ reservas / carta si
la categoría lo requiere, + landing como alternativa); sin viewport → rediseño mobile-first; teléfono discrepante →
actualizar información y unificar fuentes; sin reserva en categoría de citas → evaluar sistema de reservas.
