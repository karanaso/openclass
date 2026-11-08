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

FROM runtime AS all-in-one
USER root
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/usr/lib/postgresql/16/bin:${PATH}"
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates curl tini redis-server; \
  install -d /usr/share/postgresql-common/pgdg; \
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list; \
  apt-get update; \
  apt-get install -y --no-install-recommends postgresql-16 postgresql-client-16; \
  pg_dropcluster --stop 16 main 2>/dev/null || true; \
  rm -rf /var/lib/apt/lists/* /var/lib/postgresql /var/log/postgresql /etc/postgresql; \
  mkdir -p /data/postgres /data/postgres-run /data/redis /data/media; \
  chown -R nextjs:nextjs /data; \
  chmod 700 /data/postgres /data/postgres-run
COPY docker/all-in-one-entrypoint.sh docker/validate-env.ts /app/docker/
RUN chmod +x /app/docker/all-in-one-entrypoint.sh
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=30 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker/all-in-one-entrypoint.sh"]
