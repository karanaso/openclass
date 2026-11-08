# Design

## Context

See `proposal.md` for motivation and `specs/container-packaging/spec.md` for the behavior contract.

The current `Dockerfile` has three stages: `deps`, `builder`, and `runtime`, with `web` and `worker` targets that differ only in entrypoint and command. Both targets already include the built Next.js app, Prisma, the worker source, ffmpeg, Poppler, and OpenSSL, and run as the non-root `nextjs` user (UID 1001). `docker-compose.yml` supplies PostgreSQL 16, Redis 7, environment variables, and named volumes; the web entrypoint runs `prisma migrate deploy` before starting.

The application reads configuration through `src/lib/env.ts` (Zod, cached), exposes `GET /api/health` checking env, database, Redis, and writable storage, and stores files under `STORAGE_ROOT` using `lessons/<lessonId>/...` keys. The worker is started with `npm run worker` (`tsx src/worker/index.ts`) and already handles `SIGTERM`.

## Goals / Non-Goals

**Goals:**

- One image and one `docker run` command that brings up the complete stack.
- Reuse the existing build stages, application code, and entrypoints where practical.
- Predictable first-run initialization, ordered startup, and clean shutdown.
- A repeatable, authenticated Docker Hub publishing path.

**Non-Goals:**

- Replacing the Compose stack or changing the web/worker application code.
- Kubernetes manifests, multi-arch builds, or TLS termination in the container.
- Production-grade database operations (replication, point-in-time recovery, external backups) inside the image.
- Shrinking the image below the existing Node + ffmpeg/Poppler footprint.

## Decisions

### 1. Add an `all-in-one` final stage on top of `runtime`

`FROM runtime AS all-in-one` installs PostgreSQL 16 and Redis, adds `tini`, copies the supervision script and env validator, creates `/data` subdirectories, and sets the entrypoint. This keeps the web and worker targets byte-identical and avoids duplicating the build logic. Compose continues to build `target: web` and `target: worker`; the new mode is opt-in.

Alternative considered: a separate `Dockerfile.single`. Rejected because it duplicates the dependency and build stages and drifts over time; the user also chose an added target.

### 2. Serve PostgreSQL 16 from the PGDG apt repository

Debian bookworm ships PostgreSQL 15, while the project documents and tests PostgreSQL 16. Add the PGDG repository and install `postgresql-16` (binaries in `/usr/lib/postgresql/16/bin`). Redis comes from Debian's `redis-server` (7.x). Both bind to `127.0.0.1` inside the container; only port 3000 is exposed.

Alternative considered: PostgreSQL 15 from Debian main. Rejected to keep one database version across Compose and single-container modes. Alternative considered: copying binaries from `postgres:16`/`redis:7` images. Rejected as more fragile than distro packages and harder to keep patched.

### 3. Use `tini` plus a Bash orchestration script instead of a full supervisor

`tini` runs as PID 1 to reap children and forward signals. `docker/all-in-one-entrypoint.sh` (Bash, because it needs `wait -n`) performs ordered startup and coordinated shutdown:

1. Validate directory layout and create `/data/{postgres,redis,media}` as needed.
2. Apply defaults: `DATABASE_URL=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:5432/$POSTGRES_DB?schema=public`, `REDIS_URL=redis://127.0.0.1:6379`, `STORAGE_ROOT=/data/media`; explicit values win.
3. Validate application configuration before starting anything by invoking the existing Zod schema: `npx tsx -e "import('./src/lib/env.ts').then(m => m.parseEnv())"`. Fails fast with the schema's message.
4. If `/data/postgres/PG_VERSION` is missing, run `initdb` with `--username="$POSTGRES_USER"`, a password file, and `--auth-host=scram-sha-256`.
5. Start PostgreSQL with `pg_ctl` (data dir `/data/postgres`, socket dir `/data/postgres-run`, `listen_addresses=127.0.0.1`), and create `POSTGRES_DB` if absent.
6. Start Redis with `--dir /data/redis --appendonly yes --bind 127.0.0.1 --protected-mode no`, then wait for `redis-cli ping`.
7. Wait for `pg_isready`, then run `npx prisma migrate deploy`.
8. Start `npm run start` and `npm run worker` in the background, record PIDs, and wait with `wait -n`.
9. On `SIGTERM`/`SIGINT` or if any child exits: send TERM to web and worker, `pg_ctl stop -m fast`, `redis-cli shutdown`, wait for children, exit non-zero if a process failed unexpectedly.

Alternatives considered: `supervisord` (adds Python and config but no better ordering semantics; restart loops can mask failed migrations) and `s6-overlay` (external download, more moving parts). A Bash script with `tini` is small and keeps failure propagation explicit.

### 4. Keep all state under `/data`

Layout:

| Path | Contents |
| --- | --- |
| `/data/postgres` | PostgreSQL data directory |
| `/data/postgres-run` | PostgreSQL Unix socket directory |
| `/data/redis` | Redis append-only file |
| `/data/media` | Application storage (`STORAGE_ROOT`) |

One volume (`-v lessonlab-data:/data`) persists everything, and `STORAGE_ROOT` moves from `/data` to `/data/media` so application keys never collide with database files. The seed/migration lifecycle is unchanged: migrations run on every start, no seed is run automatically.

### 5. Embedded database credentials and overrides

`POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` default to `lessonlab` for parity with Compose. `initdb` uses these on first run; changing them later does not rewrite an existing cluster, which matches normal PostgreSQL behavior and is documented. The container defaults `DATABASE_URL` and `REDIS_URL` to loopback, so an operator only supplies application secrets; explicit `DATABASE_URL`/`REDIS_URL` still allow pointing at external services if desired.

### 6. Container health check

The image defines `HEALTHCHECK` equivalent to the Compose check: `node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`, with a start period long enough for first-run `initdb` and migrations (~60s). Docker then reports unhealthy if the app, database, Redis, or storage is broken.

### 7. Publish with a buildx script

`scripts/docker-push.sh` is a Bash script with:

- Defaults: `DOCKER_IMAGE_REPO=karanaso/openclass`, `PLATFORM=linux/amd64`, target `all-in-one`.
- Tags: `latest`, short git SHA (`git rev-parse --short HEAD`), and an optional version passed as `$1` or `DOCKER_IMAGE_VERSION`.
- Preflight: verify Docker and buildx exist, verify the working tree is the repo root, and check Docker Hub authentication (`docker info --format '{{.Username}}'` is non-empty) unless `DRY_RUN=1`.
- Execute `docker buildx build --platform linux/amd64 --target all-in-one -t ... --push .`; in dry-run mode, print the resolved tags and exact command without building or pushing.
- Validate the version tag against Docker tag rules before use.

Alternatives considered: a Makefile target (less discoverable, no auth check) and GitHub Actions (out of scope; the user asked for a script).

### 8. Documentation placement

README gets a short "Single container" section with build/run commands and a link to the detailed section in `docs/deployment.md`, which covers configuration, persistence, upgrades, health, limitations, and publishing. `docs/operations.md` gets a note that backups of the all-in-one volume must stop the container first.

## Risks / Trade-offs

- **PGDG repository availability or signing changes** → Pin the PostgreSQL major version, install the signing key, and fail the build if `postgresql-16` is unavailable rather than silently falling back to another version.
- **`initdb` permissions with the non-root user** → Create and `chown` `/data/postgres` in the image and again in the entrypoint before initialization; run everything as UID 1001, which PostgreSQL requires.
- **Long first start** → Document a 60-second start period and increase the `HEALTHCHECK --start-period`; first-run initialization is a one-time cost.
- **Data loss on abrupt stop or `docker rm -v`** → Document volume behavior, use fast shutdown, and state that deleting the volume destroys all state.
- **Image size** → PostgreSQL, Redis, ffmpeg, Poppler, and full `node_modules` make the image large. Accepted for the single-container use case; Compose remains the leaner production path.
- **Embedded services share the container's CPU/memory** → Document minimum resources and that video rendering can starve the web process; no hard limits are imposed inside the container.
- **Secrets in environment variables** → Same model as Compose; image never bakes `.env`, and docs warn against `docker inspect` leakage on shared hosts.
- **Pushing without authentication or to the wrong repo** → Preflight auth check and `DOCKER_IMAGE_REPO` override; dry-run mode for inspection.

## Migration Plan

1. Land the new Dockerfile target, entrypoint, validator, push script, and docs. No application or schema changes.
2. Existing Compose users are unaffected: `web` and `worker` targets and `docker-compose.yml` stay as-is.
3. To adopt single-container mode, build the new target and run it with a fresh named volume; there is no in-place migration from a Compose stack. Moving existing data requires a `pg_dump`/restore and copying the media volume, which is documented but not automated.
4. Rollback is removing the new stage/scripts and continuing to use Compose; no data written by the single-container mode is read by Compose unless explicitly migrated.

## Open Questions

None — the remaining choices (process supervisor flavor, data directory layout) are implementation details that do not change the specs or task breakdown.
