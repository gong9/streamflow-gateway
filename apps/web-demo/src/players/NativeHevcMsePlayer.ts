import { H265ClientStats } from './H265DirectPlayer';

export interface NativeHevcMseHandle {
  destroy(): void;
}

const HEVC_MIME_CANDIDATES = [
  'video/mp4; codecs="hvc1.1.6.L120.B0"',
  'video/mp4; codecs="hev1.1.6.L120.B0"',
  'video/mp4; codecs="hvc1"',
  'video/mp4; codecs="hev1"'
];

export function canTryNativeHevcMse() {
  return import.meta.env.VITE_ENABLE_NATIVE_HEVC_MSE !== '0'
    && typeof MediaSource !== 'undefined'
    && typeof fetch !== 'undefined'
    && Boolean(pickSupportedHevcMime());
}

export function startNativeHevcMsePlayer(
  video: HTMLVideoElement,
  fmp4Url: string,
  onStatus: (text: string, ok?: boolean) => void,
  onFallback: (reason: string) => void,
  onStats?: (stats: H265ClientStats) => void
): NativeHevcMseHandle {
  const supportedMime = pickSupportedHevcMime();
  if (!supportedMime) {
    onFallback('浏览器不支持 H265 原生硬解');
    return { destroy() {} };
  }

  let destroyed = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let mediaSource: MediaSource | undefined;
  let sourceBuffer: SourceBuffer | undefined;
  let objectUrl = '';
  let statsTimer = 0;
  let bytes = 0;
  let lastBytes = 0;
  let lastStatsAt = performance.now();
  let lastVideoTime = 0;
  let renderedFrames = 0;
  const queue: Uint8Array[] = [];

  const setStatus = (text: string, ok?: boolean) => {
    if (!destroyed) onStatus(text, ok);
  };

  const fail = (reason: string) => {
    if (!destroyed) onFallback(reason);
  };

  const startupTimer = window.setTimeout(() => {
    if (!destroyed && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      fail('H265 原生硬解首帧超时');
    }
  }, 18_000);

  void start().catch((err) => {
    fail(err instanceof Error ? err.message : 'H265 原生硬解启动失败');
  });

  async function start() {
    setStatus('正在尝试原生 H265 硬解...');
    mediaSource = new MediaSource();
    objectUrl = URL.createObjectURL(mediaSource);
    video.src = objectUrl;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    await once(mediaSource, 'sourceopen');
    if (destroyed || !mediaSource || mediaSource.readyState !== 'open') return;

    sourceBuffer = mediaSource.addSourceBuffer(supportedMime!);
    sourceBuffer.mode = 'segments';
    sourceBuffer.addEventListener('updateend', flush);
    sourceBuffer.addEventListener('error', () => fail('H265 原生硬解缓冲失败'));

    video.addEventListener('playing', markPlaying);
    video.addEventListener('loadeddata', markPlaying);
    video.addEventListener('error', () => fail('H265 原生 video 播放失败'));

    const response = await fetch(fmp4Url, { cache: 'no-store' });
    if (!response.ok || !response.body) {
      throw new Error(`H265 fMP4 拉流失败：${response.status}`);
    }
    reader = response.body.getReader();

    statsTimer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.max(1, now - lastStatsAt);
      const bitrateKbps = (bytes - lastBytes) * 8 / elapsed;
      const fps = renderedFrames * 1000 / elapsed;
      onStats?.({
        fps: fps > 0 ? fps : null,
        decodedFps: fps > 0 ? fps : null,
        renderedFps: fps > 0 ? fps : null,
        bitrateKbps,
        droppedFrames: 0,
        frameIntervalP95Ms: null,
        renderCostMs: null,
        queueDepth: queue.length,
        pipeline: 'native-hevc-mse'
      });
      renderedFrames = 0;
      lastBytes = bytes;
      lastStatsAt = now;
    }, 1000);

    while (!destroyed) {
      const result = await reader.read();
      if (result.done) break;
      if (!result.value?.byteLength) continue;
      bytes += result.value.byteLength;
      queue.push(result.value);
      flush();
      await trimBufferedRange();
    }
  }

  function flush() {
    if (!sourceBuffer || sourceBuffer.updating || queue.length === 0) return;
    const chunk = queue.shift();
    if (!chunk) return;
    try {
      sourceBuffer.appendBuffer(chunk as Uint8Array<ArrayBuffer>);
    } catch (err) {
      queue.unshift(chunk);
      if (isQuotaError(err)) {
        void trimBufferedRange();
      } else {
        fail(err instanceof Error ? err.message : 'H265 fMP4 追加失败');
      }
    }
  }

  async function trimBufferedRange() {
    if (!sourceBuffer || sourceBuffer.updating || video.buffered.length === 0) return;
    const currentTime = video.currentTime;
    const start = video.buffered.start(0);
    if (currentTime - start < 20) return;
    try {
      sourceBuffer.remove(start, Math.max(start, currentTime - 8));
      await once(sourceBuffer, 'updateend', 1000).catch(() => undefined);
    } catch {
      // Buffer trimming is best-effort; playback can continue without it.
    }
  }

  function markPlaying() {
    setStatus('正在播放', true);
    if (video.currentTime !== lastVideoTime) {
      renderedFrames += 1;
      lastVideoTime = video.currentTime;
    }
  }

  const frameTimer = window.setInterval(() => {
    if (destroyed) return;
    if (!video.paused && video.currentTime !== lastVideoTime) {
      renderedFrames += 1;
      lastVideoTime = video.currentTime;
    }
  }, 40);

  return {
    destroy() {
      destroyed = true;
      window.clearTimeout(startupTimer);
      window.clearInterval(statsTimer);
      window.clearInterval(frameTimer);
      reader?.cancel().catch(() => undefined);
      if (sourceBuffer) {
        sourceBuffer.removeEventListener('updateend', flush);
      }
      video.removeEventListener('playing', markPlaying);
      video.removeEventListener('loadeddata', markPlaying);
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };
}

function pickSupportedHevcMime() {
  if (typeof MediaSource === 'undefined' || typeof MediaSource.isTypeSupported !== 'function') {
    return null;
  }
  return HEVC_MIME_CANDIDATES.find((mime) => MediaSource.isTypeSupported(mime)) ?? null;
}

function once(target: EventTarget, event: string, timeoutMs = 10_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${event} timeout`));
    }, timeoutMs);
    const handler = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(event, handler);
    };
    target.addEventListener(event, handler, { once: true });
  });
}

function isQuotaError(err: unknown) {
  return err instanceof DOMException && err.name === 'QuotaExceededError';
}
