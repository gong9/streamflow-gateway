import { H265ClientStats } from './H265DirectPlayer';
import { HttpConnection } from 'jv4-connection';
import { DemuxEvent, DemuxMode, FlvDemuxer } from 'jv4-demuxer';

export interface H265PthreadsHandle {
  destroy(): void;
}

type H265WebPlayer = {
  build(config: Record<string, unknown>): boolean;
  release(callback?: () => void): void;
  play(): void;
  pause(): void;
  isPlaying?(): boolean;
  mediaInfo?(): {
    meta?: {
      fps?: number;
      size?: { width?: number; height?: number };
    };
    videoType?: string;
  };
  append265NaluFrame?(chunk: Uint8Array, pts: number): void;
  render_tex?(): void;
  _media_info?: Record<string, unknown>;
  _player_video_core?: string;
  _player_ignore_audio?: boolean;
  _format_type?: string;
  _protocol_type?: string;
  _init_ffdecoder_worker?: () => void;
  _decoder_worker?: Worker;
  _player_wanted_core?: string;
  _wasm_js_uri?: string;
  _wasm_wasm_uri?: string;
  on_ready_show_done_callback?: () => void;
  on_play_time?: (pts: number) => void;
  on_load_caching_callback?: () => void;
  on_finish_cache_callback?: () => void;
  on_error_callback?: (error: unknown) => void;
  video_probe_callback?: (info: unknown) => void;
};

type H265SourceInfo = {
  width?: number | null;
  height?: number | null;
  fps?: number | null;
};

declare global {
  interface Window {
    H265webjsPlayer?: () => H265WebPlayer;
    YLPlayerSupport?: Record<string, unknown>;
  }
}

const vendorBase = '/vendor/h265web';
const scriptUrl = `${vendorBase}/h265web.js`;
const wasmJsUrl = `${vendorBase}/h265web_wasm.js`;
const wasmUrl = `${vendorBase}/h265web_wasm.wasm`;
const extScriptUrl = `${vendorBase}/extjs.js`;
const extWasmJsUrl = `${vendorBase}/extwasm.js`;
const absoluteWasmJsUrl = () => new URL(wasmJsUrl, window.location.href).toString();
const absoluteWasmUrl = () => new URL(wasmUrl, window.location.href).toString();
let loadingScript: Promise<void> | undefined;
let playerSeq = 0;

export function canTryH265Pthreads() {
  return import.meta.env.VITE_ENABLE_H265_PTHREADS !== '0'
    && typeof WebAssembly === 'object'
    && typeof SharedArrayBuffer !== 'undefined'
    && window.crossOriginIsolated === true;
}

export function startH265PthreadsPlayer(
  container: HTMLDivElement,
  rawUrl: string,
  sourceInfo: H265SourceInfo | undefined,
  onStatus: (text: string, ok?: boolean) => void,
  onFallback: (reason: string) => void,
  onStats?: (stats: H265ClientStats) => void
): H265PthreadsHandle {
  let destroyed = false;
  let player: H265WebPlayer | undefined;
  let conn: HttpConnection | undefined;
  let streamAbort = new AbortController();
  let firstFrameSeen = false;
  let demuxedFrames = 0;
  let playTimeTicks = 0;
  let lastStatsAt = performance.now();
  let lastPts: number | null = null;
  let statsTimer = 0;
  let keyframeReady = false;
  let skippedUntilKeyframe = 0;

  const playerId = `h265-pthreads-${++playerSeq}`;
  container.innerHTML = '';
  const stage = document.createElement('div');
  stage.id = playerId;
  stage.className = 'h265-pthreads-stage';
  container.appendChild(stage);

  const setStatus = (text: string, ok?: boolean) => {
    if (!destroyed) onStatus(text, ok);
  };

  const fail = (reason: string) => {
    if (!destroyed) onFallback(reason);
  };

  const startupTimer = window.setTimeout(() => {
    if (!destroyed && !firstFrameSeen) fail('Pthreads H265 首帧超时');
  }, 25_000);

  void start().catch((err) => {
    fail(err instanceof Error ? err.message : 'Pthreads H265 播放失败');
  });

  async function start() {
    if (!canTryH265Pthreads()) {
      fail('浏览器未开启 SharedArrayBuffer，不能启用多线程 H265');
      return;
    }

    setStatus('正在启动多线程 H265 解码...');
    await loadH265Web();
    if (destroyed) return;
    if (!window.H265webjsPlayer) {
      fail('多线程 H265 播放器未加载');
      return;
    }

    player = window.H265webjsPlayer();
    player.on_ready_show_done_callback = () => {
      firstFrameSeen = true;
      setStatus('正在播放', true);
    };
    player.on_play_time = (pts) => {
      playTimeTicks += 1;
      lastPts = pts;
      if (!firstFrameSeen) {
        firstFrameSeen = true;
        setStatus('正在播放', true);
      }
    };
    player.on_load_caching_callback = () => {
      if (!firstFrameSeen) setStatus('多线程 H265 缓冲中...', false);
    };
    player.on_finish_cache_callback = () => setStatus('正在播放', true);
    player.on_error_callback = (error) => {
      console.warn('[streamflow] h265web pthreads error', error);
      setStatus('多线程 H265 恢复中...', false);
    };
    player.video_probe_callback = () => {
      if (!firstFrameSeen) setStatus('多线程 H265 已探测到视频...');
    };

    const ok = player.build({
      player_id: playerId,
      width: '100%',
      height: '100%',
      media_uri: null,
      wasm_js_uri: absoluteWasmJsUrl(),
      wasm_wasm_uri: absoluteWasmUrl(),
      ext_src_js_uri: extScriptUrl,
      ext_wasm_js_uri: extWasmJsUrl,
      format_type: 'raw265',
      protocol: 'http',
      ignore_audio: true,
      auto_play: true,
      enable_play_button: false,
      readframe_multi_times: 2
    });

    if (!ok) {
      fail('多线程 H265 初始化失败');
      return;
    }

    await delay(600);
    if (destroyed || !player) return;
    prepareRawDecoder(player, sourceInfo);
    await startFlvDemux(rawUrl, player);

    statsTimer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.max(1, now - lastStatsAt);
      const ptsFps = playTimeTicks * 1000 / elapsed;
      const demuxFps = demuxedFrames * 1000 / elapsed;
      const fps = ptsFps > 0 ? ptsFps : demuxFps;
      const info = safeMediaInfo(player);
      if (fps > 0) {
        firstFrameSeen = true;
        setStatus('正在播放', true);
      }
      onStats?.({
        fps: fps > 0 ? fps : null,
        decodedFps: demuxFps > 0 ? demuxFps : fps > 0 ? fps : null,
        renderedFps: ptsFps > 0 ? ptsFps : fps > 0 ? fps : null,
        bitrateKbps: null,
        droppedFrames: undefined,
        frameIntervalP95Ms: null,
        renderCostMs: null,
        queueDepth: null,
        pipeline: 'h265web-pthreads'
      });
      if (info?.meta?.size?.width && info?.meta?.size?.height) {
        stage.dataset.resolution = `${info.meta.size.width}x${info.meta.size.height}`;
      }
      stage.dataset.pts = lastPts === null ? '' : String(lastPts);
      playTimeTicks = 0;
      demuxedFrames = 0;
      lastStatsAt = now;
    }, 1000);
  }

  async function startFlvDemux(url: string, target: H265WebPlayer) {
    setStatus('正在解封装 H265 裸流...');
    conn = new HttpConnection(url, {
      reconnectCount: 2,
      requestInit: { cache: 'no-store' }
    });
    await conn.connect();
    const demuxer = new FlvDemuxer(conn, DemuxMode.PULL, 'annexb');

    demuxer.on(DemuxEvent.VIDEO_ENCODER_CONFIG_CHANGED, (config: VideoDecoderConfig) => {
      const width = config.codedWidth ?? sourceInfo?.width ?? 1280;
      const height = config.codedHeight ?? sourceInfo?.height ?? 720;
      updateRawDecoderMetadata(
        target,
        { width, height, fps: sourceInfo?.fps },
        config.description as ArrayBuffer | ArrayBufferView | undefined
      );
      setStatus('多线程 H265 已收到参数...');
    });
    demuxer.on(DemuxEvent.DEMUX_ERROR, (err) => {
      console.warn('[streamflow] pthread raw demux error', err);
      setStatus('H265 裸流解封装恢复中...', false);
    });

    void demuxer.videoReadable?.pipeTo(new WritableStream<EncodedVideoChunkInit>({
      write(chunk) {
        if (destroyed) return;
        const data = toUint8Array(chunk.data as ArrayBuffer | ArrayBufferView);
        if (!data || data.byteLength === 0) return;

        if (!keyframeReady) {
          const isKeyframe = chunk.type === 'key' || hasH265Keyframe(data);
          if (!isKeyframe) {
            skippedUntilKeyframe += 1;
            if (skippedUntilKeyframe === 1 || skippedUntilKeyframe % 50 === 0) {
              setStatus('正在等待关键帧...');
            }
            return;
          }
          keyframeReady = true;
          setStatus('关键帧已就绪，正在解码...');
        }

        demuxedFrames += 1;
        target.append265NaluFrame?.(data, Number(chunk.timestamp ?? demuxedFrames * 40) / 1000);
        target.play?.();
        if (!firstFrameSeen && demuxedFrames > 3) {
          setStatus('多线程 H265 解码中...');
        }
      }
    }), { signal: streamAbort.signal }).catch((err) => {
      if (!destroyed) fail(err instanceof Error ? err.message : 'H265 裸流读取失败');
    });

    void demuxer.audioReadable?.pipeTo(new WritableStream<EncodedAudioChunkInit>({
      write() {
        // 第一版只验证浏览器视频解码，音频仍保持关闭。
      }
    }), { signal: streamAbort.signal }).catch(() => undefined);
  }

  return {
    destroy() {
      destroyed = true;
      window.clearTimeout(startupTimer);
      window.clearInterval(statsTimer);
      streamAbort.abort();
      conn?.close();
      try {
        player?.release();
      } catch (err) {
        console.warn('[streamflow] h265web release ignored', err);
      }
      container.innerHTML = '';
    }
  };
}

function prepareRawDecoder(player: H265WebPlayer, sourceInfo: H265SourceInfo | undefined) {
  const width = sourceInfo?.width ?? 1280;
  const height = sourceInfo?.height ?? 720;
  player._format_type = 'raw265';
  player._protocol_type = 'http';
  player._player_video_core = 'wasm_hevc';
  player._player_wanted_core = 'wasm_hevc';
  player._player_ignore_audio = true;
  player._wasm_js_uri = absoluteWasmJsUrl();
  player._wasm_wasm_uri = absoluteWasmUrl();
  updateRawDecoderMetadata(player, { width, height, fps: sourceInfo?.fps }, null);
  player._init_ffdecoder_worker?.();
  player._decoder_worker?.postMessage({
    type: 'init',
    payload: {
      wasm_js_uri: absoluteWasmJsUrl(),
      wasm_wasm_uri: absoluteWasmUrl(),
      ignore_audio: true
    }
  });
  player._decoder_worker?.postMessage({
    type: 'probe_ok',
    payload: { w: width, h: height }
  });
}

function updateRawDecoderMetadata(
  player: H265WebPlayer,
  sourceInfo: H265SourceInfo,
  extraData: ArrayBuffer | ArrayBufferView | null | undefined
) {
  const width = sourceInfo.width ?? 1280;
  const height = sourceInfo.height ?? 720;
  const extra = extraData ? toUint8Array(extraData) : null;
  player._media_info = {
    ...(player._media_info ?? {}),
    codec: 265,
    w: width,
    h: height,
    fps: sourceInfo.fps ?? 25,
    extra_data: extra,
    extra_size: extra?.byteLength ?? 0,
    demuxer_media_type: 'live',
    media_fmt: 'raw265'
  };

  player._decoder_worker?.postMessage({
    type: 'set_video_decoder',
    payload: {
      codec: 265,
      width,
      height,
      extra_data: extra ?? new Uint8Array(),
      extra_size: extra?.byteLength ?? 0
    }
  });
  player._decoder_worker?.postMessage({
    type: 'probe_ok',
    payload: { w: width, h: height }
  });
}

function loadH265Web(): Promise<void> {
  if (window.H265webjsPlayer) return Promise.resolve();
  loadingScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('多线程 H265 播放器加载失败'));
    document.head.appendChild(script);
  });
  return loadingScript;
}

function safeMediaInfo(player: H265WebPlayer | undefined) {
  try {
    return player?.mediaInfo?.();
  } catch {
    return null;
  }
}

function toUint8Array(data: ArrayBuffer | ArrayBufferView | undefined) {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

function hasH265Keyframe(data: Uint8Array) {
  for (let i = 0; i + 5 < data.byteLength; i += 1) {
    let start = -1;
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      start = i + 3;
    } else if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
      start = i + 4;
    }

    if (start < 0 || start >= data.byteLength) continue;
    const nalType = (data[start] & 0x7e) >> 1;
    if (nalType === 19 || nalType === 20 || nalType === 21) {
      return true;
    }
  }
  return false;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
