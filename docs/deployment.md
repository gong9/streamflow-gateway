# Deployment

This project uses the verified **prebuilt amd64 image** path for production deployment.

The server should only load and run the image. It should not compile Rust, Node, or FFmpeg.

## Recommended Flow

```text
Mac/local machine
  -> build React demo
  -> cross-compile Linux amd64 gateway binary with cargo-zigbuild
  -> package Docker image with Dockerfile.prebuilt
  -> save image as dist/streamflow-gateway-amd64.tar.gz
  -> upload image archive to server

Server
  -> docker load
  -> tag as streamflow-gateway:local
  -> docker compose up -d --no-build
```

This avoids the slow path where Docker buildx compiles Rust under amd64 emulation on Apple Silicon.

## Local Requirements

Install the cross-compile tools once:

```bash
brew install zig
cargo install cargo-zigbuild
```

Docker Desktop must be running.

## Build amd64 Image Locally

```bash
make image-amd64
```

This runs:

- `npm ci && npm run build` in `apps/web-demo`
- `cargo zigbuild --release --target x86_64-unknown-linux-musl`
- `docker buildx build --platform linux/amd64 -f Dockerfile.prebuilt --load`
- `docker save | gzip`

Expected output:

```text
dist/streamflow-gateway-amd64.tar.gz
```

## Deploy Uploaded Image

Default target:

```text
root@example.com:/opt/streamflow-gateway
```

Deploy:

```bash
make deploy-image
```

Or build and deploy in one command:

```bash
make release-amd64
```

The deploy script:

1. Uploads `dist/streamflow-gateway-amd64.tar.gz`.
2. Runs `docker load` on the server.
3. Tags the image as `streamflow-gateway:local`.
4. Recreates only the `gateway` service with `--no-build`.
5. Runs the public health check.

## Small Server Limits

For a 2 vCPU / 2 GiB server, keep the container limits conservative so the machine stays responsive:

```bash
GATEWAY_CPUS=1.6
GATEWAY_MEM_LIMIT=1500m
GATEWAY_PIDS_LIMIT=256
MAX_TRANSCODE_STREAMS=1
ZLM_CPUS=0.3
ZLM_MEM_LIMIT=256m
ZLM_PIDS_LIMIT=128
```

These limits do not increase throughput. They only prevent the machine from being fully saturated when several different streams are transcoded at once. On very small machines, set `MAX_TRANSCODE_STREAMS=1`; H265 raw direct playback and H264 remux streams can still run outside this expensive transcode quota.

## Server Requirements

The server needs:

- Docker
- Docker Compose plugin
- `/opt/streamflow-gateway/docker-compose.prod.yml`
- `/opt/streamflow-gateway/.env`
- nginx or another reverse proxy forwarding public traffic to gateway port `8000`

The server does not need:

- Rust
- Cargo
- Node.js
- npm
- FFmpeg build toolchain

## Production Compose

`docker-compose.prod.yml` runs:

- `gateway`: the packaged Rust gateway + web demo + FFmpeg runtime image
- `zlm`: ZLMediaKit sidecar

The gateway listens on `GATEWAY_PORT`, defaulting to `8000` in production.

## Verify Deployment

```bash
curl -f http://example.com/health
curl -s http://example.com/api/streams
```

Check the container:

```bash
ssh root@example.com \
  'docker ps --filter name=streamflow-gateway --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"'
```

Check FFmpeg enhanced RTMP support:

```bash
ssh root@example.com \
  'docker exec streamflow-gateway ffmpeg -hide_banner -h protocol=rtmp 2>/dev/null | grep rtmp_enhanced_codecs'
```

## Useful Overrides

```bash
REMOTE_HOST=root@your-server \
REMOTE_DIR=/opt/streamflow-gateway \
HEALTH_URL=http://your-domain/health \
make deploy-image
```

```bash
IMAGE_TAG=streamflow-gateway:amd64-deploy \
IMAGE_TAR=dist/streamflow-gateway-amd64.tar.gz \
make image-amd64
```

## Why Not Build on the Server?

Building on the production server is possible but not recommended. Rust release builds and FFmpeg-related images can consume enough CPU and memory to make SSH unstable on small machines.

The verified path is:

```text
build locally -> upload image -> server only runs containers
```

## Rollback

If a previous image tag is available on the server:

```bash
ssh root@example.com \
  'cd /opt/streamflow-gateway && docker tag <previous-image> streamflow-gateway:local && docker compose -f docker-compose.prod.yml --env-file .env up -d --no-build --force-recreate gateway'
```

For future releases, keep versioned image tags in addition to `streamflow-gateway:local`.
