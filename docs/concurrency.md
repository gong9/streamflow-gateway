# Concurrency

The gateway is designed around upstream reuse.

- Same source URL: one upstream process, many viewers.
- Different source URLs: one upstream per unique URL.
- Viewer cap: each WebSocket subscriber consumes one global viewer slot.
- Slow viewer: old packets are dropped; the upstream is never blocked by a slow client.
- Idle cleanup: streams with zero viewers are removed after the TTL.
- Restart isolation: if one active upstream exits, housekeeping restarts that stream without touching other streams.

## Practical Limits

For a normal 4C/8G/1Gbps server and 2Mbps streams, a realistic first-version target is 200-400 viewer connections. Larger concurrency is primarily a bandwidth and fanout topology problem, not a video encoding CPU problem.

## Defaults

- `MAX_UPSTREAMS=50`
- `MAX_VIEWERS=500`
- `CLEANUP_AFTER_SECS=120`
- `VIEWER_BUFFER_BYTES=262144`
