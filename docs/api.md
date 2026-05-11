# API

## POST /api/streams

Request:

```json
{
  "url": "https://example.test/live/camera.flv?codeType=H265",
  "mode": "auto"
}
```

Supported input URL schemes:

- `rtsp://`
- `rtmp://`
- `rtmps://`
- `http://...flv`
- `https://...flv`

Response:

```json
{
  "stream_id": "uuid",
  "play_mode": "webcodecs",
  "ws_url": "/ws/streams/uuid",
  "hls_url": "/hls/live/uuid/hls.m3u8",
  "codec": "h264",
  "reused": false
}
```

## GET /api/streams/:streamId/status

Returns running state, viewer count, upstream PID, restart count, dropped frames, and playback URLs.

## DELETE /api/streams/:streamId

Releases the caller's intent to watch the stream. The upstream is not killed immediately; when viewer count stays at zero for `CLEANUP_AFTER_SECS`, the housekeeping loop removes the stream and releases its same-source reuse entry.

## WS /ws/streams/:streamId

Sends JSON control events and binary media chunks. The binary protocol is intentionally internal for v0.1 and will be formalized after the WebCodecs parser is complete.

If the gateway has reached `MAX_VIEWERS`, the upgrade is rejected with HTTP `429`.
