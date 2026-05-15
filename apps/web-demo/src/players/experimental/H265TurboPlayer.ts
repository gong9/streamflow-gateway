import { detectTurboCapabilities, detectTurboCapabilitiesSync } from './capabilities';
import { FrameQueue } from './FrameQueue';
import { PlaybackProfiler } from './metrics/PlaybackProfiler';
import { createTurboRenderer } from './renderers/createTurboRenderer';
import { TurboCapabilities, TurboRenderableFrame, TurboPlayerHandle, TurboPlayerOptions, TurboRenderer } from './types';

export class H265TurboPlayer implements TurboPlayerHandle {
  private destroyed = false;
  private capabilities: TurboCapabilities = detectTurboCapabilitiesSync();
  private renderer: TurboRenderer | null = null;
  private profiler: PlaybackProfiler | null = null;
  private queue: FrameQueue | null = null;
  private metricsTimer = 0;
  private renderRaf = 0;
  private renderTimer = 0;
  private renderScheduled = false;
  private renderInFlight = false;
  private nextRenderAt = 0;
  private bufferingStartedAt = 0;
  private playbackStarted = false;
  private readonly targetFrameIntervalMs: number;
  private readonly minBufferFrames = 5;
  private readonly catchupQueueFrames = 10;
  private readonly lowWaterFrames = 3;
  private readonly trimQueueFrames = 12;
  private readonly trimTargetFrames = 8;

  constructor(private readonly options: TurboPlayerOptions) {
    this.targetFrameIntervalMs = 1000 / clampFps(options.source.fps ?? 25);
  }

  async start() {
    this.destroyed = false;
    this.options.onStatus?.('正在检测浏览器增强能力...');
    this.capabilities = await detectTurboCapabilities();
    this.renderer = createTurboRenderer(this.options.canvas, this.capabilities, {
      preferWebGpu: this.options.preferWebGpu,
      preferWorkerRender: this.options.preferWorkerRender
    });
    this.profiler = new PlaybackProfiler(this.renderer.mode);
    this.queue = new FrameQueue({
      maxFrames: 16,
      preferLatest: true,
      onDrop: (count) => this.profiler?.addDropped(count)
    });

    const width = this.options.displayWidth ?? this.options.source.width ?? 1280;
    const height = this.options.displayHeight ?? this.options.source.height ?? 720;
    await this.renderer.initialize(width, height);
    this.profiler.start();
    this.startMetricsLoop();
    this.options.onStatus?.('实验软解器已就绪，等待接入解码核心', true);
  }

  destroy() {
    this.destroyed = true;
    if (this.metricsTimer) window.clearInterval(this.metricsTimer);
    if (this.renderRaf) window.cancelAnimationFrame(this.renderRaf);
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    this.metricsTimer = 0;
    this.renderRaf = 0;
    this.renderTimer = 0;
    this.renderScheduled = false;
    this.renderInFlight = false;
    this.nextRenderAt = 0;
    this.bufferingStartedAt = 0;
    this.playbackStarted = false;
    this.queue?.clear();
    this.profiler?.stop();
    this.renderer?.destroy();
    this.queue = null;
    this.profiler = null;
    this.renderer = null;
  }

  getCapabilities() {
    return this.capabilities;
  }

  pushDecodedFrame(frame: TurboRenderableFrame) {
    if (this.destroyed || !this.queue) {
      closeRenderableFrame(frame);
      return;
    }
    this.profiler?.mark('decoded');
    this.queue.push(frame);
    this.profiler?.setQueueDepth(this.queue.depth);
    this.scheduleRender();
  }

  markInputFrame() {
    this.profiler?.mark('input');
  }

  markDemuxFrame() {
    this.profiler?.mark('demux');
  }

  measureDecode<T>(fn: () => T): T {
    if (!this.profiler) return fn();
    return this.profiler.measure('decode', fn);
  }

  private startMetricsLoop() {
    this.metricsTimer = window.setInterval(() => {
      if (this.destroyed || !this.profiler || !this.queue) return;
      this.profiler.setQueueDepth(this.queue.depth);
      this.options.onMetrics?.(this.profiler.snapshot());
    }, 1000);
  }

  private scheduleRender() {
    if (this.renderScheduled || this.renderInFlight || this.destroyed) return;
    this.renderScheduled = true;
    if (this.shouldUseTimerClock()) {
      const delayMs = this.playbackStarted ? Math.max(0, this.nextRenderAt - performance.now()) : 0;
      this.renderTimer = window.setTimeout(() => {
        this.renderTimer = 0;
        void this.renderNextFrame(performance.now());
      }, delayMs);
      return;
    }
    this.renderRaf = window.requestAnimationFrame((now) => void this.renderNextFrame(now));
  }

  private async renderNextFrame(now: number) {
    this.renderScheduled = false;
    this.renderRaf = 0;
    this.renderTimer = 0;
    if (this.destroyed || !this.renderer || !this.queue || !this.profiler) return;
    if (this.renderInFlight) return;

    if (!this.playbackStarted) {
      if (!this.bufferingStartedAt) this.bufferingStartedAt = now;
      const waitedMs = now - this.bufferingStartedAt;
      if (this.queue.depth < this.minBufferFrames && waitedMs < 420) {
        this.scheduleRender();
        return;
      }
      this.playbackStarted = true;
      this.nextRenderAt = now;
      this.options.onStatus?.('缓冲完成，按媒体时钟平滑渲染', true);
    }

    if (this.nextRenderAt > 0 && now + 1 < this.nextRenderAt) {
      this.scheduleRender();
      return;
    }

    if (this.queue.depth > this.trimQueueFrames) {
      this.queue.trimToLatest(this.trimTargetFrames);
      this.nextRenderAt = now;
      this.profiler.setQueueDepth(this.queue.depth);
    }

    const frame = this.queue.popLatest();
    this.profiler.setQueueDepth(this.queue.depth);
    if (!frame) return;

    let rendered = false;
    this.renderInFlight = true;
    try {
      rendered = Boolean(await this.profiler.measureAsync('render', async () => {
        return await this.renderer?.render(frame);
      }));
    } finally {
      this.renderInFlight = false;
      if (!rendered) closeRenderableFrame(frame);
    }
    if (rendered) this.profiler.mark('rendered');
    this.nextRenderAt = Math.max(now, this.nextRenderAt) + this.nextFrameInterval();
    this.profiler.setClockStats({
      delayMs: Math.max(0, this.nextRenderAt - performance.now()),
      mediaLagMs: this.queue.depth * this.targetFrameIntervalMs
    });

    if (this.queue.depth > 0) this.scheduleRender();
  }

  private nextFrameInterval() {
    const depth = this.queue?.depth ?? 0;
    if (depth >= this.catchupQueueFrames) return 1000 / 45;
    if (depth >= this.minBufferFrames + 3) return 1000 / 32;
    if (depth <= this.lowWaterFrames) return this.targetFrameIntervalMs * 1.12;
    return this.targetFrameIntervalMs;
  }

  private shouldUseTimerClock() {
    return this.renderer?.mode === 'worker-video-frame';
  }
}

export function createH265TurboPlayer(options: TurboPlayerOptions): H265TurboPlayer {
  return new H265TurboPlayer(options);
}

function closeRenderableFrame(frame: TurboRenderableFrame) {
  if (frame instanceof VideoFrame) {
    frame.close();
    return;
  }
  frame.close?.();
}

function clampFps(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 25;
  return Math.min(60, Math.max(12, value));
}
