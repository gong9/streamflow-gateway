export type PlayMode = 'auto' | 'webcodecs' | 'hls';

export interface StreamResponse {
  stream_id: string;
  input_url: string;
  play_mode: 'webcodecs' | 'hls';
  ws_url: string;
  hls_url: string;
  raw_flv_url: string | null;
  source_video_codec: string | null;
  source_width: number | null;
  source_height: number | null;
  recommended_profile: string;
  profiles: StreamProfile[];
  codec: string;
  reused: boolean;
}

export interface StreamProfile {
  profile: 'raw_h265' | 'fallback_h264' | string;
  label: string;
  codec: string;
  transport: string;
  url: string;
  strategy: string;
  cpu_cost: 'low' | 'high' | string;
  ready: boolean;
}

export interface StreamStatus {
  stream_id: string;
  input_url: string;
  codec: string;
  hls_strategy: 'copy' | 'transcode' | null;
  source_video_codec: string | null;
  source_audio_codec: string | null;
  source_width: number | null;
  source_height: number | null;
  strategy_reason: string | null;
  running: boolean;
  health_state: 'warming' | 'playing' | 'recovering' | 'restarting' | 'unavailable' | 'idle';
  health_label: string;
  segment_fresh: boolean;
  last_segment_at: string | null;
  last_restart_at: string | null;
  consecutive_failures: number;
  recovering: boolean;
  viewer_count: number;
  upstream_pid: number | null;
  started_at: string;
  idle_since: string | null;
  last_error: string | null;
  restart_count: number;
  dropped_frames: number;
  hls_url: string;
  ws_url: string;
  raw_flv_url: string | null;
  recommended_profile: string;
  profiles: StreamProfile[];
  diagnostics: StreamDiagnostics;
}

export interface StreamDiagnostics {
  fps: number | null;
  bitrate_kbps: number | null;
  speed: number | null;
  frame: number | null;
  output_time_ms: number | null;
  total_size_bytes: number | null;
  dup_frames: number | null;
  drop_frames: number | null;
  progress_updated_at: string | null;
  segment_fresh: boolean;
  last_segment_at: string | null;
  viewer_count: number;
  dropped_frames: number;
  restart_count: number;
  consecutive_failures: number;
  running: boolean;
  health_state: StreamStatus['health_state'];
  health_label: string;
  hls_strategy: StreamStatus['hls_strategy'];
  source_video_codec: string | null;
  source_audio_codec: string | null;
  strategy_reason: string | null;
}

export async function createStream(url: string, mode: PlayMode = 'auto'): Promise<StreamResponse> {
  const res = await fetch('/api/streams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, mode })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(friendlyApiError(data.error, '创建流失败'));
  return data;
}

export async function getStreamStatus(streamId: string): Promise<StreamStatus> {
  const res = await fetch(`/api/streams/${streamId}/status`);
  const data = await res.json();
  if (!res.ok) throw new Error(friendlyApiError(data.error, '读取状态失败'));
  return data;
}

export async function getStreamDiagnostics(streamId: string): Promise<StreamDiagnostics> {
  const res = await fetch(`/api/streams/${streamId}/diagnostics`);
  const data = await res.json();
  if (!res.ok) throw new Error(friendlyApiError(data.error, '读取诊断失败'));
  return data;
}

export async function startH264Fallback(streamId: string): Promise<StreamStatus> {
  const res = await fetch(`/api/streams/${streamId}/profiles/fallback-h264`, {
    method: 'POST'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(friendlyApiError(data.error, '启动兼容播放失败'));
  return data;
}

export interface WaitForHlsReadyOptions {
  timeoutMs?: number;
  intervalMs?: number;
  minSegments?: number;
  onTick?(attempt: number): void;
}

export async function waitForHlsReady(
  hlsUrl: string,
  options: WaitForHlsReadyOptions = {}
): Promise<void> {
  if (import.meta.env.VITE_SKIP_HLS_READY === '1') {
    return;
  }

  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 700;
  const minSegments = options.minSegments ?? 3;
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    options.onTick?.(attempt);
    try {
      const separator = hlsUrl.includes('?') ? '&' : '?';
      const res = await fetch(`${hlsUrl}${separator}ready=${Date.now()}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const manifest = await res.text();
        const segments = parseHlsSegments(manifest);
        if (
          manifest.includes('#EXTM3U') &&
          segments.length >= minSegments &&
          await hlsSegmentsReady(hlsUrl, segments.slice(-minSegments))
        ) {
          return;
        }
      }
    } catch {
      // The upstream may still be probing or writing the first segment.
    }
    await delay(intervalMs);
  }

  throw new Error('视频分片准备超时，请确认视频源可访问后重试');
}

export async function deleteStream(streamId: string): Promise<void> {
  const res = await fetch(`/api/streams/${streamId}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(friendlyApiError(data.error, '停止流失败'));
  }
}

function friendlyApiError(error: string | undefined, fallback: string): string {
  if (!error) return fallback;
  if (error.includes('transcode limit reached')) {
    return '服务器兼容转码名额已满，请稍后重试或使用 H265 原始播放';
  }
  if (error.includes('upstream limit reached')) return '视频源数量已达到服务器上限';
  if (error.includes('viewer limit reached')) return '观看人数已达到服务器上限';
  return error;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseHlsSegments(manifest: string): string[] {
  return manifest
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.endsWith('.ts'));
}

async function hlsSegmentsReady(hlsUrl: string, segments: string[]): Promise<boolean> {
  const baseUrl = new URL(hlsUrl, window.location.href);
  const checks = segments.map(async (segment) => {
    const segmentUrl = new URL(segment, baseUrl);
    segmentUrl.searchParams.set('ready', String(Date.now()));
    const res = await fetch(segmentUrl, {
      method: 'HEAD',
      cache: 'no-store'
    });
    return res.ok;
  });
  return (await Promise.all(checks)).every(Boolean);
}
