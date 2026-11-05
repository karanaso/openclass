#!/bin/sh
set -eu

if [ $# -lt 2 ]; then
  echo "Usage: scripts/restore.sh <db-dump> <media-archive>"
  exit 1
fi

DB_DUMP=$1
MEDIA_ARCHIVE=$2
POSTGRES_USER=${POSTGRES_USER:-lessonlab}
POSTGRES_DB=${POSTGRES_DB:-lessonlab}

echo "Stopping application services"
docker compose stop web worker

echo "Restoring PostgreSQL from $DB_DUMP"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$DB_DUMP"

echo "Restoring media from $MEDIA_ARCHIVE"
docker run --rm \
  -v lessonlab_media:/data \
  -v "$(cd "$(dirname "$MEDIA_ARCHIVE")" && pwd)":/backup:ro \
  alpine:3.20 \
  sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$MEDIA_ARCHIVE") -C /data"

echo "Starting application services"
docker compose start web worker

echo "Restore complete"
