# Datos, privacidad y cumplimiento

> Esto no es asesoramiento legal. Resume los puntos que la app tiene en cuenta y lo que debes revisar tú.

## Fuentes de datos

| Fuente                               | Uso                                    | Condiciones a revisar                                                                                                                                                                                                                                                                              |
| ------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Places API (New)              | Descubrimiento, ficha, hasta 5 reseñas | [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms) y [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms). Limitan el almacenamiento en caché del contenido (el **Place ID sí puede guardarse** indefinidamente) y exigen atribución. |
| OpenStreetMap (Nominatim + Overpass) | Descubrimiento gratuito                | Licencia **ODbL** (atribución "© OpenStreetMap contributors", mostrada en la app). Políticas de uso de [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) (máx. 1 req/s, User-Agent identificable) y de Overpass.                                                               |
| Brave Search API (opcional)          | Encontrar la web oficial no enlazada   | Condiciones de la API de Brave.                                                                                                                                                                                                                                                                    |
| Webs de los negocios                 | Auditoría técnica                      | Se respeta `robots.txt` (`RESPECT_ROBOTS_TXT=true`), User-Agent identificable (`CRAWLER_CONTACT`), pocas páginas por web.                                                                                                                                                                          |

No se hace scraping de Google Maps ni de redes sociales.

## Minimización y retención

- Reseñas: solo un fragmento ≤160 caracteres como evidencia, con fecha y nota; **sin autor**. El texto completo solo
  existe en memoria/payload del job y se borra al terminar el job.
- No se guarda el HTML de las webs, solo los datos extraídos (contacto, estructura, hallazgos).
- `providerDataFetchedAt` registra cuándo se obtuvieron los datos del proveedor. `npm run data:purge-provider` borra los
  datos cacheados de Google con más de `PROVIDER_DATA_TTL_DAYS` días (por defecto 30) conservando el Place ID y tu trabajo
  (notas, estado comercial). Programa este comando (p. ej. cron diario) si usas Google.
- Contactos: solo datos empresariales públicos con su fuente. Nunca se deducen emails por patrón.

## RGPD y LSSI (España)

- Los datos de contacto de **autónomos** o que identifican a una persona pueden ser datos personales (RGPD). Base
  habitual: interés legítimo para prospección B2B, con información al interesado y derecho de oposición. Documenta tu
  análisis de interés legítimo y atiende solicitudes de supresión (puedes borrar el negocio de la base de datos).
- **LSSI art. 21**: prohíbe enviar comunicaciones comerciales por correo electrónico (u otro medio electrónico
  equivalente, como WhatsApp) que no hayan sido solicitadas o autorizadas expresamente. Por eso la app **no envía
  nada**: úsala para priorizar y contacta por vías permitidas (p. ej. llamada comercial respetando la Lista Robinson
  y el derecho de oposición, o visita).
- La app no automatiza emails, llamadas ni mensajes, y no recopila datos personales innecesarios.
