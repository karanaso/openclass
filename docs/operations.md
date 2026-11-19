# Operations

## Backups

Nightly:

```bash
BACKUP_DIR=/srv/backups ./scripts/backup.sh
```

This writes:

- `db-<stamp>.dump` — PostgreSQL custom-format dump
- `media-<stamp>.tar.gz` — the `lessonlab_media` volume

Keep backups off the host.

### Single-container images

The Compose backup scripts assume separate PostgreSQL and media volumes. For the all-in-one image, stop the container before copying `/data` so PostgreSQL is quiesced:

```bash
docker stop lessonlab
docker run --rm \
  -v lessonlab-data:/data \
  -v "$PWD/backups:/backup" \
  --entrypoint tar lessonlab:all-in-one \
  czf "/backup/allinone-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .
docker start lessonlab
```

The archive contains PostgreSQL (`/data/postgres`), Redis (`/data/redis`), and media (`/data/media`). Do not copy the live volume or the running PostgreSQL data directory, and keep the archive off the host.

## Restore

```bash
docker compose stop web worker
./scripts/restore.sh /srv/backups/db-<stamp>.dump /srv/backups/media-<stamp>.tar.gz
```

The script stops the app, restores PostgreSQL with `pg_restore --clean --if-exists`, replaces the media volume, and restarts the app.

## Restore drill

Run quarterly in a clean environment:

1. Create an empty Compose project from the same images.
2. Restore a recent database and media snapshot.
3. Verify `/api/health` returns `ok`.
4. Log in. Check one class, one ready lesson, one student result, and the lesson PDF.
5. Delete the drill environment.

## Logs and jobs

```bash
docker compose logs -f web
docker compose logs -f worker
```

Generation failures appear in `GenerationJob.error` and on the lesson detail page. Retry from the lesson UI. Stalled BullMQ jobs are retried; idempotent stages prevent duplicate artifacts.

## Media and disk

- Originals: `lessons/<id>/<uuid>.pdf`

Deleting a lesson or class removes its prefix. Cancelling a lesson keeps the original PDF so the lesson can be retried.

Monitor the `media` volume and keep enough free space for uploads. Uploads are rejected when they exceed `MAX_UPLOAD_BYTES`.

## Retired video media cleanup

The video pipeline is removed. Its database rows are dropped by the Prisma migration, but old `video`, `audio`, `visual`, and `pages` files can remain on disk. Purge them once after deploying the migration:

```bash
# 1. Stop the web app and worker, then back up the database and media volume.
docker compose stop web worker
BACKUP_DIR=/srv/backups ./scripts/backup.sh

# 2. Preview what would be removed. Dry run is the default.
npm run cleanup-video-artifacts

# 3. Delete the reported prefixes.
npm run cleanup-video-artifacts -- --apply

# 4. Restart the app.
docker compose start web worker
```

The script is idempotent and skips missing prefixes. It never touches the original PDF at `Lesson.storageKey`; it removes only `lessons/<id>/video`, `lessons/<id>/audio`, `lessons/<id>/visual`, and `lessons/<id>/pages`. A failure on one lesson is logged and the run continues; fix the reported permissions or disk problem and re-run.

Verify the purge from the host:

```bash
docker compose exec web sh -c 'find /data/media/lessons -maxdepth 2 -type d \( -name video -o -name audio -o -name visual -o -name pages \)'
```

The command should print nothing. If it prints paths, check the script output for failures and re-run with `--apply`.


## OpenAI spend

- Per-lesson and per-class usage is shown in the teacher UI.
- `GENERATION_MAX_ATTEMPTS` limits retries.
- `OPENAI_TEXT_MODEL` is configurable. `gpt-6-luna` usage is estimated at $0.10 per 1M input tokens and $0.50 per 1M output tokens.
- `OPENAI_REASONING_EFFORT` optionally selects `none`, `low`, `medium`, `high`, `xhigh`, or `max`; unset uses the model default.

## Incident checklist

1. Check `/api/health` and `docker compose ps`.
2. Check web and worker logs.
3. Confirm Postgres and Redis health.
4. Confirm the media volume has free space.
5. If the worker is stuck, restart it: `docker compose restart worker`.
6. If a lesson is stuck, retry it from the UI; the job version increments.
7. Restore from backup only after capturing current logs and a fresh backup when possible.
