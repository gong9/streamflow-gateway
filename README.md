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

## API

- `POST /api/streams` creates or reuses a stream.
- `GET /api/streams` lists active streams.
- `GET /api/streams/:streamId/status` returns a single stream status.
- `DELETE /api/streams/:streamId` releases a viewer intent and lets idle TTL cleanup remove the stream.
- `WS /ws/streams/:streamId` subscribes to binary media data.
- `GET /hls/*` proxies HLS fallback segments from ZLMediaKit.

## Defaults

- Host: `127.0.0.1`
- Port: `5177`
- Max upstreams: `50`
- Max viewers: `500`
- Cleanup TTL: `120s`
- ZLMediaKit origin: `http://127.0.0.1:8080`

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

`Dockerfile` builds the React demo, compiles the Rust gateway, and ships one runtime image with FFmpeg installed. ZLMediaKit remains a sidecar dependency in `docker-compose.yml` so the gateway can scale independently from the media server.
