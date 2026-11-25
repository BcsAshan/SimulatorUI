# Demo Air web UI (Next.js standalone build).
# PSS_GATEWAY_URL is baked into the /pss rewrite at build time, so pass the address the *UI container* uses
# to reach the gateway, e.g. http://gateway:8080 when it runs on the engine's docker compose network.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG PSS_GATEWAY_URL=http://gateway:8080
ENV PSS_GATEWAY_URL=$PSS_GATEWAY_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
