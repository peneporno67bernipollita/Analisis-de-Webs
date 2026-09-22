# Seguridad

## Política anti-SSRF (crawler)

El análisis visita URLs publicadas por terceros (fichas de negocios, buscadores, enlaces internos). Todas las
peticiones pasan por `safeFetch` (`src/analysis/http/safe-fetch.ts`) con la política de `src/analysis/http/ssrf.ts`:

| Control              | Detalle                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocolos           | Solo `http:` y `https:` (se rechaza `file:`, `ftp:`, `gopher:`, `data:`, `javascript:`…).                                                                                                                |
| Puertos              | Solo 80, 443, 8080, 8443.                                                                                                                                                                                |
| Credenciales         | URLs con `usuario:contraseña@` rechazadas.                                                                                                                                                               |
| Hostnames            | `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.lan`, `*.home.arpa`, `*.corp`, `metadata.google.internal`, nombres sin punto…                                                                    |
| IPs (v4)             | 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16 (incluye metadata 169.254.169.254), 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4.   |
| IPs (v6)             | ::, ::1, 100::/64, 2001::/23, 2001:db8::/32, 2002::/16, fc00::/7, fe80::/10, fec0::/10, ff00::/8, fd00:ec2::254; IPv4 mapeada (::ffff:0:0/96), compatible y NAT64 (64:ff9b::/96) se evalúan por su IPv4. |
| Notaciones raras     | `http://2130706433/`, `http://0x7f.1/`, `http://0177.0.0.1/` → el parser WHATWG las normaliza a 127.0.0.1 → bloqueadas.                                                                                  |
| DNS rebinding        | La comprobación se hace en el `lookup` del socket (la IP a la que realmente se conecta). Si **cualquier** IP resuelta es interna, se rechaza.                                                            |
| Redirecciones        | Manuales (máx. 6), cada salto se re-valida.                                                                                                                                                              |
| Límites              | Timeout total, tamaño máximo (también tras descomprimir gzip/br/deflate), nº de páginas y enlaces por web.                                                                                               |
| Navegador (opcional) | Playwright con `page.route` validando cada petición. Riesgo residual: Chromium resuelve DNS por su cuenta; en producción, ejecuta el worker en una red sin acceso a servicios internos.                  |
| Web Push             | `POST /api/push/subscribe` solo acepta endpoints de servicios push conocidos (FCM, Mozilla, Apple, Windows).                                                                                             |

Verificado con tests (`tests/unit/ssrf.test.ts`) y contra dominios reales que apuntan a loopback (p. ej. `localtest.me`).

## Autenticación y acceso

- Un único usuario configurado por variables de entorno (`AUTH_USERNAME`, `AUTH_PASSWORD_HASH` scrypt, `AUTH_SECRET`).
- Sesión: cookie `bos_session` `httpOnly`, `SameSite=Lax`, `Secure` en producción, firmada con HMAC-SHA256
  (comparación en tiempo constante) y con caducidad.
- `src/proxy.ts` protege todas las rutas (UI y API). En producción sin autenticación configurada responde 503.
- Defensa en profundidad: cada route handler llama a `guard()` (sesión + mismo origen en mutaciones + rate limit).
- Login: rate limit por IP (10/15 min) y global (50/15 min); mensajes genéricos.

## Entradas y salidas

- Validación zod en todas las APIs (escaneos, filtros, CRM, notas, push).
- Enlaces a datos de terceros: `safeHttpUrl` (solo http/https) y `rel="noopener noreferrer nofollow"`.
- Exportación CSV: neutraliza fórmulas (`= + - @` al inicio).
- Errores de API sin detalles internos; logs JSON con redacción de claves, tokens, contraseñas y credenciales en URLs.
- Cabeceras: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, CSP `frame-ancestors 'none'`.

## Secretos

- Solo en `.env` (ignorado por git). `.env.example` documenta las variables sin valores reales.
- `.local/` (credenciales locales generadas) está ignorada por git.
- Health y UI solo indican si un secreto está configurado, nunca su valor.

## Dependencias

`npm audit --omit=dev` informa de 4 avisos "high" en la cadena de la CLI de Prisma (`mysql2`, `deepmerge-ts`), que no se
usan en tiempo de ejecución (usamos PostgreSQL y la configuración es nuestra). La corrección automática implicaría bajar a
Prisma 6; se acepta el riesgo y se actualizará con el próximo parche de Prisma 7.

## Recomendaciones para producción

- Servir siempre detrás de HTTPS (proxy inverso / plataforma) y restringir la clave de Google por IP/API.
- Si despliegas con varias instancias, sustituye el rate limit en memoria por Redis.
- Mantén el worker sin acceso a redes internas (VPC/firewall) como segunda barrera anti-SSRF.
- Revisa periódicamente con la skill `security-review` (`.claude/skills/security-review`).
