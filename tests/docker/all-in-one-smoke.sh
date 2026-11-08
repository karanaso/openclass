#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

IMAGE="${IMAGE:-lessonlab:all-in-one}"
NAME="${NAME:-lessonlab-aio-smoke}"
VOLUME="${VOLUME:-lessonlab-aio-smoke-data}"
PORT="${PORT:-3020}"
AUTH_SECRET="${AUTH_SECRET:-smoke-test-secret-with-at-least-32-chars}"
TEACHER_PASSWORD="${TEACHER_PASSWORD:-smoke-teacher-password}"
POSTGRES_USER="${POSTGRES_USER:-lessonlab}"
POSTGRES_DB="${POSTGRES_DB:-lessonlab}"

pass() { printf '[smoke] PASS %s\n' "$*"; }
fail() { printf '[smoke] FAIL %s\n' "$*" >&2; exit 1; }

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_healthy() {
  local attempt status running
  for attempt in $(seq 1 120); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$NAME" 2>/dev/null || echo missing)"
    if [ "$status" = "healthy" ]; then
      return 0
    fi
    running="$(docker inspect --format '{{.State.Running}}' "$NAME" 2>/dev/null || echo false)"
    if [ "$running" != "true" ]; then
      docker logs "$NAME" >&2 || true
      return 1
    fi
    sleep 2
  done
  docker logs "$NAME" >&2 || true
  return 1
}

command -v docker >/dev/null 2>&1 || fail "docker is required"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1 || [ "${BUILD:-0}" = "1" ]; then
  printf '[smoke] building %s\n' "$IMAGE"
  docker build --target all-in-one -t "$IMAGE" .
fi

cleanup
docker volume create "$VOLUME" >/dev/null

printf '[smoke] checking missing-secret failure\n'
set +e
output="$(docker run --rm \
  -e AI_PROVIDER=mock \
  -e TTS_PROVIDER=mock \
  -e TEACHER_PASSWORD="$TEACHER_PASSWORD" \
  -v "$VOLUME:/data" \
  "$IMAGE" 2>&1)"
status=$?
set -e
[ "$status" -ne 0 ] || fail "container started without AUTH_SECRET"
printf '%s\n' "$output" | grep -q "AUTH_SECRET" || fail "missing-secret error did not name AUTH_SECRET"
docker run --rm -v "$VOLUME:/data" --entrypoint sh "$IMAGE" \
  -c 'test ! -f /data/postgres/PG_VERSION' || fail "PostgreSQL was initialized before configuration validation"
pass "missing secret fails before PostgreSQL starts"

printf '[smoke] checking fresh start and health\n'
docker run -d --name "$NAME" \
  -p "${PORT}:3000" \
  -e AUTH_SECRET="$AUTH_SECRET" \
  -e TEACHER_PASSWORD="$TEACHER_PASSWORD" \
  -e AI_PROVIDER=mock \
  -e TTS_PROVIDER=mock \
  -e APP_BASE_URL="http://localhost:${PORT}" \
  -v "$VOLUME:/data" \
  "$IMAGE" >/dev/null
wait_healthy || fail "container did not become healthy on a fresh volume"
body="$(curl -fsS "http://127.0.0.1:${PORT}/api/health")"
printf '%s' "$body" | grep -q '"status":"ok"' || fail "health check was not ok: $body"
pass "fresh start becomes healthy"

printf '[smoke] checking persistence across restart\n'
docker exec "$NAME" psql -h /data/postgres-run -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q \
  -c "create table if not exists smoke_marker (id int primary key, note text);" \
  -c "insert into smoke_marker values (1, 'survived') on conflict (id) do update set note = excluded.note;"
docker exec "$NAME" sh -c 'printf survived > /data/media/smoke-marker.txt'
docker restart "$NAME" >/dev/null
wait_healthy || fail "container did not become healthy after restart"
note="$(docker exec "$NAME" psql -h /data/postgres-run -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select note from smoke_marker where id=1")"
[ "$note" = "survived" ] || fail "database marker did not survive restart"
file_note="$(docker exec "$NAME" cat /data/media/smoke-marker.txt)"
[ "$file_note" = "survived" ] || fail "media marker did not survive restart"
pass "state persists across restart"

printf '[smoke] all checks passed\n'
