import { describe, expect, it, vi } from 'vitest';
import { createStream } from '../api';

describe('api client', () => {
  it('creates a stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ stream_id: 's1', play_mode: 'hls', ws_url: '/ws/streams/s1', hls_url: '/hls/live/s1/hls.m3u8', codec: 'h264', reused: false })
    })));
    const stream = await createStream('rtsp://example.test/live');
    expect(stream.stream_id).toBe('s1');
    vi.unstubAllGlobals();
  });
});
