export interface H265DirectHandle {
  destroy(): void;
}

export interface H265ClientStats {
  fps: number | null;
  bitrateKbps: number | null;
  decodedFps?: number | null;
  renderedFps?: number | null;
  droppedFrames?: number;
  frameIntervalP95Ms?: number | null;
  renderCostMs?: number | null;
  queueDepth?: number | null;
  pipeline?: string;
}

declare global {
  interface Window {
    Jessibuca?: new (options: Record<string, unknown>) => {
      play(url: string): Promise<void> | void;
      destroy(): void;
      on?(event: string, callback: (...args: unknown[]) => void): void;
    };
  }
}

const scriptUrl = import.meta.env.VITE_JESSIBUCA_SCRIPT_URL as string | undefined;
const decoderUrl = import.meta.env.VITE_JESSIBUCA_DECODER_URL as string | undefined;
const defaultScriptUrl = '/vendor/jessibuca/jessibuca.js';
const defaultDecoderUrl = '/vendor/jessibuca/decoder.js';
let loadingScript: Promise<void> | undefined;

export function canTryH265Direct() {
  return Boolean(window.Jessibuca || scriptUrl || defaultScriptUrl);
}

export function startH265DirectPlayer(
  container: HTMLDivElement,
  rawUrl: string,
  onStatus: (text: string, ok?: boolean) => void,
  onFallback: (reason: string) => void,
  onStats?: (stats: H265ClientStats) => void
): H265DirectHandle {
  let destroyed = false;
  let player: InstanceType<NonNullable<typeof window.Jessibuca>> | undefined;
  let firstFrameSeen = false;
  const firstFrameTimer = window.setTimeout(() => {
    if (!destroyed && !firstFrameSeen) onFallback('H265 原始播放超时');
  }, 25_000);

  container.innerHTML = '';

  const setStatus = (text: string, ok?: boolean) => {
    if (!destroyed) onStatus(text, ok);
  };

  const fail = (reason: string) => {
    if (!destroyed) onFallback(reason);
  };

  void loadJessibuca().then(async () => {
    if (destroyed) return;
    if (!window.Jessibuca) {
      fail('H265 播放器未配置');
      return;
    }

    await nextAnimationFrame();
    if (destroyed) return;

    setStatus('正在尝试原始 H265...');
    player = new window.Jessibuca({
      container,
      url: rawUrl,
      videoBuffer: 0.2,
      videoBufferDelay: 0.5,
      isResize: true,
      loadingText: '正在加载画面',
      debug: false,
      decoder: decoderUrl || defaultDecoderUrl,
      hasAudio: false,
      isFlv: true,
      useWCS: false,
      useMSE: false,
      useOffscreen: true,
      forceNoOffscreen: false,
      autoWasm: true,
      heartTimeout: 10,
      loadingTimeout: 10,
      heartTimeoutReplay: true,
      heartTimeoutReplayTimes: -1,
      loadingTimeoutReplay: true,
      loadingTimeoutReplayTimes: 3,
      wasmDecodeErrorReplay: true,
      operateBtns: {
        fullscreen: false,
        screenshot: false,
        play: false,
        audio: false,
        record: false
      }
    });

    player.on?.('start', () => {
      firstFrameSeen = true;
      setStatus('正在播放', true);
    });
    player.on?.('play', () => {
      if (!firstFrameSeen) setStatus('正在打开原始 H265...');
    });
    player.on?.('playing', () => {
      firstFrameSeen = true;
      setStatus('正在播放', true);
    });
    player.on?.('videoInfo', () => {
      firstFrameSeen = true;
      setStatus('正在播放', true);
    });
    player.on?.('stats', (stats) => {
      const nextStats = normalizeStats(stats);
      if (nextStats.fps !== null && nextStats.fps > 0) {
        firstFrameSeen = true;
        setStatus('正在播放', true);
      }
      onStats?.(nextStats);
    });
    player.on?.('error', (error) => {
      setStatus(`H265 原始播放恢复中${error ? ` (${String(error)})` : ''}`, false);
    });
    player.on?.('timeout', () => {
      setStatus('H265 原始播放等待数据...', false);
    });
    player.on?.('loadingTimeout', () => {
      setStatus('H265 原始播放加载中...', false);
    });
    player.on?.('delayTimeout', () => {
      setStatus('H265 原始播放自动恢复中...', false);
    });

    try {
      void Promise.resolve(player.play(rawUrl)).catch((err) => {
        fail(err instanceof Error ? err.message : 'H265 原始播放失败');
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : 'H265 原始播放异常');
    }
  }).catch((err) => {
    fail(err instanceof Error ? err.message : 'H265 播放器加载失败');
  });

  return {
    destroy() {
      destroyed = true;
      window.clearTimeout(firstFrameTimer);
      player?.destroy();
      container.innerHTML = '';
    }
  };
}

function normalizeStats(value: unknown): H265ClientStats {
  const stats = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const fps = toFiniteNumber(stats.fps);
  const videoBps = toFiniteNumber(stats.vbps);
  const audioBps = toFiniteNumber(stats.abps);
  const bitrateKbps = videoBps !== null || audioBps !== null
    ? ((videoBps ?? 0) + (audioBps ?? 0)) / 1000
    : null;
  return {
    fps,
    bitrateKbps,
    decodedFps: fps,
    renderedFps: fps,
    droppedFrames: toFiniteNumber(stats.dropFrame) ?? toFiniteNumber(stats.dropFrames) ?? undefined,
    pipeline: 'jessibuca-full'
  };
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function loadJessibuca(): Promise<void> {
  if (window.Jessibuca) return Promise.resolve();
  const nextScriptUrl = scriptUrl || defaultScriptUrl;
  if (!nextScriptUrl) return Promise.reject(new Error('H265 播放器未配置'));
  if (loadingScript) return loadingScript;

  loadingScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = nextScriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('H265 播放器加载失败'));
    document.head.appendChild(script);
  });
  return loadingScript;
}
