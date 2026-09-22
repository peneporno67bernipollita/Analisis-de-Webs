# syntax=docker/dockerfile:1
# Imagen de producción de Business Opportunity Scanner (Next.js standalone + worker in-process)

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dependencias ------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# --- Build -------------------------------------------------------------------
FROM deps AS builder
COPY . .
# prisma generate solo necesita que DATABASE_URL exista (no se conecta)
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
 && npm run build

# --- Runtime -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "server.js"]
