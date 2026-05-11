export type PlayMode = 'auto' | 'webcodecs' | 'hls';

export interface StreamResponse {
  stream_id: string;
  play_mode: 'webcodecs' | 'hls';
  ws_url: string;
  hls_url: string;
  codec: string;
  reused: boolean;
}

export interface StreamStatus {
  stream_id: string;
  input_url: string;
  codec: string;
  running: boolean;
  viewer_count: number;
  upstream_pid: number | null;
  started_at: string;
  idle_since: string | null;
  last_error: string | null;
  restart_count: number;
  dropped_frames: number;
  hls_url: string;
  ws_url: string;
}

export async function createStream(url: string, mode: PlayMode = 'auto'): Promise<StreamResponse> {
  const res = await fetch('/api/streams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, mode })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '创建流失败');
  return data;
}

export async function getStreamStatus(streamId: string): Promise<StreamStatus> {
  const res = await fetch(`/api/streams/${streamId}/status`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '读取状态失败');
  return data;
}

export async function deleteStream(streamId: string): Promise<void> {
  const res = await fetch(`/api/streams/${streamId}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '停止流失败');
  }
}
