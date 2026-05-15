import { createH265TurboPlayer, H265TurboPlayer } from '../H265TurboPlayer';
import { TurboPlaybackMetrics } from '../types';
import { MediaClock } from './MediaClock';
import { YuvFrameGenerator } from './YuvFrameGenerator';

export interface FakeYuvRuntimeOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fps: number;
  onStatus?: (message: string, ok?: boolean) => void;
  onMetrics?: (metrics: TurboPlaybackMetrics) => void;
}

export class FakeYuvRuntime {
  private player: H265TurboPlayer | null = null;
  private generator: YuvFrameGenerator | null = null;
  private readonly clock = new MediaClock();
  private timer = 0;
  private destroyed = false;

  constructor(private readonly options: FakeYuvRuntimeOptions) {}

  async start() {
    this.destroyed = false;
    this.generator = new YuvFrameGenerator({
      width: this.options.width,
      height: this.options.height,
      frames: Math.min(48, Math.max(12, Math.round(this.options.fps)))
    });
    this.player = createH265TurboPlayer({
      source: {
        url: 'fake-yuv://runtime',
        width: this.options.width,
        height: this.options.height,
        fps: this.options.fps,
        codec: 'raw-yuv420p'
      },
      canvas: this.options.canvas,
      onStatus: this.options.onStatus,
      onMetrics: this.options.onMetrics,
      preferWebGpu: false
    });
    await this.player.start();
    this.clock.start();
    this.startProducer();
    this.options.onStatus?.('Fake YUV Runtime 正在运行', true);
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.clock.stop();
    this.player?.destroy();
    this.generator?.destroy();
    this.player = null;
    this.generator = null;
  }

  private startProducer() {
    const intervalMs = 1000 / Math.max(1, this.options.fps);
    this.timer = window.setInterval(() => {
      if (this.destroyed || !this.player || !this.generator) return;
      const pts = this.clock.now();
      this.player.markInputFrame();
      this.player.markDemuxFrame();
      const frame = this.player.measureDecode(() => this.generator?.nextFrame(pts));
      if (frame) this.player.pushDecodedFrame(frame);
    }, intervalMs);
  }
}
