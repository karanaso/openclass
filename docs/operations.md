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
4. Log in. Check one class, one ready lesson, one generated video, and one student result.
5. Delete the drill environment.

## Logs and jobs

```bash
docker compose logs -f web
docker compose logs -f worker
```

Generation failures appear in `GenerationJob.error` and on the lesson detail page. Retry from the lesson UI. Stalled BullMQ jobs are retried; idempotent stages prevent duplicate artifacts.

## Media and disk

- Originals: `lessons/<id>/<uuid>.pdf`
- Page images: `lessons/<id>/pages/`
- Audio: `lessons/<id>/audio/<locale>/`
- Video: `lessons/<id>/video/`

Deleting a lesson or class removes its prefix. Cancelling a lesson removes generated media but keeps the original PDF. Render temp files are removed automatically.

Monitor the `media` volume. If free space drops below 512 MB, video rendering is skipped and the rest of the lesson remains available.

## OpenAI spend

- Per-lesson and per-class usage is shown in the teacher UI.
- `GENERATION_MAX_ATTEMPTS` limits retries.
- `OPENAI_TEXT_MODEL`, TTS model, and voices are configurable.
- Extra video locales are rendered on demand.

## Incident checklist

1. Check `/api/health` and `docker compose ps`.
2. Check web and worker logs.
3. Confirm Postgres and Redis health.
4. Confirm the media volume has free space.
5. If the worker is stuck, restart it: `docker compose restart worker`.
6. If a lesson is stuck, retry it from the UI; the job version increments.
7. Restore from backup only after capturing current logs and a fresh backup when possible.
