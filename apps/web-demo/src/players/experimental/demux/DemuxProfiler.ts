export interface DemuxMetrics {
  videoFps: number | null;
  audioFps: number | null;
  bitrateKbps: number | null;
  keyframeFps: number | null;
  keyframeIntervalMs: number | null;
  ptsJitterMs: number | null;
  videoPackets: number;
  audioPackets: number;
  bytes: number;
  lastVideoTimestamp: number | null;
  codec: string | null;
  resolution: string | null;
  bottleneck: 'healthy' | 'no-video' | 'keyframe-sparse' | 'pts-jitter' | 'low-input' | 'unknown';
}

export class DemuxProfiler {
  private videoPackets = 0;
  private audioPackets = 0;
  private keyframes = 0;
  private bytes = 0;
  private lastVideoTimestamp: number | null = null;
  private lastKeyframeTimestamp: number | null = null;
  private keyframeIntervals: number[] = [];
  private ptsDeltas: number[] = [];
  private startedAt = performance.now();
  private codec: string | null = null;
  private resolution: string | null = null;

  setVideoConfig(config: VideoDecoderConfig) {
    this.codec = config.codec || null;
    if (config.codedWidth && config.codedHeight) {
      this.resolution = `${config.codedWidth}x${config.codedHeight}`;
    }
  }

  markVideo(chunk: EncodedVideoChunkInit) {
    this.videoPackets += 1;
    this.bytes += byteLengthOf(chunk.data);
    const timestamp = toFiniteNumber(chunk.timestamp);
    if (timestamp !== null) {
      if (this.lastVideoTimestamp !== null) {
        this.ptsDeltas.push(Math.abs(timestamp - this.lastVideoTimestamp));
      }
      this.lastVideoTimestamp = timestamp;
      if (chunk.type === 'key') {
        this.keyframes += 1;
        if (this.lastKeyframeTimestamp !== null) {
          this.keyframeIntervals.push(timestamp - this.lastKeyframeTimestamp);
        }
        this.lastKeyframeTimestamp = timestamp;
      }
    } else if (chunk.type === 'key') {
      this.keyframes += 1;
    }
  }

  markAudio(chunk: EncodedAudioChunkInit) {
    this.audioPackets += 1;
    this.bytes += byteLengthOf(chunk.data);
  }

  snapshot(): DemuxMetrics {
    const now = performance.now();
    const elapsed = Math.max(1, now - this.startedAt);
    const metrics: DemuxMetrics = {
      videoFps: toRate(this.videoPackets, elapsed),
      audioFps: toRate(this.audioPackets, elapsed),
      bitrateKbps: this.bytes * 8 / elapsed,
      keyframeFps: toRate(this.keyframes, elapsed),
      keyframeIntervalMs: average(this.keyframeIntervals),
      ptsJitterMs: jitter(this.ptsDeltas),
      videoPackets: this.videoPackets,
      audioPackets: this.audioPackets,
      bytes: this.bytes,
      lastVideoTimestamp: this.lastVideoTimestamp,
      codec: this.codec,
      resolution: this.resolution,
      bottleneck: 'unknown'
    };
    metrics.bottleneck = diagnose(metrics);
    this.reset(now);
    return metrics;
  }

  private reset(now: number) {
    this.videoPackets = 0;
    this.audioPackets = 0;
    this.keyframes = 0;
    this.bytes = 0;
    this.keyframeIntervals = [];
    this.ptsDeltas = [];
    this.startedAt = now;
  }
}

function diagnose(metrics: DemuxMetrics): DemuxMetrics['bottleneck'] {
  if (!metrics.videoFps || metrics.videoFps <= 0) return 'no-video';
  if (metrics.videoFps < 8) return 'low-input';
  if (typeof metrics.keyframeIntervalMs === 'number' && metrics.keyframeIntervalMs > 5000) return 'keyframe-sparse';
  if (typeof metrics.ptsJitterMs === 'number' && metrics.ptsJitterMs > 80) return 'pts-jitter';
  if (metrics.videoFps >= 20) return 'healthy';
  return 'unknown';
}

function toRate(count: number, elapsedMs: number) {
  const rate = count * 1000 / elapsedMs;
  return rate > 0 ? rate : null;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function jitter(values: number[]) {
  if (values.length < 3) return null;
  const avg = average(values);
  if (avg === null) return null;
  return values.reduce((sum, value) => sum + Math.abs(value - avg), 0) / values.length;
}

function byteLengthOf(data: EncodedVideoChunkInit['data'] | EncodedAudioChunkInit['data']) {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  return 0;
}

function toFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
