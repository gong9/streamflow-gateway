import { startH264Fallback, StreamResponse, waitForHlsReady } from '../api';
import { H265ClientStats } from './H265DirectPlayer';
import { canTryH265OptimizedWasm, H265OptimizedWasmHandle, startH265OptimizedWasmPlayer } from './H265OptimizedWasmPlayer';
import { startHlsPlayer, HlsPlayerHandle } from './HlsFallbackPlayer';
import { canTryNativeHevcMse, NativeHevcMseHandle, startNativeHevcMsePlayer } from './NativeHevcMsePlayer';
import { startWebCodecsPlayer, WebCodecsHandle, canUseWebCodecs } from './WebCodecsPlayer';

export type ActiveMode = 'webcodecs' | 'h265' | 'native-hevc' | 'hls';
export type H265PlaybackPreference = 'hard' | 'soft' | 'compat';

export interface ControllerHandle {
  destroy(): void;
}

export function startPlayer(
  stream: StreamResponse,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  h265Container: HTMLDivElement,
  onMode: (mode: ActiveMode) => void,
  onStatus: (text: string, ok?: boolean) => void,
  onH265Stats?: (stats: H265ClientStats) => void,
  h265Preference: H265PlaybackPreference = 'hard'
): ControllerHandle {
  let hls: HlsPlayerHandle | undefined;
  let h265OptimizedWasm: H265OptimizedWasmHandle | undefined;
  let nativeHevc: NativeHevcMseHandle | undefined;
  let webcodecs: WebCodecsHandle | undefined;
  let hlsStarted = false;

  const showHls = () => {
    h265Container.hidden = true;
    canvas.hidden = true;
    video.hidden = false;
  };

  const startCompatHls = (reason: string) => {
    if (hlsStarted) return;
    hlsStarted = true;
    h265OptimizedWasm?.destroy();
    nativeHevc?.destroy();
    webcodecs?.destroy();
    onMode('hls');
    onStatus(`${reason}，启动兼容播放`);
    showHls();
    void startHlsFallback(stream, video, onStatus).then((player) => {
      hls = player;
    }).catch((err) => {
      onStatus(err instanceof Error ? err.message : '兼容播放启动失败', false);
    });
  };

  const h265DirectUrl = h265PlaybackUrl(stream);
  const startBrowserH265 = () => {
    nativeHevc?.destroy();
    nativeHevc = undefined;

    if (isH265(stream) && h265DirectUrl && canTryH265OptimizedWasm()) {
      onMode('h265');
      video.hidden = true;
      canvas.hidden = false;
      h265Container.hidden = true;
      h265OptimizedWasm = startH265OptimizedWasmPlayer(
        canvas,
        h265DirectUrl,
        { width: stream.source_width, height: stream.source_height },
        onStatus,
        (fallbackReason) => {
          onStatus(`${fallbackReason}。当前选择软解，不自动启动服务器转码`, false);
        },
        onH265Stats
      );
      return true;
    }

    return false;
  };

  if (isH265(stream) && h265Preference === 'compat') {
    startCompatHls('已选择兼容转码');
  } else if (isH265(stream) && h265Preference === 'hard' && canTryNativeHevcMse()) {
    onMode('native-hevc');
    h265Container.hidden = true;
    canvas.hidden = true;
    video.hidden = false;
    nativeHevc = startNativeHevcMsePlayer(
      video,
      `/fmp4/${stream.stream_id}.mp4`,
      onStatus,
      (reason) => {
        onStatus(`${reason}。当前选择硬解，不自动切换软解或服务器转码`, false);
      },
      onH265Stats
    );
  } else if (isH265(stream) && h265Preference === 'soft' && startBrowserH265()) {
    // Optimized browser-side WASM H265 soft decode started.
  } else if (isH265(stream) && h265Preference === 'hard') {
    onMode('native-hevc');
    h265Container.hidden = true;
    canvas.hidden = true;
    video.hidden = false;
    onStatus('当前浏览器不可用原生 HEVC 硬解，请手动选择软解或兼容转码', false);
  } else if (isH265(stream) && startBrowserH265()) {
    // Soft decode fallback for legacy callers.
  } else if (stream.play_mode === 'webcodecs' && canUseWebCodecs()) {
    onMode('webcodecs');
    video.hidden = true;
    canvas.hidden = false;
    h265Container.hidden = true;
    webcodecs = startWebCodecsPlayer({ wsUrl: stream.ws_url, canvas, onStatus, onFallback: startCompatHls });
  } else {
    startCompatHls(isH265(stream) ? 'H265 原始播放不可用' : 'WebCodecs 不可用');
  }

  return {
    destroy() {
      webcodecs?.destroy();
      nativeHevc?.destroy();
      h265OptimizedWasm?.destroy();
      hls?.destroy();
    }
  };
}

async function startHlsFallback(
  stream: StreamResponse,
  video: HTMLVideoElement,
  onStatus: (text: string, ok?: boolean) => void
) {
  if (isH265(stream)) {
    onStatus('正在启动轻量播放...');
    await startH264Fallback(stream.stream_id);
  }

  onStatus('正在等待轻量视频分片...');
  await waitForHlsReady(stream.hls_url, {
    timeoutMs: 60_000,
    intervalMs: 700,
    minSegments: 3
  });
  return startHlsPlayer(video, stream.hls_url, onStatus);
}

function isH265(stream: StreamResponse) {
  const codec = stream.source_video_codec?.toLowerCase();
  return codec === 'hevc' || codec === 'h265';
}

function h265PlaybackUrl(stream: StreamResponse) {
  // Always prefer the same-origin raw FLV gateway. Direct external HTTPS-FLV
  // often fails under COEP/CORP/CORS, which incorrectly triggers H264 fallback.
  return stream.raw_flv_url ?? stream.input_url;
}
