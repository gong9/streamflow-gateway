#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/web-demo"
TARGET="${TARGET:-x86_64-unknown-linux-musl}"
IMAGE_TAG="${IMAGE_TAG:-streamflow-gateway:amd64-deploy}"
IMAGE_TAR="${IMAGE_TAR:-$ROOT_DIR/dist/streamflow-gateway-amd64.tar.gz}"
BIN_OUT="$ROOT_DIR/.build/amd64/streamflow-gateway"

cd "$ROOT_DIR"

if ! command -v cargo-zigbuild >/dev/null 2>&1; then
  echo "cargo-zigbuild is required. Install it with: cargo install cargo-zigbuild" >&2
  exit 1
fi

if ! command -v zig >/dev/null 2>&1; then
  echo "zig is required. Install it with: brew install zig" >&2
  exit 1
fi

echo "==> Building web demo"
if [ -f "$APP_DIR/package-lock.json" ]; then
  npm --prefix "$APP_DIR" ci
else
  npm --prefix "$APP_DIR" install
fi
npm --prefix "$APP_DIR" run build

echo "==> Building Rust gateway for $TARGET"
rustup target add "$TARGET"
cargo zigbuild --release -p streamflow-gateway --target "$TARGET"

mkdir -p "$(dirname "$BIN_OUT")"
cp "$ROOT_DIR/target/$TARGET/release/streamflow-gateway" "$BIN_OUT"
chmod +x "$BIN_OUT"

echo "==> Packaging linux/amd64 image: $IMAGE_TAG"
docker buildx build \
  --platform linux/amd64 \
  -f Dockerfile.prebuilt \
  -t "$IMAGE_TAG" \
  --load \
  .

echo "==> Saving image archive: $IMAGE_TAR"
mkdir -p "$(dirname "$IMAGE_TAR")"
docker save "$IMAGE_TAG" | gzip > "$IMAGE_TAR"
ls -lh "$IMAGE_TAR"

echo "Built $IMAGE_TAG"
