# Deployment

## Prerequisites

- Docker Engine 24+ with Compose v2
- 4 vCPU, 8 GB RAM, 100 GB SSD recommended for a single class load
- A domain name and TLS termination (Caddy, nginx, or a load balancer)

## Configuration

```bash
cp .env.example .env
```

Set at least:

```bash
AUTH_SECRET=$(openssl rand -base64 48)
TEACHER_PASSWORD=...            # or TEACHER_PASSWORD_HASH
OPENAI_API_KEY=sk-...
AI_PROVIDER=openai
TTS_PROVIDER=openai
APP_BASE_URL=https://lessons.example.com
```

`.env` is never copied into the image (see `.dockerignore`). It is injected by Compose at runtime.

## Start

```bash
docker compose build
docker compose up -d
docker compose ps
curl -fsS http://localhost:3100/api/health
```

Services:

- `web` — Next.js on host port `3100` (container `3000`), runs `prisma migrate deploy` in the entrypoint.
- `worker` — BullMQ processor for extraction, generation, TTS, and video.
- `postgres` — PostgreSQL 16 with the `pgdata` volume.
- `redis` — Redis 7 with the `redisdata` volume.
- `media` — shared volume mounted at `/data` in web and worker.

The worker starts only after the web health check passes, which guarantees migrations ran.

## Reverse proxy

Terminate TLS in front of `web:3100` and forward:

```caddy
lessons.example.com {
  reverse_proxy 127.0.0.1:3100
}
```

Set `APP_BASE_URL` to the public URL. Cookies are `Secure` when `NODE_ENV=production`.

## Health

`GET /api/health` returns `200` with `{status:"ok", checks:{env,database,redis,storage}}` or `503` with `status:"degraded"` and the failing checks. The Compose healthcheck uses it.

## Upgrades

```bash
git pull
docker compose build
docker compose up -d
```

Migrations are forward-only. Take a backup before upgrading. Roll back by restoring the previous database and media snapshot and checking out the prior image tag.

## Resource notes

- ffmpeg is the CPU peak; render concurrency is one by default.
- Media grows with video variants. Monitor `/data` and set `MAX_VIDEO_SECONDS`.
- OpenAI spend is driven by text generation and TTS. Use the usage summary and `GENERATION_MAX_ATTEMPTS` to control retries.

## Secrets

- Generate `AUTH_SECRET` with at least 32 random bytes.
- Prefer `TEACHER_PASSWORD_HASH` (Argon2id) over plaintext.
- Rotate `AUTH_SECRET` to invalidate all teacher and student sessions.
- Never commit `.env`; never bake it into an image.

## Security checklist

- TLS enabled and HTTP redirected to HTTPS.
- `APP_BASE_URL` matches the public origin.
- Backups running nightly (see `docs/operations.md`).
- Disk and health alerts configured.
- OpenAI key scoped to the project and rotated periodically.
