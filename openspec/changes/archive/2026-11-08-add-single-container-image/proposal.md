# Proposal

## Why

Running LessonLab currently requires Docker Compose to orchestrate four services (web, worker, PostgreSQL, Redis) plus shared volumes. That is appropriate for production but makes demos, single-host evaluations, and hand-off environments unnecessarily heavy: users need Compose-specific knowledge, multiple exposed ports, and a working `docker compose` setup before they can try the app. A single self-contained image that runs the whole stack removes that friction.

## What Changes

- Add an `all-in-one` final target to the existing multi-stage `Dockerfile` that produces one image containing:
  - the Next.js web server,
  - the BullMQ worker,
  - PostgreSQL 16,
  - Redis 7,
  - a process supervisor that starts, orders, and stops all four.
- Add supervised startup: initialize the PostgreSQL data directory on first run, start PostgreSQL and Redis locally, run Prisma migrations, then start the web server and worker; terminate all processes together and surface failures through the container exit code.
- Keep state on a single persistent volume (`/data`) covering PostgreSQL data, Redis persistence, uploads, and rendered media so the container survives restarts.
- Support the same runtime configuration as the Compose stack through environment variables, with single-container defaults (`DATABASE_URL` and `REDIS_URL` pointing at `127.0.0.1`) that can still be overridden.
- Add a Docker Hub push script (`scripts/docker-push.sh`) that builds the `all-in-one` target for `linux/amd64`, tags the image (`latest`, git SHA, optional version), and pushes to `karanaso/openclass`, with safe defaults and a dry-run path.
- Update `README.md` and `docs/deployment.md` with single-container build, run, configuration, persistence, upgrade, and push instructions.
- Keep the existing multi-target `Dockerfile` stages and `docker-compose.yml` stack unchanged as the recommended production deployment.

## Capabilities

### New Capabilities

- `container-packaging`: Defines the self-contained single-container image: what it runs, startup ordering and health, configuration and data persistence, shutdown behavior, and how an image is published to a registry.

### Modified Capabilities

None — no existing spec's requirements change; the existing Compose deployment remains as described and the new mode is additive.

## Impact

- **Build**: `Dockerfile` gains an `all-in-one` target; the image installs PostgreSQL 16 and Redis from Debian packages (or equivalent) alongside the existing Node 22, ffmpeg, Poppler, and OpenSSL dependencies.
- **New runtime files**: process supervisor configuration and an all-in-one entrypoint under `docker/` (for example `docker/all-in-one-entrypoint.sh` and a `docker/supervisord.conf`).
- **New tooling**: `scripts/docker-push.sh` using `docker buildx build --platform linux/amd64 --push`.
- **Configuration**: new optional variables for the embedded database (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) and single-container overrides for `DATABASE_URL`, `REDIS_URL`, `STORAGE_ROOT`, and `APP_BASE_URL`.
- **Data**: PostgreSQL data, Redis append-only data, uploads, and media all live under `/data`; losing the volume loses all state.
- **Docs**: `README.md`, `docs/deployment.md`, and possibly `docs/operations.md` gain a single-container section.
- **Operations trade-offs**: the all-in-one image is intended for demos, evaluation, and small single-node use. It does not scale horizontally, runs database and cache without external backups or replication, and is not a replacement for the Compose production topology.
- **Out of scope**: Kubernetes manifests, multi-arch images, TLS termination inside the container, external managed database migration, and changes to the existing web or worker application code.
