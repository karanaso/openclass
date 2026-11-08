#!/usr/bin/env bash
set -Eeuo pipefail

cd /app

log() { printf '[all-in-one] %s\n' "$*"; }
fail() { printf '[all-in-one] ERROR: %s\n' "$*" >&2; exit 1; }

export NODE_ENV="${NODE_ENV:-production}"

POSTGRES_USER="${POSTGRES_USER:-lessonlab}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-lessonlab}"
POSTGRES_DB="${POSTGRES_DB:-lessonlab}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"

PGDATA=/data/postgres
PGSOCKET=/data/postgres-run
REDIS_DIR=/data/redis

valid_identifier() {
  [[ "$1" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]
}

valid_identifier "$POSTGRES_USER" || fail "POSTGRES_USER must be a plain PostgreSQL identifier (letters, digits, underscore; not starting with a digit)"
valid_identifier "$POSTGRES_DB" || fail "POSTGRES_DB must be a plain PostgreSQL identifier (letters, digits, underscore; not starting with a digit)"
[ -n "$POSTGRES_PASSWORD" ] || fail "POSTGRES_PASSWORD must not be empty"
[[ "$POSTGRES_PASSWORD" != *$'\n'* ]] || fail "POSTGRES_PASSWORD must not contain a newline"

urlencode() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1] ?? ""))' "$1"
}

if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL_DEFAULTED=0
else
  DATABASE_URL_DEFAULTED=1
  export DATABASE_URL="postgresql://$(urlencode "$POSTGRES_USER"):$(urlencode "$POSTGRES_PASSWORD")@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
fi

export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:${REDIS_PORT}}"
export STORAGE_ROOT="${STORAGE_ROOT:-/data/media}"

log "starting LessonLab all-in-one container"
if [ "$DATABASE_URL_DEFAULTED" -eq 1 ]; then
  log "database: postgresql://${POSTGRES_USER}:***@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"
else
  log "database: using DATABASE_URL from the environment"
fi
log "redis: ${REDIS_URL}"
log "storage: ${STORAGE_ROOT}"

mkdir -p "$PGDATA" "$PGSOCKET" "$REDIS_DIR" "$STORAGE_ROOT" \
  || fail "could not create data directories under /data; the volume must be writable by the nextjs user"

log "validating application configuration"
if ! ./node_modules/.bin/tsx docker/validate-env.ts; then
  fail "invalid application configuration; no services were started"
fi

WEB_PID=""
WORKER_PID=""
REDIS_PID=""
SHUTTING_DOWN=0
USE_PROCESS_GROUPS=0

app_alive() {
  if [ "$USE_PROCESS_GROUPS" -eq 1 ]; then
    kill -0 -- "-$1" 2>/dev/null
  else
    kill -0 "$1" 2>/dev/null
  fi
}

app_signal() {
  local signal=$1
  local pid=$2
  if [ "$USE_PROCESS_GROUPS" -eq 1 ]; then
    kill -"$signal" -- "-$pid" 2>/dev/null || true
  else
    kill -"$signal" "$pid" 2>/dev/null || true
  fi
}

stop_apps() {
  local pids=()
  [ -n "$WEB_PID" ] && pids+=("$WEB_PID")
  [ -n "$WORKER_PID" ] && pids+=("$WORKER_PID")
  [ "${#pids[@]}" -eq 0 ] && return 0

  log "stopping web server and worker"
  local pid
  for pid in "${pids[@]}"; do
    app_signal TERM "$pid"
  done
  local attempt
  for attempt in $(seq 1 50); do
    local alive=0
    for pid in "${pids[@]}"; do
      if app_alive "$pid"; then
        alive=1
      fi
    done
    [ "$alive" -eq 0 ] && break
    sleep 0.2
  done
  for pid in "${pids[@]}"; do
    if app_alive "$pid"; then
      app_signal KILL "$pid"
    fi
  done
  wait "${pids[@]}" 2>/dev/null || true
}

stop_postgres() {
  if [ -s "$PGDATA/PG_VERSION" ] && pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    log "stopping PostgreSQL"
    pg_ctl -D "$PGDATA" stop -m fast -w -t 30 >/dev/null 2>&1 || true
  fi
}

stop_redis() {
  if [ -n "$REDIS_PID" ] && kill -0 "$REDIS_PID" 2>/dev/null; then
    log "stopping Redis"
    redis-cli -h 127.0.0.1 -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1 || kill -TERM "$REDIS_PID" 2>/dev/null || true
    wait "$REDIS_PID" 2>/dev/null || true
  fi
}

cleanup() {
  local code=$?
  trap - EXIT TERM INT
  if [ "$SHUTTING_DOWN" -eq 0 ]; then
    SHUTTING_DOWN=1
    stop_apps
    stop_postgres
    stop_redis
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 0' TERM INT

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  if [ -n "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
    fail "$PGDATA is not empty but has no PG_VERSION; refusing to initialize over existing data"
  fi
  log "initializing PostgreSQL data directory"
  password_file="$(mktemp)"
  umask 077
  printf '%s\n' "$POSTGRES_PASSWORD" > "$password_file"
  if ! initdb -D "$PGDATA" \
    --username="$POSTGRES_USER" \
    --pwfile="$password_file" \
    --auth-local=trust \
    --auth-host=scram-sha-256 \
    --encoding=UTF8 \
    --locale=C.UTF-8 \
    --no-instructions >/dev/null; then
    rm -f "$password_file"
    fail "PostgreSQL initialization failed"
  fi
  rm -f "$password_file"
else
  log "reusing existing PostgreSQL data directory"
fi

log "starting PostgreSQL on 127.0.0.1:${POSTGRES_PORT}"
mkdir -p "$PGSOCKET"
if ! pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" \
  -o "-c listen_addresses=127.0.0.1 -p ${POSTGRES_PORT} -k ${PGSOCKET}" \
  -w start >/dev/null; then
  tail -n 50 "$PGDATA/postgres.log" >&2 || true
  fail "PostgreSQL failed to start"
fi

if ! pg_isready -h 127.0.0.1 -p "$POSTGRES_PORT" -q; then
  tail -n 50 "$PGDATA/postgres.log" >&2 || true
  fail "PostgreSQL is not accepting connections"
fi

if ! psql -h "$PGSOCKET" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
  -tAc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" | grep -q 1; then
  log "creating database ${POSTGRES_DB}"
  if ! createdb -h "$PGSOCKET" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$POSTGRES_DB"; then
    fail "could not create database ${POSTGRES_DB}"
  fi
fi

log "starting Redis on 127.0.0.1:${REDIS_PORT}"
redis-server \
  --daemonize no \
  --bind 127.0.0.1 \
  --port "$REDIS_PORT" \
  --dir "$REDIS_DIR" \
  --appendonly yes \
  --appendfilename appendonly.aof \
  --save "" \
  --protected-mode no \
  > "$REDIS_DIR/redis.log" 2>&1 &
REDIS_PID=$!

redis_ready=0
for attempt in $(seq 1 60); do
  if ! kill -0 "$REDIS_PID" 2>/dev/null; then
    tail -n 50 "$REDIS_DIR/redis.log" >&2 || true
    fail "Redis exited during startup"
  fi
  if [ "$(redis-cli -h 127.0.0.1 -p "$REDIS_PORT" ping 2>/dev/null || true)" = "PONG" ]; then
    redis_ready=1
    break
  fi
  sleep 1
done
if [ "$redis_ready" -ne 1 ]; then
  tail -n 50 "$REDIS_DIR/redis.log" >&2 || true
  fail "Redis did not become ready"
fi

log "applying database migrations"
if ! ./node_modules/.bin/prisma migrate deploy; then
  fail "database migrations failed; web server and worker were not started"
fi

log "starting web server and worker"
if command -v setsid >/dev/null 2>&1; then
  setsid npm run start &
  WEB_PID=$!
  setsid npm run worker &
  WORKER_PID=$!
  USE_PROCESS_GROUPS=1
else
  npm run start &
  WEB_PID=$!
  npm run worker &
  WORKER_PID=$!
  USE_PROCESS_GROUPS=0
fi

log "all services started"
while true; do
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    log "web server exited unexpectedly"
    exit 1
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    log "worker exited unexpectedly"
    exit 1
  fi
  if ! kill -0 "$REDIS_PID" 2>/dev/null; then
    log "Redis exited unexpectedly"
    exit 1
  fi
  if ! pg_isready -h 127.0.0.1 -p "$POSTGRES_PORT" -q; then
    log "PostgreSQL stopped accepting connections"
    exit 1
  fi
  sleep 2
done
