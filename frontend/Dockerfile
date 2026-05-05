###############################################################################
# Dockerfile — Frontend LabControl
#
# Dos etapas (multi-stage build):
#   dev   → npm start  (hot reload, para desarrollo local)
#   prod  → nginx      (build optimizado + security headers)
#
# Uso:
#   Desarrollo:  docker-compose up          (usa Dockerfile.dev o target dev)
#   Producción:  docker-compose -f docker-compose.prod.yml up
###############################################################################

# ── Etapa de build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Copiar dependencias y instalar primero (cache layer)
COPY package*.json ./
RUN npm ci --silent

# Copiar el resto del código y construir
COPY . .
RUN npm run build

# ── Etapa de producción (nginx) ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS prod

# Copiar el build de React al directorio de nginx
COPY --from=build /app/build /usr/share/nginx/html

# Copiar la configuración de nginx con security headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Quitar la config default de nginx (no mostrar página de bienvenida)
RUN rm -f /etc/nginx/conf.d/default.conf.bak

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# ── Etapa de desarrollo (npm start) ───────────────────────────────────────────
# Se usa en docker-compose.yml normal para hot-reload
FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm install
EXPOSE 3000
CMD ["npm", "start"]
