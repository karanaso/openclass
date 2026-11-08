#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

IMAGE_REPO="${DOCKER_IMAGE_REPO:-karanaso/openclass}"
PLATFORM="${PLATFORM:-linux/amd64}"
TARGET="${TARGET:-all-in-one}"
VERSION="${1:-${DOCKER_IMAGE_VERSION:-}}"
DRY_RUN="${DRY_RUN:-0}"

log() { printf '[docker-push] %s\n' "$*"; }
fail() { printf '[docker-push] ERROR: %s\n' "$*" >&2; exit 1; }

[ -f Dockerfile ] || fail "Dockerfile not found; run this script from the repository"
command -v docker >/dev/null 2>&1 || fail "docker is required"

if [ -n "$VERSION" ]; then
  if ! [[ "$VERSION" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
    fail "invalid image tag '$VERSION': use letters, digits, '_', '.', or '-', starting with a letter, digit, or '_'"
  fi
fi

if ! docker buildx version >/dev/null 2>&1; then
  fail "docker buildx is required; install the buildx plugin and try again"
fi

COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || true)"
[ -n "$COMMIT_SHA" ] || fail "could not read the git commit; run this script inside the repository"

if [ -n "$(git status --porcelain 2>/dev/null || true)" ]; then
  log "warning: the working tree has uncommitted changes; tag ${COMMIT_SHA} does not identify the built contents"
fi

TAGS=("${IMAGE_REPO}:latest" "${IMAGE_REPO}:${COMMIT_SHA}")
if [ -n "$VERSION" ] && [ "$VERSION" != "latest" ] && [ "$VERSION" != "$COMMIT_SHA" ]; then
  TAGS+=("${IMAGE_REPO}:${VERSION}")
fi

auth_configured() {
  local config_dir="${DOCKER_CONFIG:-$HOME/.docker}"
  local config="${config_dir}/config.json"
  [ -f "$config" ] || return 1
  node -e '
    const fs = require("fs");
    const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const auths = Object.keys(config.auths || {});
    if (auths.some((key) => key.includes("docker.io") || key.includes("index.docker.io"))) {
      process.exit(0);
    }
    if (config.credsStore || Object.keys(config.credHelpers || {}).length > 0) {
      process.exit(0);
    }
    process.exit(1);
  ' "$config"
}

BUILD_ARGS=(docker buildx build --platform "$PLATFORM" --target "$TARGET")
for tag in "${TAGS[@]}"; do
  BUILD_ARGS+=(-t "$tag")
done
BUILD_ARGS+=(--push .)

log "repository: ${IMAGE_REPO}"
log "platform: ${PLATFORM}"
log "target: ${TARGET}"
log "tags:"
for tag in "${TAGS[@]}"; do
  log "  - ${tag}"
done

if [ "$DRY_RUN" = "1" ]; then
  log "dry run: no build or push performed"
  printf '[docker-push] would run:'
  printf ' %q' "${BUILD_ARGS[@]}"
  printf '\n'
  exit 0
fi

if ! auth_configured; then
  fail "no Docker Hub credentials found; run 'docker login' first (set DOCKER_CONFIG to use a different config directory)"
fi

log "building and pushing"
"${BUILD_ARGS[@]}"

log "pushed ${TAGS[*]}"
