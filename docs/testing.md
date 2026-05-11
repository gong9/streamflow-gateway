# Testing

## Local Source

Start ZLMediaKit and a generated test source:

```bash
make docker-up
./scripts/start-test-source.sh
```

`start-test-source.sh` will also try to start the local ZLMediaKit dependency automatically when port `8554` is not open.

When the gateway runs directly on the host, the generated test URL is:

```text
rtsp://127.0.0.1:8554/live/test
```

When the gateway runs inside Docker Compose, `127.0.0.1` points at the gateway container itself. Use the Compose service DNS name instead:

```text
rtsp://zlm:554/live/test
```

## Test Layers

- Rust unit/integration tests: stream reuse, isolation, limits, viewer caps, delayed idle cleanup.
- Functional smoke test: starts the gateway and verifies real HTTP/WebSocket behavior.
- Frontend flow test: starts the gateway plus Vite demo and drives the browser UI.
- Frontend unit tests: API client and player capability checks.
- E2E tests: demo rendering and core controls.
- Load tests: API/WebSocket multi-stream viewer simulation, plus optional live HLS polling.
- Soak tests: repeated health/metrics collection.

## Functional Smoke

```bash
make test-functional
```

This runs without Docker by setting `STREAMFLOW_SPAWN_PROCESSES=0`, so it validates the gateway control plane without requiring a live camera source. It checks health, invalid input rejection, stream creation, reuse, isolation, listing, WebSocket subscription, metrics, release, and TTL cleanup.

## Frontend Flow

```bash
make test-frontend-flow
```

This is the end-to-end UI smoke test. It opens the React demo in Playwright, enters a stream URL, clicks start, verifies stream state is rendered, switches to another URL, and stops playback.

## Load Matrix

Safe control-plane load test without FFmpeg:

```bash
make load
```

Useful knobs:

```bash
make load LOAD_STREAMS=50 LOAD_VIEWERS=500 LOAD_DURATION_SECONDS=60 LOAD_RAMP_MS=10000
```

This starts a temporary gateway with `STREAMFLOW_SPAWN_PROCESSES=0`, creates many distinct stream URLs, opens viewer WebSockets across them, prints one JSON metrics line per second, and writes the same output to `logs/load-matrix.ndjson`.

Live gateway load test:

```bash
STREAM_URLS='rtmp://example/live/a,rtmp://example/live/b' STREAMS=2 VIEWERS=20 DURATION_SECONDS=60 make load-live
```

`load-live` targets the current gateway at `APP_URL` and can exercise real FFmpeg/ZLMediaKit resources. Start small because each distinct real URL can create its own upstream pull/transcode process.

HLS polling mode:

```bash
STREAM_URLS='rtmp://example/live/a' STREAMS=1 VIEWERS=20 VIEWER_MODE=hls make load-live
```

Use this to approximate many browser HLS clients repeatedly loading manifests. For full browser decode pressure, add a Playwright-based test later; that is much heavier and should run on a separate worker machine.
