import { detectTurboCapabilities, detectTurboCapabilitiesSync } from './capabilities';
import { FrameQueue } from './FrameQueue';
import { PlaybackProfiler } from './metrics/PlaybackProfiler';
import { createTurboRenderer } from './renderers/createTurboRenderer';
import { TurboCapabilities, TurboFrame, TurboPlayerHandle, TurboPlayerOptions, TurboRenderer } from './types';

export class H265TurboPlayer implements TurboPlayerHandle {
  private destroyed = false;
  private capabilities: TurboCapabilities = detectTurboCapabilitiesSync();
  private renderer: TurboRenderer | null = null;
  private profiler: PlaybackProfiler | null = null;
  private queue: FrameQueue | null = null;
  private metricsTimer = 0;
  private renderTimer = 0;

  constructor(private readonly options: TurboPlayerOptions) {}

  async start() {
    this.destroyed = false;
    this.options.onStatus?.('正在检测浏览器增强能力...');
    this.capabilities = await detectTurboCapabilities();
    this.renderer = createTurboRenderer(this.options.canvas, this.capabilities);
    this.profiler = new PlaybackProfiler(this.renderer.mode);
    this.queue = new FrameQueue({
      maxFrames: 4,
      preferLatest: true,
      onDrop: (count) => this.profiler?.addDropped(count)
    });

    const width = this.options.source.width ?? 1280;
    const height = this.options.source.height ?? 720;
    await this.renderer.initialize(width, height);
    this.profiler.start();
    this.startMetricsLoop();
    this.startRenderLoop();
    this.options.onStatus?.('实验软解器已就绪，等待接入解码核心', true);
  }

  destroy() {
    this.destroyed = true;
    if (this.metricsTimer) window.clearInterval(this.metricsTimer);
    if (this.renderTimer) window.clearInterval(this.renderTimer);
    this.metricsTimer = 0;
    this.renderTimer = 0;
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

  pushDecodedFrame(frame: TurboFrame) {
    if (this.destroyed || !this.queue) {
      frame.close?.();
      return;
    }
    this.profiler?.mark('decoded');
    this.queue.push(frame);
    this.profiler?.setQueueDepth(this.queue.depth);
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

  private startRenderLoop() {
    this.renderTimer = window.setInterval(() => {
      if (this.destroyed || !this.renderer || !this.queue || !this.profiler) return;
      const frame = this.queue.popLatest();
      this.profiler.setQueueDepth(this.queue.depth);
      if (!frame) return;
      try {
        this.profiler.measure('render', () => this.renderer?.render(frame));
        this.profiler.mark('rendered');
      } finally {
        frame.close?.();
      }
    }, 1000 / 60);
  }
}

export function createH265TurboPlayer(options: TurboPlayerOptions): H265TurboPlayer {
  return new H265TurboPlayer(options);
}
