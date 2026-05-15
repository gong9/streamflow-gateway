# Concurrency

The gateway is designed around upstream reuse.

- Same source URL: one upstream process, many viewers.
- Different source URLs: one upstream per unique URL.
- H264 sources: remux to HLS without transcoding when possible.
- H265 sources: try browser-side Jessibuca/WASM raw H265 playback first, then start H264 fallback only when needed.
- H264 fallback transcode cap: `MAX_TRANSCODE_STREAMS` prevents CPU saturation.
- Unknown sources: use the safe H264 compatibility path.
- Viewer cap: each WebSocket subscriber consumes one global viewer slot.
- Slow viewer: old packets are dropped; the upstream is never blocked by a slow client.
- Idle cleanup: streams with zero viewers are removed after the TTL.
- Restart isolation: if one active upstream exits, housekeeping restarts that stream without touching other streams.

## Practical Limits

For a normal 4C/8G/1Gbps server and 2Mbps streams, a realistic first-version target is 200-400 viewer connections when sources can be remuxed or when many viewers reuse the same upstream. Larger concurrency is primarily a bandwidth and fanout topology problem, not a video encoding CPU problem.

If every source needs H265-to-H264 transcoding, CPU becomes the limit. The optimized path avoids this by publishing a low-CPU `raw_h265` profile and only starting `fallback_h264` after browser playback fails.

Check each stream with:

```http
GET /api/streams/:streamId/status
```

Important fields:

- `hls_strategy=copy`: low CPU remux path.
- `hls_strategy=transcode`: CPU-heavy compatibility path.
- `source_video_codec`: detected source video codec.
- `recommended_profile=raw_h265`: frontend should try H265 direct playback first.
- `profiles[].cpu_cost`: profile-level CPU estimate.
- `strategy_reason`: why the gateway selected that strategy.

## Defaults

- `MAX_UPSTREAMS=50`
- `MAX_VIEWERS=500`
- `MAX_TRANSCODE_STREAMS=2`
- `CLEANUP_AFTER_SECS=120`
- `VIEWER_BUFFER_BYTES=262144`
