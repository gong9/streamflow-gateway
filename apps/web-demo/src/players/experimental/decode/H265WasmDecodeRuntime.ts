import { H265TurboPlayer, createH265TurboPlayer } from '../H265TurboPlayer';
import { PlaybackProfiler } from '../metrics/PlaybackProfiler';
import { TurboPlaybackMetrics, TurboFrame } from '../types';

type PipelineStatus = (message: string, ok?: boolean) => void;

interface Jv4Module {
  HttpConnection: new (url: string, options?: { reconnectCount?: number; requestInit?: RequestInit }) => Jv4Connection;
  FlvDemuxer: new (source: Jv4Connection, mode: number, format: 'annexb' | 'avcc') => Jv4Demuxer;
  DemuxEvent: {
    VIDEO_ENCODER_CONFIG_CHANGED: string;
    DEMUX_ERROR: string;
  };
  DemuxMode: {
    PULL: number;
  };
  VideoDecoderSoftSIMD: new (options?: {
    yuvMode?: boolean;
    workerMode?: boolean;
    canvas?: HTMLCanvasElement;
    wasmPath?: string;
  }) => Jv4VideoDecoder;
}

interface Jv4Connection {
  connect(): Promise<void>;
  close(): void;
}

interface Jv4Demuxer {
  videoReadable?: ReadableStream<EncodedVideoChunkInit>;
  audioReadable?: ReadableStream<EncodedAudioChunkInit>;
  on(event: string, callback: (...args: unknown[]) => void): void;
}

interface Jv4VideoDecoder {
  config?: VideoDecoderConfig;
  initialize(): Promise<void>;
  configure(config: VideoDecoderConfig): void;
  decode(packet: EncodedVideoChunkInit): void;
  close(): void;
  on(event: 'videoCodecInfo', callback: (info: { width: number; height: number }) => void): void;
  on(event: 'videoFrame', callback: (frame: unknown) => void): void;
  on(event: 'decoded', callback: (info: { pts?: number; at?: number }) => void): void;
  on(event: 'rendered', callback: (info: { pts?: number; at?: number; costMs?: number; dropped?: number }) => void): void;
  on(event: 'error', callback: (error: unknown) => void): void;
}

interface YuvLikeFrame {
  y: Uint8Array;
  u: Uint8Array;
  v: Uint8Array;
  width?: number;
  height?: number;
}

export interface H265WasmDecodeRuntimeOptions {
  rawUrl: string;
  canvas: HTMLCanvasElement;
  width?: number | null;
  height?: number | null;
  onStatus?: PipelineStatus;
  onMetrics?: (metrics: TurboPlaybackMetrics) => void;
  onError?: (message: string) => void;
  preferDirectWorkerCanvas?: boolean;
  preferWorkerRender?: boolean;
}

const vendorModuleUrl = '/vendor/jessibuca4/jv4-simd.js';
const wasmPath = '/vendor/jessibuca4/videodec_simd.wasm';
let loadingJv4: Promise<Jv4Module> | undefined;

export class H265WasmDecodeRuntime {
  private destroyed = false;
  private conn: Jv4Connection | null = null;
  private decoder: Jv4VideoDecoder | null = null;
  private turbo: H265TurboPlayer | null = null;
  private abort = new AbortController();
  private width = 1280;
  private height = 720;
  private firstFrameSeen = false;
  private decodedFrames = 0;
  private formatFallbackTimer = 0;
  private activeFormat: 'avcc' | 'annexb' = 'annexb';
  private profiler: PlaybackProfiler | null = null;
  private metricsTimer = 0;
  private waitingForKeyFrame = true;
  private keyFrameWaitStartedAt = 0;

  constructor(private readonly options: H265WasmDecodeRuntimeOptions) {
    this.width = options.width ?? 1280;
    this.height = options.height ?? 720;
  }

  async start() {
    this.destroyed = false;
    this.options.onStatus?.('正在加载 WASM H265 解码核心...');
    const jv4 = await loadJv4();
    if (this.destroyed) return;

    if (this.options.preferDirectWorkerCanvas) {
      this.profiler = new PlaybackProfiler('worker-direct-canvas');
      this.profiler.start();
      this.metricsTimer = window.setInterval(() => {
        if (!this.destroyed && this.profiler) this.options.onMetrics?.(this.profiler.snapshot());
      }, 1000);
    } else {
      this.turbo = createH265TurboPlayer({
        source: {
          url: this.options.rawUrl,
          width: this.width,
          height: this.height,
          codec: 'hevc'
        },
        canvas: this.options.canvas,
        onStatus: this.options.onStatus,
        onMetrics: this.options.onMetrics,
        preferWebGpu: false,
        preferWorkerRender: this.options.preferWorkerRender,
        displayWidth: this.options.width,
        displayHeight: this.options.height
      });
      await this.turbo.start();
      if (this.destroyed) return;
    }

    this.options.onStatus?.('正在初始化 SIMD 软解码...');
    this.decoder = new jv4.VideoDecoderSoftSIMD({
      yuvMode: this.shouldOutputYuvFrames(),
      workerMode: true,
      canvas: this.options.preferDirectWorkerCanvas ? this.options.canvas : undefined,
      wasmPath
    });
    this.bindDecoderEvents(this.decoder);
    await this.decoder.initialize();
    if (this.destroyed) return;

    this.options.onStatus?.('正在连接 raw FLV...');
    this.conn = new jv4.HttpConnection(this.options.rawUrl, {
      reconnectCount: 2,
      requestInit: { cache: 'no-store' }
    });
    await this.conn.connect();
    if (this.destroyed) return;

    this.startDemux(jv4, this.conn, this.activeFormat);
  }

  private startDemux(jv4: Jv4Module, conn: Jv4Connection, format: 'avcc' | 'annexb') {
    this.activeFormat = format;
    this.options.onStatus?.(`正在解封装 H265 (${format})...`);
    const demuxer = new jv4.FlvDemuxer(conn, jv4.DemuxMode.PULL, format);
    demuxer.on(jv4.DemuxEvent.VIDEO_ENCODER_CONFIG_CHANGED, (value: unknown) => {
      if (this.destroyed) return;
      const config = normalizeDecoderConfig(value as VideoDecoderConfig, format);
      this.decoder?.configure(config);
      this.width = config.codedWidth ?? this.width;
      this.height = config.codedHeight ?? this.height;
      this.waitingForKeyFrame = true;
      this.keyFrameWaitStartedAt = performance.now();
      this.options.onStatus?.('已收到 H265 配置，等待关键帧...');
    });
    demuxer.on(jv4.DemuxEvent.DEMUX_ERROR, (error: unknown) => {
      const message = error instanceof Error ? error.message : 'FLV 解封装失败';
      this.options.onError?.(message);
      this.options.onStatus?.('解封装恢复中...', false);
    });

    void demuxer.videoReadable?.pipeTo(new WritableStream<EncodedVideoChunkInit>({
      write: (chunk) => {
        if (this.destroyed) return;
        this.turbo?.markInputFrame();
        this.turbo?.markDemuxFrame();
        this.profiler?.mark('input');
        this.profiler?.mark('demux');
        if (this.decoder?.config) {
          if (this.shouldDropUntilKeyFrame(chunk)) return;
          this.decoder.decode(chunk);
        }
      }
    }), { signal: this.abort.signal }).catch((err) => {
      if (!this.destroyed) this.options.onError?.(err instanceof Error ? err.message : '视频流读取失败');
    });

    // PULL 模式下必须消费音频，否则部分流会被音频 reader 卡住。
    void demuxer.audioReadable?.pipeTo(new WritableStream<EncodedAudioChunkInit>({
      write: () => undefined
    }), { signal: this.abort.signal }).catch(() => undefined);

    if (format === 'avcc') {
      this.formatFallbackTimer = window.setTimeout(() => {
        if (this.destroyed || this.decodedFrames > 0 || !this.conn) return;
        this.options.onStatus?.('avcc 未产出画面，切换 annexb 重试...', false);
        this.restartWithFormat('annexb');
      }, 5000);
    }
  }

  destroy() {
    this.destroyed = true;
    this.abort.abort();
    this.abort = new AbortController();
    this.conn?.close();
    this.decoder?.close();
    this.turbo?.destroy();
    this.profiler?.stop();
    if (this.metricsTimer) window.clearInterval(this.metricsTimer);
    this.conn = null;
    this.decoder = null;
    this.turbo = null;
    this.profiler = null;
    this.metricsTimer = 0;
    if (this.formatFallbackTimer) window.clearTimeout(this.formatFallbackTimer);
    this.formatFallbackTimer = 0;
  }

  private async restartWithFormat(format: 'avcc' | 'annexb') {
    try {
      this.abort.abort();
      this.abort = new AbortController();
      this.conn?.close();
      this.decoder?.close();
      this.conn = null;
      this.decoder = null;
      this.decodedFrames = 0;
      this.firstFrameSeen = false;
      this.waitingForKeyFrame = true;
      this.keyFrameWaitStartedAt = 0;
      if (this.formatFallbackTimer) window.clearTimeout(this.formatFallbackTimer);
      this.formatFallbackTimer = 0;

      const jv4 = await loadJv4();
      if (this.destroyed) return;
      this.decoder = new jv4.VideoDecoderSoftSIMD({
        yuvMode: this.shouldOutputYuvFrames(),
        workerMode: true,
        canvas: this.options.preferDirectWorkerCanvas ? this.options.canvas : undefined,
        wasmPath
      });
      this.bindDecoderEvents(this.decoder);
      await this.decoder.initialize();
      if (this.destroyed) return;
      this.conn = new jv4.HttpConnection(this.options.rawUrl, {
        reconnectCount: 2,
        requestInit: { cache: 'no-store' }
      });
      await this.conn.connect();
      if (this.destroyed) return;
      this.startDemux(jv4, this.conn, format);
    } catch (err) {
      if (!this.destroyed) this.options.onError?.(err instanceof Error ? err.message : '解码格式重试失败');
    }
  }

  private handleDecodedFrame(frame: unknown) {
    if (this.destroyed) return;
    this.decodedFrames += 1;
    if (!this.firstFrameSeen) {
      this.firstFrameSeen = true;
      this.options.onStatus?.('真实 H265 正在播放', true);
    }

    if (frame instanceof VideoFrame) {
      if (this.options.preferDirectWorkerCanvas) {
        frame.close();
        return;
      }
      this.turbo?.pushDecodedFrame(frame);
      return;
    }

    if (!isYuvFrame(frame)) return;

    // 先复制一份，保证异步渲染队列不引用解码器可能复用的内存。
    // 后续优化点是改成 SharedArrayBuffer/RingBuffer，减少这里的拷贝。
    const nextFrame: TurboFrame = {
      y: frame.y.slice(),
      u: frame.u.slice(),
      v: frame.v.slice(),
      width: frame.width ?? this.width,
      height: frame.height ?? this.visibleHeight(),
      pts: performance.now()
    };
    this.turbo?.pushDecodedFrame(nextFrame);
  }

  private bindDecoderEvents(decoder: Jv4VideoDecoder) {
    decoder.on('videoCodecInfo', (info) => {
      this.width = info.width || this.width;
      this.height = info.height || this.height;
      this.options.onStatus?.(`已获取视频参数 ${this.width}x${this.height}`);
    });
    decoder.on('videoFrame', (frame) => this.handleDecodedFrame(frame));
    decoder.on('decoded', () => {
      if (!this.options.preferDirectWorkerCanvas || this.destroyed) return;
      this.decodedFrames += 1;
      this.profiler?.mark('decoded');
    });
    decoder.on('rendered', (info) => {
      if (!this.options.preferDirectWorkerCanvas || this.destroyed) return;
      this.profiler?.mark('rendered');
      if (typeof info.costMs === 'number') this.profiler?.addRenderCost(info.costMs);
      if (typeof info.dropped === 'number' && info.dropped > 0) this.profiler?.addDropped(info.dropped);
      if (!this.firstFrameSeen) {
        this.firstFrameSeen = true;
        this.options.onStatus?.('真实 H265 正在播放', true);
      }
    });
    decoder.on('error', (error) => {
      const message = error instanceof Error ? error.message : 'WASM 解码错误';
      this.options.onError?.(message);
      this.options.onStatus?.('WASM 解码恢复中...', false);
    });
  }

  private shouldOutputYuvFrames() {
    return !this.options.preferDirectWorkerCanvas && !this.options.preferWorkerRender;
  }

  private shouldDropUntilKeyFrame(chunk: EncodedVideoChunkInit) {
    if (!this.waitingForKeyFrame) return false;
    if (chunk.type === 'key') {
      this.waitingForKeyFrame = false;
      this.options.onStatus?.('关键帧已到达，开始稳定解码...', true);
      return false;
    }

    const waitedMs = this.keyFrameWaitStartedAt > 0 ? performance.now() - this.keyFrameWaitStartedAt : 0;
    if (waitedMs > 8_000) {
      this.waitingForKeyFrame = false;
      this.options.onStatus?.('关键帧等待超时，尝试直接解码...', false);
      return false;
    }
    this.options.onStatus?.('等待关键帧，避免彩色块和参考帧错误...');
    return true;
  }

  private visibleHeight() {
    return this.options.height ?? this.height;
  }
}

function normalizeDecoderConfig(config: VideoDecoderConfig, format: 'avcc' | 'annexb'): VideoDecoderConfig {
  if (format !== 'annexb') return config;
  const { description: _description, ...rest } = config;
  return rest;
}

function loadJv4(): Promise<Jv4Module> {
  loadingJv4 ??= import(/* @vite-ignore */ vendorModuleUrl) as Promise<Jv4Module>;
  return loadingJv4;
}

function isYuvFrame(value: unknown): value is YuvLikeFrame {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'y' in value &&
    'u' in value &&
    'v' in value
  );
}
