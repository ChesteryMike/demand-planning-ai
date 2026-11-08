# =====================================================================
# Demand Planning AI · imagen de la app completa (PROMPT_MAESTRO 8.1)
# Es la misma imagen que se prueba en local y que publica Cloud Run.
# · Sin ARG de build ni NEXT_PUBLIC_*: todas las variables se leen al ejecutar.
# · Los secretos solo se pasan en `docker run --env-file .env`; nunca se copian.
# =====================================================================

# 1. Dependencias (incluye las de desarrollo: hacen falta para compilar)
FROM node:22-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build de Next.js en modo standalone (sin conexión a la base: las vistas son dinámicas)
FROM node:22-alpine AS construccion
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Imagen final: solo standalone, static, public y prompts, con un usuario sin privilegios
FROM node:22-alpine AS final
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S -G app app
COPY --from=construccion --chown=app:app /app/.next/standalone ./
COPY --from=construccion --chown=app:app /app/.next/static ./.next/static
COPY --from=construccion --chown=app:app /app/public ./public
COPY --from=construccion --chown=app:app /app/prompts ./prompts
USER app
EXPOSE 3000
# server.js (standalone) escucha en $HOSTNAME:$PORT; Cloud Run define PORT.
CMD ["node", "server.js"]
