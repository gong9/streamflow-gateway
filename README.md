# streamflow-gateway

A Rust media gateway prototype for RTSP/RTMP/HTTP-FLV camera streams. It is designed for high-concurrency fanout: reuse the same upstream source, distribute compressed media over WebSocket, and fall back to HLS for browser compatibility.

## Status

This is a production-shaped prototype. The backend already exposes multi-stream APIs, same-source reuse, WebSocket fanout, FFmpeg upstream processes, and HLS fallback hooks. The web demo prioritizes stable HLS playback while exposing an experimental WebCodecs/WebSocket path.

## Architecture

```text
RTSP/RTMP/HTTP-FLV source
  -> Rust gateway
  -> same-source upstream reuse
  -> WebSocket fanout for experimental browser decode
  -> HLS fallback via FFmpeg + ZLMediaKit
  -> Vite React demo
```

## Quick Start

```bash
make docker-up
make dev-api
```

In another terminal:

```bash
cd apps/web-demo
npm install
npm run dev
```

Open `http://127.0.0.1:5178`.

To run the packaged gateway and built web demo as one service:

```bash
make docker-stack-up
```

Open `http://127.0.0.1:5177`.

## Deployment

The recommended production path is to build the Linux amd64 image locally and upload it to the server:

```bash
make image-amd64
make deploy-image
```

Or run both steps:

```bash
make release-amd64
```

This uses `cargo-zigbuild` to cross-compile the gateway and `Dockerfile.prebuilt` to package the image without compiling inside Docker. See `docs/deployment.md`.

## API

- `POST /api/streams` creates or reuses a stream.
- `GET /api/streams` lists active streams.
- `GET /api/streams/:streamId/status` returns a single stream status.
- `DELETE /api/streams/:streamId` releases a viewer intent and lets idle TTL cleanup remove the stream.
- `WS /ws/streams/:streamId` subscribes to binary media data.
- `GET /hls/*` proxies HLS fallback segments from ZLMediaKit.

## Defaults

Runtime settings are environment-driven. Copy `.env.example` to `.env` for Docker Compose deployments:

```bash
cp .env.example .env
```

| Variable | Local default | Docker Compose default | Meaning |
| --- | --- | --- | --- |
| `GATEWAY_HOST` | `127.0.0.1` | `0.0.0.0` | Gateway bind host |
| `GATEWAY_PORT` | `5177` | `5177` | Gateway HTTP port |
| `ZLM_HTTP_ORIGIN` | `http://127.0.0.1:8080` | `http://zlm:80` | ZLMediaKit HTTP origin |
| `RTSP_PUSH_ORIGIN` | `rtsp://127.0.0.1:8554/live` | `rtsp://zlm:554/live` | RTSP push target prefix |
| `MAX_UPSTREAMS` | `50` | `50` | Maximum active upstream sources |
| `MAX_VIEWERS` | `500` | `500` | Maximum active viewers |
| `CLEANUP_AFTER_SECS` | `120` | `120` | Idle stream cleanup TTL |
| `VIEWER_BUFFER_BYTES` | `262144` | `262144` | Per-viewer buffer size |
| `STREAMFLOW_SPAWN_PROCESSES` | `1` | `1` | Set `0` only for tests without FFmpeg |

## Testing

```bash
make check
make test
make test-functional
make test-frontend-flow
make test-integration
make test-e2e
make load
make soak
```

Automated tests use generated local streams instead of public RTSP/RTMP URLs.

`make test-functional` starts the gateway with process spawning disabled and verifies the real HTTP/WebSocket control plane: health, invalid URL rejection, stream creation, same-source reuse, stream isolation, listing, WebSocket subscription, metrics, release, and TTL cleanup.

`make test-frontend-flow` starts the gateway plus the Vite demo, then uses Playwright to operate the UI: enter a URL, start playback, verify `streamId/ws` state, switch to another URL, and stop.

`make load` starts an isolated gateway with FFmpeg spawning disabled and runs a configurable multi-stream, multi-viewer WebSocket load matrix. Example:

```bash
make load LOAD_STREAMS=50 LOAD_VIEWERS=500 LOAD_DURATION_SECONDS=60
```

`make load-live` targets the currently running gateway and can use real sources:

```bash
STREAM_URLS='rtmp://example/live/a,rtmp://example/live/b' STREAMS=2 VIEWERS=20 make load-live
```

## Docker

`Dockerfile` compiles the Rust gateway and ships one runtime image with FFmpeg installed.
`Dockerfile.prebuilt` is the recommended deployment image path: it packages a locally cross-compiled Linux amd64 gateway binary plus the built React demo.
ZLMediaKit remains a sidecar dependency in Compose so the gateway can scale independently from the media server.
