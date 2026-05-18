import { H265ClientStats } from './H265DirectPlayer';
import { H265WasmDecodeRuntime } from './experimental/decode/H265WasmDecodeRuntime';
import { TurboPlaybackMetrics } from './experimental/types';

export interface H265OptimizedWasmHandle {
  destroy(): void;
}

interface SourceInfo {
  width?: number | null;
  height?: number | null;
}

export function canTryH265OptimizedWasm() {
  return typeof WebAssembly === 'object'
    && typeof Worker !== 'undefined'
    && typeof VideoFrame !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined';
}

export function startH265OptimizedWasmPlayer(
  canvas: HTMLCanvasElement,
  rawUrl: string,
  sourceInfo: SourceInfo | undefined,
  onStatus: (text: string, ok?: boolean) => void,
  onFallback: (reason: string) => void,
  onStats?: (stats: H265ClientStats) => void
): H265OptimizedWasmHandle {
  let destroyed = false;
  let firstFrameSeen = false;
  let runtime: H265WasmDecodeRuntime | null = null;

  const debug = (message: string, extra?: unknown) => {
    if (!shouldLogDebug()) return;
    if (extra === undefined) {
      console.info(`[H265OptimizedWasm] ${message}`);
    } else {
      console.info(`[H265OptimizedWasm] ${message}`, extra);
    }
  };

  const startupTimer = window.setTimeout(() => {
    if (!destroyed && !firstFrameSeen) {
      debug('first frame timeout', { rawUrl });
      onFallback('优化 WASM 软解首帧超时');
    }
  }, 25_000);

  if (!canTryH265OptimizedWasm()) {
    window.clearTimeout(startupTimer);
    onFallback('当前浏览器不支持优化 WASM 软解');
    return { destroy: () => undefined };
  }

  const safeStatus = (message: string, ok?: boolean) => {
    if (destroyed) return;
    debug(message, { ok });
    if (ok === true && isPlaybackStartedStatus(message)) firstFrameSeen = true;
    onStatus(message, ok);
  };

  onStats?.({
    fps: null,
    bitrateKbps: null,
    pipeline: 'optimized-wasm-starting'
  });
  debug('start', { rawUrl, sourceInfo });

  runtime = new H265WasmDecodeRuntime({
    rawUrl,
    canvas,
    width: sourceInfo?.width,
    height: sourceInfo?.height,
    onStatus: safeStatus,
    onMetrics: (metrics) => {
      if (destroyed) return;
      if ((metrics.renderedFps ?? 0) > 0 || (metrics.decodedFps ?? 0) > 0) {
        firstFrameSeen = true;
      }
      onStats?.(toH265Stats(metrics));
    },
    onError: (message) => {
      if (!destroyed) safeStatus(message, false);
    },
    preferWorkerRender: true,
    preferDecodeScheduler: true,
    preferLowLatencyWaterline: true,
    preferPackedYuv: false,
    preferDirectWorkerCanvas: false
  });

  safeStatus('正在启动优化 WASM 软解...');
  void runtime.start().catch((err) => {
    if (!destroyed) {
      const message = err instanceof Error ? err.message : '优化 WASM 软解启动失败';
      debug('start failed', err);
      onFallback(message);
    }
  });

  return {
    destroy() {
      destroyed = true;
      window.clearTimeout(startupTimer);
      runtime?.destroy();
      runtime = null;
    }
  };
}

function isPlaybackStartedStatus(message: string) {
  return message.includes('正在播放') || message.includes('缓冲完成');
}

function shouldLogDebug() {
  if (import.meta.env.DEV || import.meta.env.VITE_SHOW_DIAGNOSTICS === '1') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === '1';
}

function toH265Stats(metrics: TurboPlaybackMetrics): H265ClientStats {
  const fps = metrics.renderedFps ?? metrics.decodedFps ?? null;
  return {
    fps,
    bitrateKbps: null,
    decodedFps: metrics.decodedFps,
    renderedFps: metrics.renderedFps,
    droppedFrames: metrics.droppedFrames,
    frameIntervalP95Ms: metrics.frameP95Ms,
    renderCostMs: metrics.renderCostMs,
    queueDepth: metrics.queueDepth,
    pipeline: `optimized-wasm-${metrics.mode}`
  };
}
