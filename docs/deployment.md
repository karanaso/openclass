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

## Single-container mode

`Dockerfile` also has an `all-in-one` target that runs the web server, worker, PostgreSQL 16, and Redis in one container. Use it for demos, evaluation, single-host hand-offs, and small deployments where operating Compose is not worth it. Compose remains the recommended production topology.

### Build and run

```bash
docker build --target all-in-one -t lessonlab:all-in-one .

docker run -d --name lessonlab \
  -p 3000:3000 \
  -e AUTH_SECRET="$(openssl rand -base64 48)" \
  -e TEACHER_PASSWORD='change-me' \
  -e OPENAI_API_KEY='sk-...' \
  -e APP_BASE_URL='http://localhost:3000' \
  -v lessonlab-data:/data \
  lessonlab:all-in-one

curl -fsS http://localhost:3000/api/health
docker logs -f lessonlab
```

For a keyless local run, add `-e AI_PROVIDER=mock -e TTS_PROVIDER=mock`.

The container validates its environment before starting anything. A missing `AUTH_SECRET`, teacher credential, or required OpenAI key exits non-zero with the failing variable in the log. The first start initializes PostgreSQL under `/data/postgres`, starts Redis with append-only persistence, applies Prisma migrations, and only then starts the web server and worker. The `HEALTHCHECK` reports healthy when `/api/health` returns `ok`; expect up to 60 seconds on the first start.

### Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | required | At least 32 characters; rotate to invalidate sessions. |
| `TEACHER_PASSWORD` / `TEACHER_PASSWORD_HASH` | required | One of the two; prefer the Argon2id hash in shared environments. |
| `OPENAI_API_KEY` | required for `openai` providers | Not needed when both providers are `mock`. |
| `AI_PROVIDER`, `TTS_PROVIDER` | `openai` | Set both to `mock` to run without external AI calls. |
| `APP_BASE_URL` | `http://localhost:3000` | Public origin used in share links and cookies. |
| `POSTGRES_USER` | `lessonlab` | Embedded database role; used only when the cluster is first initialized. |
| `POSTGRES_PASSWORD` | `lessonlab` | Embedded database password; used only when the cluster is first initialized. |
| `POSTGRES_DB` | `lessonlab` | Embedded database name; used only when the cluster is first initialized. |
| `POSTGRES_PORT` | `5432` | Loopback port for the embedded database. |
| `REDIS_PORT` | `6379` | Loopback port for the embedded Redis. |
| `DATABASE_URL` | loopback URL built from `POSTGRES_*` | Set to use an external database instead. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Set to use an external Redis instead. |
| `STORAGE_ROOT` | `/data/media` | Uploaded files and rendered media. |

Changing `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_DB` after the first start does not rewrite the existing cluster. Keep the values stable, or remove the volume to start over. All application settings from `.env.example` still apply through `-e` flags or an env file; `.env` is not read from the image automatically.

### Data layout and persistence

Mount one volume at `/data`:

| Path | Contents |
| --- | --- |
| `/data/postgres` | PostgreSQL data directory |
| `/data/postgres-run` | PostgreSQL socket directory |
| `/data/redis` | Redis append-only file |
| `/data/media` | Uploads and generated media (`STORAGE_ROOT`) |

Use a named volume (`-v lessonlab-data:/data`) or a bind mount owned by UID 1001. Deleting the volume destroys all state; the next start behaves like a fresh install.

### Stop, upgrade, and back up

```bash
docker stop lessonlab
docker rm lessonlab

# build or pull the new image, then run the same command with the existing volume

docker start lessonlab   # start an existing container again
```

Migrations run automatically on every start. There is no rollback of schema changes; take a backup first.

Backups of the all-in-one container must be taken with the container stopped:

```bash
docker stop lessonlab
mkdir -p backups
docker run --rm \
  -v lessonlab-data:/data \
  -v "$PWD/backups:/backup" \
  --entrypoint tar lessonlab:all-in-one \
  czf "/backup/allinone-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .
docker start lessonlab
```

If you need per-database dumps, run `pg_dump` inside the running container first and copy `/data/media` separately; do not copy the live PostgreSQL directory.

### Moving from Compose

There is no in-place migration. Create a `pg_dump` from the Compose database, copy the Compose media volume, start the single-container image with a fresh `/data` volume, restore the dump into the embedded database, and place the media under `/data/media`. Roll back by returning to the Compose stack with its original volumes.

### Health and logs

```bash
docker inspect --format '{{.State.Health.Status}}' lessonlab
docker logs -f lessonlab
docker exec lessonlab psql -h /data/postgres-run -U lessonlab -d lessonlab -c 'select 1'
```

The container exits non-zero if the web server, worker, PostgreSQL, or Redis stops unexpectedly, and `docker stop` shuts them down cleanly within the grace period.

### Limitations

- Not horizontally scalable: one container owns one database and one worker.
- No replication, point-in-time recovery, or external database operations.
- PostgreSQL and Redis share the container's CPU and memory with video rendering.
- Backups and upgrades require stopping the container; there is no hot-backup tooling.
- `linux/amd64` only.
- Secrets arrive through environment variables, so they are visible to users who can inspect the container.
- Use the Compose stack for production workloads that need scaling, isolation, or managed backups.

### Publishing the image

The push script builds the `all-in-one` target for `linux/amd64` and publishes `latest`, the short git SHA, and an optional version to `karanaso/openclass`:

```bash
docker login

./scripts/docker-push.sh              # latest + <sha>
./scripts/docker-push.sh 0.2.0        # also :0.2.0
DRY_RUN=1 ./scripts/docker-push.sh    # print the command without building or pushing
DOCKER_IMAGE_REPO=example/app ./scripts/docker-push.sh
```

The script requires Docker with buildx and refuses to push without Docker Hub credentials unless `DRY_RUN=1`. Override the platform with `PLATFORM=linux/arm64` only if you have added support and tested it.

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
