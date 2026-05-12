#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-root@example.com}"
REMOTE_DIR="${REMOTE_DIR:-/opt/streamflow-gateway}"
IMAGE_TAR="${IMAGE_TAR:-$ROOT_DIR/dist/streamflow-gateway-amd64.tar.gz}"
IMAGE_TAG="${IMAGE_TAG:-streamflow-gateway:amd64-deploy}"
RUNTIME_TAG="${RUNTIME_TAG:-streamflow-gateway:local}"
HEALTH_URL="${HEALTH_URL:-http://example.com/health}"

if [ ! -f "$IMAGE_TAR" ]; then
  echo "Image archive not found: $IMAGE_TAR" >&2
  echo "Run scripts/build-amd64-local.sh first." >&2
  exit 1
fi

echo "==> Uploading image archive to $REMOTE_HOST:$REMOTE_DIR"
scp "$IMAGE_TAR" "$REMOTE_HOST:$REMOTE_DIR/streamflow-gateway-amd64.tar.gz"

echo "==> Loading image and restarting gateway"
ssh "$REMOTE_HOST" "cd '$REMOTE_DIR' && \
  gunzip -c streamflow-gateway-amd64.tar.gz | docker load && \
  docker tag '$IMAGE_TAG' '$RUNTIME_TAG' && \
  docker compose -f docker-compose.prod.yml --env-file .env up -d --no-build --force-recreate gateway && \
  docker image prune -f"

echo "==> Health check: $HEALTH_URL"
curl -f "$HEALTH_URL"
echo
