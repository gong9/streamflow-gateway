import { H265ClientStats } from './H265DirectPlayer';

export interface Jessibuca4SimdHandle {
  destroy(): void;
}

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
  VideoDecoderHard: new () => Jv4VideoDecoder;
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
  on(event: 'error', callback: (error: unknown) => void): void;
}

interface Jv4Renderer {
  writeVideo(frame: VideoFrame | { y: Uint8Array; u: Uint8Array; v: Uint8Array; width: number; height: number }): void;
  close(): void;
}

type PipelineMode = 'webcodecs-hevc' | 'worker-canvas' | 'worker-2d' | 'main-webgl';

interface RenderMetrics {
  renderedFrames: number;
  droppedFrames: number;
  frameIntervalP95Ms: number | null;
  renderCostMs: number | null;
  queueDepth: number | null;
}

interface MeasuredRenderer extends Jv4Renderer {
  takeMetrics(): RenderMetrics;
}

interface YuvFrame {
  y: Uint8Array;
  u: Uint8Array;
  v: Uint8Array;
  width?: number;
  height?: number;
}

const vendorModuleUrl = '/vendor/jessibuca4/jv4-simd.js';
const wasmPath = '/vendor/jessibuca4/videodec_simd.wasm';
let loadingJv4: Promise<Jv4Module> | undefined;

export function canTryJessibuca4Simd() {
  return typeof WebAssembly === 'object';
}

function canUseWorkerSimd() {
  return typeof Worker !== 'undefined' && typeof VideoFrame !== 'undefined';
}

function canUseWorkerCanvas() {
  return (import.meta.env.VITE_ENABLE_WORKER_CANVAS === '1')
    && canUseWorkerSimd()
    && typeof OffscreenCanvas !== 'undefined'
    && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;
}

function canUseHardDecoder() {
  return (import.meta.env.VITE_ENABLE_HEVC_HARD_DECODER === '1')
    && typeof VideoDecoder !== 'undefined'
    && typeof EncodedVideoChunk !== 'undefined';
}

export function startJessibuca4SimdPlayer(
  container: HTMLDivElement,
  rawUrl: string,
  onStatus: (text: string, ok?: boolean) => void,
  onFallback: (reason: string) => void,
  onStats?: (stats: H265ClientStats) => void,
  options?: { preferVideoFrameRenderer?: boolean }
): Jessibuca4SimdHandle {
  let destroyed = false;
  let decodedFrames = 0;
  let firstFrameSeen = false;
  let lastBytes = 0;
  let lastStatsAt = performance.now();
  let conn: Jv4Connection | undefined;
  let decoder: Jv4VideoDecoder | undefined;
  let renderer: Jv4Renderer | undefined;
  let metricsRenderer: MeasuredRenderer | undefined;
  let activeCanvas: HTMLCanvasElement | undefined;
  let activePipeline: PipelineMode = 'main-webgl';
  let statsTimer = 0;
  let startupTimer = 0;
  let streamAbort = new AbortController();
  let currentWidth = 0;
  let currentHeight = 0;
  let videoChunks = 0;
  let audioChunks = 0;

  const fail = (reason: string) => {
    if (!destroyed) {
      console.warn(
        `[streamflow] Jessibuca4 SIMD fallback: ${reason}; firstFrame=${firstFrameSeen}; videoChunks=${videoChunks}; audioChunks=${audioChunks}; size=${currentWidth}x${currentHeight}`
      );
      onFallback(reason);
    }
  };

  const setStatus = (text: string, ok?: boolean) => {
    if (!destroyed) onStatus(text, ok);
  };

  void start().catch((err) => {
    fail(err instanceof Error ? err.message : 'Jessibuca4 SIMD 播放失败');
  });

  async function start() {
    if (!canTryJessibuca4Simd()) {
      fail('浏览器不支持 SIMD 播放链');
      return;
    }

    setStatus('正在启动浏览器 SIMD 解码...');
    const jv4 = await loadJv4();
    const browserPipelines: PipelineMode[] = options?.preferVideoFrameRenderer && canUseWorkerSimd()
      ? ['worker-2d', 'main-webgl']
      : ['main-webgl', ...(canUseWorkerSimd() ? ['worker-2d' as const] : [])];
    const pipelines: PipelineMode[] = [
      ...(canUseHardDecoder() ? ['webcodecs-hevc' as const] : []),
      ...(canUseWorkerCanvas() ? ['worker-canvas' as const] : []),
      ...browserPipelines
    ];

    let lastError: unknown;
    for (const pipeline of pipelines) {
      try {
        await startPipeline(jv4, pipeline);
        return;
      } catch (err) {
        lastError = err;
        if (destroyed || firstFrameSeen) throw err;
        console.warn(`[streamflow] Jessibuca4 ${pipeline} failed, trying next pipeline`, err);
        resetPipeline();
        setStatus('正在切换浏览器兼容解码...');
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Jessibuca4 SIMD 播放失败');
  }

  function resetPipeline() {
    safeClose(() => conn?.close());
    safeClose(() => decoder?.close());
    safeClose(() => renderer?.close());
    conn = undefined;
    decoder = undefined;
    renderer = undefined;
    metricsRenderer = undefined;
    streamAbort.abort();
    streamAbort = new AbortController();
    activeCanvas = undefined;
    container.innerHTML = '';
  }

  async function startPipeline(jv4: Jv4Module, pipeline: PipelineMode) {
    activePipeline = pipeline;
    activeCanvas = createPlaybackCanvas(container);
    const useWorkerCanvas = pipeline === 'worker-canvas';
    const useWorkerDecoder = pipeline === 'worker-canvas' || pipeline === 'worker-2d';

    if (useWorkerCanvas) {
      syncCanvasViewport(activeCanvas);
    } else {
      const rawRenderer = pipeline === 'main-webgl' ? new WebGlYuvRenderer(activeCanvas) : new VideoFrameCanvasRenderer(activeCanvas);
      metricsRenderer = pipeline === 'main-webgl'
        ? new CopyPacedRenderer(rawRenderer)
        : new MetricsRenderer(rawRenderer);
      renderer = metricsRenderer;
    }

    decoder = pipeline === 'webcodecs-hevc'
      ? new jv4.VideoDecoderHard()
      : new jv4.VideoDecoderSoftSIMD({
      // worker-canvas 会把 canvas 转到 Worker 内直接绘制，避免 VideoFrame 回主线程再画。
        yuvMode: pipeline === 'main-webgl',
        workerMode: useWorkerDecoder,
        canvas: useWorkerCanvas ? activeCanvas : undefined,
        wasmPath
      });

    decoder.on('videoCodecInfo', (info: { width: number; height: number }) => {
      currentWidth = info.width;
      currentHeight = info.height;
      if (activeCanvas && !useWorkerCanvas) {
        activeCanvas.width = info.width;
        activeCanvas.height = info.height;
      }
    });

    decoder.on('videoFrame', (frame: unknown) => {
      if (destroyed) return;
      decodedFrames += 1;
      const wasWaitingForFirstFrame = !firstFrameSeen;
      firstFrameSeen = true;
      if (wasWaitingForFirstFrame) setStatus('正在播放', true);
      if (isYuvFrame(frame)) {
        renderer?.writeVideo({
          y: frame.y,
          u: frame.u,
          v: frame.v,
          width: frame.width ?? currentWidth,
          height: frame.height ?? currentHeight
        });
      } else if (frame instanceof VideoFrame) {
        renderer?.writeVideo(frame);
      }
    });

    decoder.on('error', (err: unknown) => {
      setStatus('SIMD 解码恢复中...', false);
      console.warn('[streamflow] Jessibuca4 SIMD decoder error', err);
    });

    await decoder.initialize();

    conn = new jv4.HttpConnection(rawUrl, {
      reconnectCount: 2,
      requestInit: { cache: 'no-store' }
    });
    await conn.connect();

    // Use avcc/hvcc packet format and let the SIMD decoder handle codec config.
    // This avoids fragile H265 parameter-set conversion in the demuxer.
    const demuxer = new jv4.FlvDemuxer(conn, jv4.DemuxMode.PULL, 'avcc');
    demuxer.on(jv4.DemuxEvent.VIDEO_ENCODER_CONFIG_CHANGED, (value: unknown) => {
      if (destroyed) return;
      const config = value as VideoDecoderConfig;
      decoder?.configure(config);
      setStatus('正在解码 H265...');
    });
    demuxer.on(jv4.DemuxEvent.DEMUX_ERROR, (err: unknown) => {
      fail(err instanceof Error ? err.message : 'FLV 解封装失败');
    });

    void demuxer.videoReadable?.pipeTo(new WritableStream<EncodedVideoChunkInit>({
      write(chunk) {
        if (destroyed) return;
        videoChunks += 1;
        lastBytes += byteLengthOf(chunk.data);
        if (decoder?.config) {
          decoder.decode(chunk);
          if (useWorkerCanvas) {
            decodedFrames += 1;
          }
          if (useWorkerCanvas && !firstFrameSeen) {
            firstFrameSeen = true;
            setStatus('正在播放', true);
          }
        }
      }
    }), { signal: streamAbort.signal }).catch((err) => {
      if (!destroyed) fail(err instanceof Error ? err.message : 'SIMD 读取失败');
    });

    // PULL 模式需要音视频两个 reader 都被消费，否则 demuxer 会等另一路导致视频不流动。
    void demuxer.audioReadable?.pipeTo(new WritableStream<EncodedAudioChunkInit>({
      write() {
        audioChunks += 1;
        // 第一版先不在浏览器输出音频，只 drain 掉音频包保证视频持续解封装。
      }
    }), { signal: streamAbort.signal }).catch((err) => {
      if (!destroyed) console.warn('[streamflow] Jessibuca4 SIMD audio drain stopped', err);
    });

    statsTimer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.max(1, now - lastStatsAt);
      const decodedFps = decodedFrames * 1000 / elapsed;
      const renderMetrics = useWorkerCanvas ? {
        renderedFrames: decodedFrames,
        droppedFrames: 0,
        frameIntervalP95Ms: null,
        renderCostMs: null,
        queueDepth: null
      } : metricsRenderer?.takeMetrics() ?? {
        renderedFrames: 0,
        droppedFrames: 0,
        frameIntervalP95Ms: null,
        renderCostMs: null,
        queueDepth: null
      };
      const renderedFps = renderMetrics.renderedFrames * 1000 / elapsed;
      const bitrateKbps = lastBytes * 8 / elapsed;
      onStats?.({
        fps: renderedFps,
        bitrateKbps,
        decodedFps,
        renderedFps,
        droppedFrames: renderMetrics.droppedFrames,
        frameIntervalP95Ms: renderMetrics.frameIntervalP95Ms,
        renderCostMs: renderMetrics.renderCostMs,
        queueDepth: renderMetrics.queueDepth,
        pipeline: activePipeline
      });

      decodedFrames = 0;
      lastBytes = 0;
      lastStatsAt = now;
    }, 1000);

    startupTimer = window.setTimeout(() => {
      if (!destroyed && !firstFrameSeen) fail('浏览器 SIMD 首帧超时');
    }, 25_000);
  }

  return {
    destroy() {
      destroyed = true;
      window.clearInterval(statsTimer);
      window.clearTimeout(startupTimer);
      streamAbort.abort();
      conn?.close();
      safeClose(() => decoder?.close());
      safeClose(() => renderer?.close());
      container.innerHTML = '';
    }
  };
}

function createPlaybackCanvas(container: HTMLDivElement) {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);
  return canvas;
}

function syncCanvasViewport(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round((canvas.clientWidth || 1280) * ratio));
  const height = Math.max(1, Math.round((canvas.clientHeight || 720) * ratio));
  canvas.width = width;
  canvas.height = height;
}

function isYuvFrame(value: unknown): value is YuvFrame {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'y' in value &&
    'u' in value &&
    'v' in value
  );
}

function loadJv4(): Promise<Jv4Module> {
  loadingJv4 ??= import(/* @vite-ignore */ vendorModuleUrl) as Promise<Jv4Module>;
  return loadingJv4;
}

function safeClose(fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.warn('[streamflow] Jessibuca4 SIMD close ignored', err);
  }
}

type RenderableFrame = VideoFrame | { y: Uint8Array; u: Uint8Array; v: Uint8Array; width: number; height: number };

class MetricsRenderer implements Jv4Renderer {
  private renderedFrames = 0;
  private droppedFrames = 0;
  private renderCosts: number[] = [];
  private frameIntervals: number[] = [];
  private lastRenderAt = 0;
  private closed = false;

  constructor(private readonly inner: Jv4Renderer) {}

  writeVideo(frame: RenderableFrame) {
    if (this.closed) {
      closeFrame(frame);
      return;
    }

    const now = performance.now();
    const startedAt = performance.now();
    this.inner.writeVideo(frame);
    this.renderCosts.push(performance.now() - startedAt);
    this.renderedFrames += 1;
    if (this.lastRenderAt > 0) {
      this.frameIntervals.push(now - this.lastRenderAt);
    }
    this.lastRenderAt = now;
  }

  takeMetrics(): RenderMetrics {
    const metrics: RenderMetrics = {
      renderedFrames: this.renderedFrames,
      droppedFrames: this.droppedFrames,
      frameIntervalP95Ms: percentile(this.frameIntervals, 0.95),
      renderCostMs: average(this.renderCosts),
      queueDepth: 0
    };
    this.renderedFrames = 0;
    this.droppedFrames = 0;
    this.renderCosts = [];
    this.frameIntervals = [];
    return metrics;
  }

  close() {
    this.closed = true;
    this.inner.close();
  }
}

class CopyPacedRenderer implements Jv4Renderer {
  private readonly queue: RenderableFrame[] = [];
  private readonly maxQueueSize = 3;
  private readonly frameIntervalMs = 1000 / 25;
  private timer = 0;
  private renderedFrames = 0;
  private droppedFrames = 0;
  private renderCosts: number[] = [];
  private frameIntervals: number[] = [];
  private lastRenderAt = 0;
  private closed = false;

  constructor(private readonly inner: Jv4Renderer) {
    this.timer = window.setInterval(() => this.flush(), this.frameIntervalMs);
  }

  writeVideo(frame: RenderableFrame) {
    if (this.closed) {
      closeFrame(frame);
      return;
    }

    const copiedFrame = copyRenderableFrame(frame);
    closeFrame(frame);
    this.queue.push(copiedFrame);

    while (this.queue.length > this.maxQueueSize) {
      const dropped = this.queue.shift();
      if (dropped) {
        closeFrame(dropped);
        this.droppedFrames += 1;
      }
    }
  }

  takeMetrics(): RenderMetrics {
    const metrics: RenderMetrics = {
      renderedFrames: this.renderedFrames,
      droppedFrames: this.droppedFrames,
      frameIntervalP95Ms: percentile(this.frameIntervals, 0.95),
      renderCostMs: average(this.renderCosts),
      queueDepth: this.queue.length
    };
    this.renderedFrames = 0;
    this.droppedFrames = 0;
    this.renderCosts = [];
    this.frameIntervals = [];
    return metrics;
  }

  close() {
    this.closed = true;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    while (this.queue.length) {
      const frame = this.queue.shift();
      if (frame) closeFrame(frame);
    }
    this.inner.close();
  }

  private flush() {
    if (this.closed || this.queue.length === 0) return;
    const frame = this.queue.shift();
    if (!frame) return;

    const now = performance.now();
    const startedAt = performance.now();
    this.inner.writeVideo(frame);
    this.renderCosts.push(performance.now() - startedAt);
    this.renderedFrames += 1;
    if (this.lastRenderAt > 0) {
      this.frameIntervals.push(now - this.lastRenderAt);
    }
    this.lastRenderAt = now;
  }
}

class PacedRenderer implements Jv4Renderer {
  private readonly queue: RenderableFrame[] = [];
  private readonly maxQueueSize = 5;
  private readonly frameIntervalMs = 1000 / 25;
  private timer = 0;
  private lastRenderAt = 0;
  private nextRenderAt = 0;
  private renderedFrames = 0;
  private droppedFrames = 0;
  private renderCosts: number[] = [];
  private frameIntervals: number[] = [];
  private closed = false;

  constructor(private readonly inner: Jv4Renderer) {}

  writeVideo(frame: RenderableFrame) {
    if (this.closed) {
      closeFrame(frame);
      return;
    }

    this.queue.push(frame);
    while (this.queue.length > this.maxQueueSize) {
      const dropped = this.queue.shift();
      if (dropped) {
        closeFrame(dropped);
        this.droppedFrames += 1;
      }
    }

    this.schedule();
  }

  takeMetrics(): RenderMetrics {
    const metrics: RenderMetrics = {
      renderedFrames: this.renderedFrames,
      droppedFrames: this.droppedFrames,
      frameIntervalP95Ms: percentile(this.frameIntervals, 0.95),
      renderCostMs: average(this.renderCosts),
      queueDepth: this.queue.length
    };
    this.renderedFrames = 0;
    this.droppedFrames = 0;
    this.renderCosts = [];
    this.frameIntervals = [];
    return metrics;
  }

  close() {
    this.closed = true;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = 0;
    while (this.queue.length) {
      const frame = this.queue.shift();
      if (frame) closeFrame(frame);
    }
    this.inner.close();
  }

  private schedule() {
    if (this.timer || this.closed) return;
    const now = performance.now();
    const delay = this.nextRenderAt > 0 ? Math.max(0, this.nextRenderAt - now) : 0;
    this.timer = window.setTimeout(() => this.flush(), delay);
  }

  private flush() {
    this.timer = 0;
    if (this.closed || this.queue.length === 0) return;

    const frame = this.queue.shift();
    if (!frame) return;

    const now = performance.now();
    const startedAt = performance.now();
    this.inner.writeVideo(frame);
    this.renderCosts.push(performance.now() - startedAt);
    this.renderedFrames += 1;

    if (this.lastRenderAt > 0) {
      this.frameIntervals.push(now - this.lastRenderAt);
    }
    this.lastRenderAt = now;
    this.nextRenderAt = now + this.frameIntervalMs;

    if (this.queue.length > 0) this.schedule();
  }
}

function closeFrame(frame: RenderableFrame) {
  if (frame instanceof VideoFrame) frame.close();
}

function copyRenderableFrame(frame: RenderableFrame): RenderableFrame {
  if (frame instanceof VideoFrame) {
    return typeof frame.clone === 'function' ? frame.clone() : frame;
  }

  return {
    y: new Uint8Array(frame.y),
    u: new Uint8Array(frame.u),
    v: new Uint8Array(frame.v),
    width: frame.width,
    height: frame.height
  };
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

class VideoFrameCanvasRenderer implements Jv4Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private viewportKey = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });
    if (!ctx) throw new Error('浏览器 Canvas 渲染不可用');
    this.ctx = ctx;
  }

  writeVideo(frame: VideoFrame | { y: Uint8Array; u: Uint8Array; v: Uint8Array; width: number; height: number }) {
    if (!(frame instanceof VideoFrame)) return;
    this.draw(frame);
  }

  close() {
    // VideoFrame ownership is handled by writeVideo/draw. Nothing else to release.
  }

  private draw(frame: VideoFrame) {
    this.syncViewport();
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const frameWidth = frame.displayWidth || frame.codedWidth;
    const frameHeight = frame.displayHeight || frame.codedHeight;
    const canvasRatio = canvasWidth / canvasHeight;
    const frameRatio = frameWidth / frameHeight;

    let drawWidth = canvasWidth;
    let drawHeight = canvasHeight;
    let drawX = 0;
    let drawY = 0;
    if (frameRatio > canvasRatio) {
      drawHeight = canvasWidth / frameRatio;
      drawY = (canvasHeight - drawHeight) / 2;
    } else {
      drawWidth = canvasHeight * frameRatio;
      drawX = (canvasWidth - drawWidth) / 2;
    }

    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    this.ctx.drawImage(frame, drawX, drawY, drawWidth, drawHeight);
    frame.close();
  }

  private syncViewport() {
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const displayHeight = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    const key = `${displayWidth}x${displayHeight}`;
    if (this.viewportKey === key) return;
    this.viewportKey = key;
    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;
  }
}

class WebGlYuvRenderer implements Jv4Renderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly positionLocation: number;
  private readonly texCoordLocation: number;
  private readonly yTexture: WebGLTexture;
  private readonly uTexture: WebGLTexture;
  private readonly vTexture: WebGLTexture;
  private readonly yUniform: WebGLUniformLocation | null;
  private readonly uUniform: WebGLUniformLocation | null;
  private readonly vUniform: WebGLUniformLocation | null;
  private readonly positionBuffer: WebGLBuffer;
  private readonly texCoordBuffer: WebGLBuffer;
  private readonly fallback2d: CanvasRenderingContext2D | null;
  private viewportKey = '';
  private geometryKey = '';
  private yPlaneKey = '';
  private uPlaneKey = '';
  private vPlaneKey = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('浏览器 WebGL 渲染不可用');
    this.gl = gl;
    this.fallback2d = null;
    this.program = this.createProgram();
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
    this.yUniform = gl.getUniformLocation(this.program, 'y_texture');
    this.uUniform = gl.getUniformLocation(this.program, 'u_texture');
    this.vUniform = gl.getUniformLocation(this.program, 'v_texture');
    this.yTexture = this.createTexture();
    this.uTexture = this.createTexture();
    this.vTexture = this.createTexture();
    this.positionBuffer = this.createBuffer(new Float32Array(8));
    this.texCoordBuffer = this.createBuffer(new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      1, 0
    ]));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.useProgram(this.program);
    gl.uniform1i(this.yUniform, 0);
    gl.uniform1i(this.uUniform, 1);
    gl.uniform1i(this.vUniform, 2);
  }

  writeVideo(frame: VideoFrame | { y: Uint8Array; u: Uint8Array; v: Uint8Array; width: number; height: number }) {
    if (frame instanceof VideoFrame) {
      this.fallback2d?.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
      frame.close();
      return;
    }

    if (!frame.width || !frame.height) return;
    const gl = this.gl;
    this.syncViewport();
    this.syncContainGeometry(frame.width, frame.height);

    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.texCoordLocation);
    gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    this.yPlaneKey = this.uploadPlane(this.yTexture, 0, frame.width, frame.height, frame.y, this.yPlaneKey);
    this.uPlaneKey = this.uploadPlane(this.uTexture, 1, frame.width >> 1, frame.height >> 1, frame.u, this.uPlaneKey);
    this.vPlaneKey = this.uploadPlane(this.vTexture, 2, frame.width >> 1, frame.height >> 1, frame.v, this.vPlaneKey);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  close() {
    const gl = this.gl;
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.texCoordBuffer);
    gl.deleteTexture(this.yTexture);
    gl.deleteTexture(this.uTexture);
    gl.deleteTexture(this.vTexture);
    gl.deleteProgram(this.program);
  }

  private createProgram() {
    const gl = this.gl;
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, `
      attribute vec4 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = a_position;
        v_texCoord = a_texCoord;
      }
    `);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D y_texture;
      uniform sampler2D u_texture;
      uniform sampler2D v_texture;
      varying vec2 v_texCoord;
      void main() {
        float y = texture2D(y_texture, v_texCoord).r;
        float u = texture2D(u_texture, v_texCoord).r - 0.5;
        float v = texture2D(v_texture, v_texCoord).r - 0.5;
        gl_FragColor = vec4(
          y + 1.402 * v,
          y - 0.344136 * u - 0.714136 * v,
          y + 1.772 * u,
          1.0
        );
      }
    `);
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL program 创建失败');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'WebGL program 链接失败');
    }
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return program;
  }

  private compileShader(type: number, source: string) {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error('WebGL shader 创建失败');
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) || 'WebGL shader 编译失败');
    }
    return shader;
  }

  private createTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('WebGL texture 创建失败');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  private createBuffer(data: Float32Array) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('WebGL buffer 创建失败');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buffer;
  }

  private syncViewport() {
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const displayHeight = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    const key = `${displayWidth}x${displayHeight}`;
    if (this.viewportKey === key) return;
    this.viewportKey = key;
    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;
    this.gl.viewport(0, 0, displayWidth, displayHeight);
  }

  private syncContainGeometry(videoWidth: number, videoHeight: number) {
    const canvasRatio = this.canvas.width / this.canvas.height;
    const videoRatio = videoWidth / videoHeight;
    const key = `${this.canvas.width}x${this.canvas.height}:${videoWidth}x${videoHeight}`;
    if (this.geometryKey === key) return;
    this.geometryKey = key;

    let scaleX = 1;
    let scaleY = 1;
    if (videoRatio > canvasRatio) {
      scaleY = canvasRatio / videoRatio;
    } else {
      scaleX = videoRatio / canvasRatio;
    }

    const positions = new Float32Array([
      -scaleX, -scaleY,
      scaleX, -scaleY,
      -scaleX, scaleY,
      scaleX, scaleY
    ]);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.DYNAMIC_DRAW);
  }

  private uploadPlane(texture: WebGLTexture, unit: number, width: number, height: number, data: Uint8Array, previousKey: string) {
    const gl = this.gl;
    const key = `${width}x${height}`;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (previousKey !== key) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.LUMINANCE,
        width,
        height,
        0,
        gl.LUMINANCE,
        gl.UNSIGNED_BYTE,
        data
      );
      return key;
    }
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      width,
      height,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      data
    );
    return key;
  }
}

function byteLengthOf(data: ArrayBuffer | SharedArrayBuffer | ArrayBufferView | undefined): number {
  if (!data) return 0;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer) {
    return data.byteLength;
  }
  return data.byteLength;
}
