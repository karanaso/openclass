# Tasks

## 1. Image build target

- [x] 1.1 Add an `all-in-one` final stage to `Dockerfile` based on `runtime` that installs PostgreSQL 16 from the PGDG apt repository, Redis, and `tini`, and verify with `docker build --target all-in-one -t lessonlab:all-in-one .` followed by `docker run --rm lessonlab:all-in-one psql --version` reporting version 16.
- [x] 1.2 Create `/data/postgres`, `/data/postgres-run`, `/data/redis`, and `/data/media` with `nextjs` ownership in the image, and verify their ownership by running `docker run --rm --entrypoint sh lessonlab:all-in-one -c 'ls -ld /data/*'`.
- [x] 1.3 Add a `HEALTHCHECK` that calls `/api/health` with a start period covering first-run initialization, and verify `docker inspect --format '{{json .Config.Healthcheck}}' lessonlab:all-in-one` shows the check and start period.
- [x] 1.4 Confirm the existing `web` and `worker` targets and `docker-compose.yml` still build, verifying with `docker build --target web .` and `docker build --target worker .` (or `docker compose config` plus a build of both targets).

## 2. Runtime orchestration

- [x] 2.1 Add `docker/all-in-one-entrypoint.sh` with defaults for `DATABASE_URL`, `REDIS_URL`, and `STORAGE_ROOT`, letting explicit environment values win, and verify the resolved values are visible in the startup log or by probing the running container's health check.
- [x] 2.2 Validate required application configuration before starting services by invoking the existing Zod schema (for example via `tsx`), and verify that a run without `AUTH_SECRET` exits non-zero with a message naming the missing variable and without starting PostgreSQL.
- [x] 2.3 Implement first-run PostgreSQL initialization with `initdb` using `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`, and verify with a fresh volume that the database and role exist and `prisma migrate deploy` creates the schema.
- [x] 2.4 Implement startup ordering: start PostgreSQL on loopback, start Redis with append-only persistence, wait for both, run migrations, then launch `npm run start` and `npm run worker`; verify from the container logs that the order holds and `curl -fsS http://127.0.0.1:3000/api/health` returns `{"status":"ok"}` inside the container.
- [x] 2.5 Implement coordinated shutdown and failure propagation with `tini`: forward `SIGTERM`/`SIGINT`, stop worker and web, run `pg_ctl stop -m fast`, stop Redis, and exit non-zero when a core process dies; verify `docker stop` completes cleanly within the grace period and that killing the worker with `docker exec ... pkill -f src/worker` makes the container exit non-zero.
- [x] 2.6 Verify persistence across restarts: insert a marker row or upload a file, `docker restart` the container using the same named volume, and confirm the row/file survives and `/data` subdirectories are reused rather than reinitialized.
- [x] 2.7 Verify overrides: run with custom `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` on a fresh volume and confirm the health check passes, and run with an explicit external `DATABASE_URL` or `REDIS_URL` to confirm it takes precedence over the loopback default.
- [x] 2.8 Add an entrypoint test or script under `tests/` (or a documented smoke script) covering fresh start, healthy response, restart persistence, and missing-secret failure, and verify it passes with `bash tests/docker/all-in-one-smoke.sh`.

## 3. Docker Hub publishing

- [x] 3.1 Add `scripts/docker-push.sh` with defaults `DOCKER_IMAGE_REPO=karanaso/openclass`, `PLATFORM=linux/amd64`, and target `all-in-one`, building with `docker buildx build --platform linux/amd64 --target all-in-one`, and verify `DRY_RUN=1 scripts/docker-push.sh` prints the exact build command with `latest` and the short git SHA tags without pushing.
- [x] 3.2 Add an optional version tag accepted as `$1` or `DOCKER_IMAGE_VERSION`, validate it against Docker tag rules, and verify both `DRY_RUN=1 scripts/docker-push.sh 0.2.0` shows the version tag and an invalid value such as `bad tag!` exits non-zero.
- [x] 3.3 Add a preflight that checks Docker/buildx availability and Docker Hub authentication, and verify it exits with a clear error when run without a login while `DRY_RUN=1` still works.
- [x] 3.4 Support `DOCKER_IMAGE_REPO` overrides and verify `DRY_RUN=1 DOCKER_IMAGE_REPO=example/app scripts/docker-push.sh` targets `example/app`.
- [x] 3.5 Perform one authenticated push and verify the tags exist on Docker Hub with `docker buildx imagetools inspect karanaso/openclass:latest` reporting `linux/amd64`.

## 4. Documentation and configuration examples

- [x] 4.1 Add a "Single container" section to `README.md` with build, `docker run`, required environment variables, volume, and health commands, and verify the commands run as written against a built image.
- [x] 4.2 Expand `docs/deployment.md` with single-container configuration, data layout, upgrade/backup behavior, health, limitations versus Compose, and the publishing workflow, and verify every command and variable name matches the implementation.
- [x] 4.3 Update `docs/operations.md` to state that the all-in-one container must be stopped (or the database quiesced) before backing up its volume, and verify the backup section references the correct volume path.
- [x] 4.4 Add the embedded `POSTGRES_*` variables and any single-container overrides to `.env.example` with comments distinguishing Compose from single-container use, and verify no secret values are committed.

## 5. Integration verification

- [x] 5.1 Run the all-in-one image with a fresh named volume and mock AI/TTS providers, complete a lesson upload through the web UI or API, and verify the worker processes it and `/api/health` stays `ok`.
- [x] 5.2 Run the existing browser smoke or end-to-end flow against the single-container instance on port 3000 and verify the teacher login and a student share link work.
- [x] 5.3 Verify `docker stop` followed by `docker start` on the same volume recovers automatically, with no manual database steps and a healthy endpoint within the documented start period.

## Workflow follow-up

- Archive the change after review and verification.
- Confirm the main `container-packaging` spec is created on archive.
