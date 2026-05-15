import { TurboDecoderMode, TurboPlaybackMetrics } from '../types';

type CounterName = 'input' | 'demux' | 'decoded' | 'rendered';
type CostName = 'decode' | 'render';

export class PlaybackProfiler {
  private readonly counters: Record<CounterName, number> = {
    input: 0,
    demux: 0,
    decoded: 0,
    rendered: 0
  };
  private readonly costs: Record<CostName, number[]> = {
    decode: [],
    render: []
  };
  private frameIntervals: number[] = [];
  private decodedIntervals: number[] = [];
  private lastRenderAt = 0;
  private lastDecodedAt = 0;
  private decodedBurst = 0;
  private decodedBurstMax = 0;
  private droppedFrames = 0;
  private queueDepth = 0;
  private decodeQueueDepth = 0;
  private clockDelayMs: number | null = null;
  private mediaLagMs: number | null = null;
  private longTasks: Array<{ at: number; duration: number }> = [];
  private observer: PerformanceObserver | null = null;
  private lastSnapshotAt = performance.now();

  constructor(private readonly mode: TurboDecoderMode) {}

  start() {
    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      this.observer = new PerformanceObserver((list) => {
        const now = performance.now();
        for (const entry of list.getEntries()) {
          this.longTasks.push({ at: now, duration: entry.duration });
        }
      });
      this.observer.observe({ entryTypes: ['longtask'] });
    }
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
  }

  mark(name: CounterName) {
    this.counters[name] += 1;
    if (name === 'decoded') {
      const now = performance.now();
      if (this.lastDecodedAt > 0) {
        const delta = now - this.lastDecodedAt;
        this.decodedIntervals.push(delta);
        if (delta <= 8) {
          this.decodedBurst += 1;
        } else {
          this.decodedBurst = 1;
        }
        this.decodedBurstMax = Math.max(this.decodedBurstMax, this.decodedBurst);
      } else {
        this.decodedBurst = 1;
      }
      this.lastDecodedAt = now;
    }
    if (name === 'rendered') {
      const now = performance.now();
      if (this.lastRenderAt > 0) this.frameIntervals.push(now - this.lastRenderAt);
      this.lastRenderAt = now;
    }
  }

  measure<T>(name: CostName, fn: () => T): T {
    const startedAt = performance.now();
    try {
      return fn();
    } finally {
      this.costs[name].push(performance.now() - startedAt);
    }
  }

  async measureAsync<T>(name: CostName, fn: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await fn();
    } finally {
      this.costs[name].push(performance.now() - startedAt);
    }
  }

  addDropped(count = 1) {
    this.droppedFrames += count;
  }

  addRenderCost(costMs: number) {
    if (Number.isFinite(costMs)) this.costs.render.push(costMs);
  }

  setQueueDepth(depth: number) {
    this.queueDepth = depth;
  }

  setDecodeQueueDepth(depth: number) {
    this.decodeQueueDepth = depth;
  }

  setClockStats(stats: { delayMs?: number | null; mediaLagMs?: number | null }) {
    if (stats.delayMs !== undefined) this.clockDelayMs = stats.delayMs;
    if (stats.mediaLagMs !== undefined) this.mediaLagMs = stats.mediaLagMs;
  }

  snapshot(): TurboPlaybackMetrics {
    const now = performance.now();
    const elapsed = Math.max(1, now - this.lastSnapshotAt);
    this.trimLongTasks(now);
    const longTaskTotalMs = this.longTasks.reduce((sum, task) => sum + task.duration, 0);
    const metrics: TurboPlaybackMetrics = {
      inputFps: toFps(this.counters.input, elapsed),
      demuxFps: toFps(this.counters.demux, elapsed),
      decodedFps: toFps(this.counters.decoded, elapsed),
      renderedFps: toFps(this.counters.rendered, elapsed),
      decodeCostMs: average(this.costs.decode),
      renderCostMs: average(this.costs.render),
      frameP95Ms: percentile(this.frameIntervals, 0.95),
      queueDepth: this.queueDepth,
      decodeQueueDepth: this.decodeQueueDepth,
      droppedFrames: this.droppedFrames,
      clockDelayMs: this.clockDelayMs,
      mediaLagMs: this.mediaLagMs,
      decodedIntervalP95Ms: percentile(this.decodedIntervals, 0.95),
      decodedBurstMax: this.decodedBurstMax,
      longTaskCount: this.longTasks.length,
      longTaskTotalMs,
      mode: this.mode,
      bottleneck: 'unknown'
    };
    metrics.bottleneck = diagnose(metrics);
    this.resetWindow(now);
    return metrics;
  }

  private resetWindow(now: number) {
    this.counters.input = 0;
    this.counters.demux = 0;
    this.counters.decoded = 0;
    this.counters.rendered = 0;
    this.costs.decode = [];
    this.costs.render = [];
    this.frameIntervals = [];
    this.decodedIntervals = [];
    this.droppedFrames = 0;
    this.decodedBurstMax = 0;
    this.lastSnapshotAt = now;
  }

  private trimLongTasks(now: number) {
    while (this.longTasks.length && now - this.longTasks[0].at > 10_000) {
      this.longTasks.shift();
    }
  }
}

function diagnose(metrics: TurboPlaybackMetrics): TurboPlaybackMetrics['bottleneck'] {
  if (metrics.longTaskTotalMs > 300 || metrics.longTaskCount >= 4) return 'main-thread';
  if (
    typeof metrics.renderedFps === 'number' &&
    metrics.renderedFps >= 20 &&
    typeof metrics.frameP95Ms === 'number' &&
    metrics.frameP95Ms <= 60
  ) return 'healthy';
  if (metrics.queueDepth >= 10 || metrics.droppedFrames >= 8) return 'queue';
  if (isLow(metrics.inputFps)) return 'input';
  if (isLow(metrics.demuxFps)) return 'demux';
  if (isLow(metrics.decodedFps)) return 'decode';
  if (
    typeof metrics.decodedFps === 'number' &&
    typeof metrics.renderedFps === 'number' &&
    metrics.decodedFps - metrics.renderedFps >= 8
  ) return 'render';
  if (typeof metrics.renderCostMs === 'number' && metrics.renderCostMs >= 16) return 'render';
  if (typeof metrics.renderedFps === 'number' && metrics.renderedFps >= 20) return 'healthy';
  return 'unknown';
}

function isLow(value: number | null) {
  return typeof value === 'number' && value > 0 && value < 12;
}

function toFps(count: number, elapsedMs: number) {
  const fps = count * 1000 / elapsedMs;
  return fps > 0 ? fps : null;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}
