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
  "play_mode": "hls",
  "ws_url": "/ws/streams/uuid",
  "hls_url": "/hls/live/uuid/hls.m3u8",
  "raw_flv_url": "/zlm/live/uuid.live.flv",
  "recommended_profile": "raw_h265",
  "source_video_codec": "hevc",
  "profiles": [
    {
      "profile": "raw_h265",
      "label": "原始直出",
      "codec": "h265",
      "transport": "http_flv",
      "url": "/zlm/live/uuid.live.flv",
      "strategy": "copy",
      "cpu_cost": "low",
      "ready": true
    },
    {
      "profile": "fallback_h264",
      "label": "兼容转码",
      "codec": "h264",
      "transport": "hls",
      "url": "/hls/live/uuid/hls.m3u8",
      "strategy": "transcode_on_demand",
      "cpu_cost": "high",
      "ready": false
    }
  ],
  "codec": "h264",
  "reused": false
}
```

## GET /api/streams/:streamId/status

Returns running state, viewer count, upstream PID, restart count, dropped frames, playback URLs, diagnostics, and the selected HLS strategy.

Strategy fields:

- `hls_strategy`: `copy` means remux without transcoding; `transcode` means convert to H264 for browser compatibility.
- `source_video_codec`: video codec detected by `ffprobe`, for example `h264` or `hevc`.
- `source_audio_codec`: audio codec detected by `ffprobe`; audio is currently dropped in the first version.
- `profiles`: available playback profiles. `raw_h265` is low-CPU direct playback; `fallback_h264` is the compatibility path.
- `recommended_profile`: the profile the frontend should try first.
- `strategy_reason`: human-readable reason for the selected strategy.

Example:

```json
{
  "stream_id": "uuid",
  "codec": "h264",
  "hls_strategy": "copy",
  "source_video_codec": "h264",
  "source_audio_codec": "aac",
  "source_width": 1920,
  "source_height": 1080,
  "strategy_reason": "source video is H264, remux without transcoding",
  "running": true,
  "viewer_count": 3
}
```

## POST /api/streams/:streamId/profiles/fallback-h264

Starts the H264 compatibility profile on demand. This is intended for H265 sources when browser-side H265 playback fails or is not configured.

Response is the normal stream status with `profiles[].ready=true` for `fallback_h264` once the FFmpeg process has started.

If active H264 compatibility transcodes have reached `MAX_TRANSCODE_STREAMS`, the gateway returns HTTP `429`. Raw H265 direct playback and H264 remux streams do not consume this quota.

## DELETE /api/streams/:streamId

Releases the caller's intent to watch the stream. The upstream is not killed immediately; when viewer count stays at zero for `CLEANUP_AFTER_SECS`, the housekeeping loop removes the stream and releases its same-source reuse entry.

## WS /ws/streams/:streamId

Sends JSON control events and binary media chunks when `STREAMFLOW_WS_UPSTREAM=1`.
The stable browser playback path is HLS.

If the gateway has reached `MAX_VIEWERS`, the upgrade is rejected with HTTP `429`.
