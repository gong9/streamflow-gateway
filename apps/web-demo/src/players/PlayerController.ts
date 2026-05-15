import { startH264Fallback, StreamResponse, waitForHlsReady } from '../api';
import { canTryH265Direct, H265ClientStats, H265DirectHandle, startH265DirectPlayer } from './H265DirectPlayer';
import { canTryH265Pthreads, H265PthreadsHandle, startH265PthreadsPlayer } from './H265PthreadsPlayer';
import { startHlsPlayer, HlsPlayerHandle } from './HlsFallbackPlayer';
import { canTryJessibuca4Simd, Jessibuca4SimdHandle, startJessibuca4SimdPlayer } from './Jessibuca4SimdPlayer';
import { canTryNativeHevcMse, NativeHevcMseHandle, startNativeHevcMsePlayer } from './NativeHevcMsePlayer';
import { startWebCodecsPlayer, WebCodecsHandle, canUseWebCodecs } from './WebCodecsPlayer';

export type ActiveMode = 'webcodecs' | 'h265' | 'native-hevc' | 'hls';

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
  onH265Stats?: (stats: H265ClientStats) => void
): ControllerHandle {
  let hls: HlsPlayerHandle | undefined;
  let h265: H265DirectHandle | undefined;
  let h265Pthreads: H265PthreadsHandle | undefined;
  let h265Simd: Jessibuca4SimdHandle | undefined;
  let nativeHevc: NativeHevcMseHandle | undefined;
  let webcodecs: WebCodecsHandle | undefined;
  let fallbackStarted = false;

  const showHls = () => {
    h265Container.hidden = true;
    canvas.hidden = true;
    video.hidden = false;
  };

  const fallbackToHls = (reason: string) => {
    if (fallbackStarted) return;
    fallbackStarted = true;
    h265?.destroy();
    h265Pthreads?.destroy();
    h265Simd?.destroy();
    nativeHevc?.destroy();
    webcodecs?.destroy();
    onMode('hls');
    onStatus(`${reason}，切换轻量播放`);
    showHls();
    void startHlsFallback(stream, video, onStatus).then((player) => {
      hls = player;
    }).catch((err) => {
      onStatus(err instanceof Error ? err.message : '兼容播放启动失败', false);
    });
  };

  const h265DirectUrl = h265PlaybackUrl(stream);
  const startBrowserH265 = (reason?: string) => {
    nativeHevc?.destroy();
    nativeHevc = undefined;
    if (reason) onStatus(`${reason}，切换浏览器兼容解码...`);

    if (isH265(stream) && h265DirectUrl && canTryH265Pthreads()) {
      onMode('h265');
      video.hidden = true;
      canvas.hidden = true;
      h265Container.hidden = false;
      h265Pthreads = startH265PthreadsPlayer(
        h265Container,
        h265DirectUrl,
        { width: stream.source_width, height: stream.source_height, fps: null },
        onStatus,
        fallbackToHls,
        onH265Stats
      );
      return true;
    }

    if (isH265(stream) && h265DirectUrl && shouldUseJv4Simd(stream) && canTryJessibuca4Simd()) {
      onMode('h265');
      video.hidden = true;
      canvas.hidden = true;
      h265Container.hidden = false;
      h265Simd = startJessibuca4SimdPlayer(h265Container, h265DirectUrl, onStatus, fallbackToHls, (stats) => {
        onH265Stats?.(stats);
      }, {
        preferVideoFrameRenderer: !isHttpFlv(stream.input_url)
      });
      return true;
    }

    if (isH265(stream) && h265DirectUrl && canTryH265Direct()) {
      onMode('h265');
      video.hidden = true;
      canvas.hidden = true;
      h265Container.hidden = false;
      h265 = startH265DirectPlayer(h265Container, h265DirectUrl, onStatus, fallbackToHls, onH265Stats);
      return true;
    }

    return false;
  };

  if (isH265(stream) && canTryNativeHevcMse()) {
    onMode('native-hevc');
    h265Container.hidden = true;
    canvas.hidden = true;
    video.hidden = false;
    nativeHevc = startNativeHevcMsePlayer(
      video,
      `/fmp4/${stream.stream_id}.mp4`,
      onStatus,
      (reason) => {
        if (!startBrowserH265(reason)) fallbackToHls(reason);
      },
      onH265Stats
    );
  } else if (isH265(stream) && startBrowserH265()) {
    // Browser-side H265 fallback started.
  } else if (stream.play_mode === 'webcodecs' && canUseWebCodecs()) {
    onMode('webcodecs');
    video.hidden = true;
    canvas.hidden = false;
    h265Container.hidden = true;
    webcodecs = startWebCodecsPlayer({ wsUrl: stream.ws_url, canvas, onStatus, onFallback: fallbackToHls });
  } else {
    fallbackToHls(isH265(stream) ? 'H265 原始播放不可用' : 'WebCodecs 不可用');
  }

  return {
    destroy() {
      webcodecs?.destroy();
      nativeHevc?.destroy();
      h265Simd?.destroy();
      h265Pthreads?.destroy();
      h265?.destroy();
      hls?.destroy();
    }
  };
}

function shouldUseJv4Simd(stream: StreamResponse) {
  return isHttpFlv(stream.input_url);
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

function isHttpFlv(url: string | null | undefined) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.pathname.toLowerCase().endsWith('.flv');
  } catch {
    return false;
  }
}
