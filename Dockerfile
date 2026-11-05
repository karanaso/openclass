FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg poppler-utils openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npx prisma generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json package-lock.json next.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY messages ./messages
COPY docker ./docker
RUN npx prisma generate \
  && useradd --create-home --uid 1001 nextjs \
  && mkdir -p /data \
  && chown -R nextjs:nextjs /app /data \
  && chmod +x /app/docker/*.sh
USER nextjs
EXPOSE 3000
ENTRYPOINT ["/app/docker/web-entrypoint.sh"]
CMD ["npm", "run", "start"]

FROM runtime AS web

FROM runtime AS worker
ENTRYPOINT ["/app/docker/worker-entrypoint.sh"]
CMD ["npm", "run", "worker"]
