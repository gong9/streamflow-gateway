import { StreamResponse } from '../api';
import { startHlsPlayer, HlsPlayerHandle } from './HlsFallbackPlayer';
import { startWebCodecsPlayer, WebCodecsHandle, canUseWebCodecs } from './WebCodecsPlayer';

export type ActiveMode = 'webcodecs' | 'hls';

export interface ControllerHandle {
  destroy(): void;
}

export function startPlayer(
  stream: StreamResponse,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  onMode: (mode: ActiveMode) => void,
  onStatus: (text: string, ok?: boolean) => void
): ControllerHandle {
  let hls: HlsPlayerHandle | undefined;
  let webcodecs: WebCodecsHandle | undefined;

  const fallback = (reason: string) => {
    webcodecs?.destroy();
    onMode('hls');
    onStatus(`${reason}，切换 HLS Fallback`);
    canvas.hidden = true;
    video.hidden = false;
    hls = startHlsPlayer(video, stream.hls_url, onStatus);
  };

  if (stream.play_mode === 'webcodecs' && canUseWebCodecs()) {
    onMode('webcodecs');
    video.hidden = true;
    canvas.hidden = false;
    webcodecs = startWebCodecsPlayer({ wsUrl: stream.ws_url, canvas, onStatus, onFallback: fallback });
  } else {
    fallback('WebCodecs 不可用');
  }

  return {
    destroy() {
      webcodecs?.destroy();
      hls?.destroy();
    }
  };
}
