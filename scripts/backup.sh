#!/bin/sh
set -eu

STAMP=${1:-$(date +%Y%m%d-%H%M%S)}
BACKUP_DIR=${BACKUP_DIR:-./backups}
POSTGRES_USER=${POSTGRES_USER:-lessonlab}
POSTGRES_DB=${POSTGRES_DB:-lessonlab}

mkdir -p "$BACKUP_DIR"

echo "Backing up PostgreSQL to $BACKUP_DIR/db-$STAMP.dump"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$BACKUP_DIR/db-$STAMP.dump"

echo "Backing up media volume to $BACKUP_DIR/media-$STAMP.tar.gz"
docker run --rm \
  -v lessonlab_media:/data:ro \
  -v "$(cd "$BACKUP_DIR" && pwd)":/backup \
  alpine:3.20 \
  tar czf "/backup/media-$STAMP.tar.gz" -C /data .

echo "Backup complete: $BACKUP_DIR/db-$STAMP.dump and $BACKUP_DIR/media-$STAMP.tar.gz"
