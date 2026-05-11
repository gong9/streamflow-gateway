# Architecture

streamflow-gateway separates three concerns:

1. Upstream acquisition: FFmpeg pulls RTSP/RTMP/HTTP-FLV sources.
2. Gateway fanout: Rust manages stream identity, same-source reuse, viewer lifecycle, and WebSocket broadcast.
3. Browser playback: WebCodecs/WebSocket is the experimental low-server-CPU path; HLS is the stable fallback.

The first implementation intentionally keeps FFmpeg and ZLMediaKit as dependencies. The goal is to reduce server-side transcoding pressure while preserving a compatibility path.

## Data Flow

```text
Client -> POST /api/streams
Gateway -> normalize URL and reuse/create streamId
Gateway -> spawn upstream process
Client -> WS /ws/streams/:streamId or HLS fallback
Gateway -> fanout chunks to viewers
```

## First-Version Boundary

The WebSocket channel currently distributes MPEG-TS chunks. A full H264 Annex-B parser and WebCodecs frame scheduler are planned next. The demo therefore falls back to HLS for actual video playback after probing the WebSocket path.
