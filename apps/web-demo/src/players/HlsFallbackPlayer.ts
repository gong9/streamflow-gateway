import Hls from 'hls.js';

export interface HlsPlayerHandle {
  destroy(): void;
}

export function startHlsPlayer(video: HTMLVideoElement, hlsUrl: string, onStatus: (text: string, ok?: boolean) => void): HlsPlayerHandle {
  const url = `${hlsUrl}${hlsUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
  let hls: Hls | undefined;
  let hasPlayed = false;
  let destroyed = false;

  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.controls = true;

  const setStatus = (text: string, ok?: boolean) => {
    if (!destroyed) onStatus(text, ok);
  };

  const tryPlay = (source: string) => {
    void video.play().then(() => {
      hasPlayed = true;
      setStatus(`HLS Fallback 播放中 (${source})`, true);
    }).catch((err) => {
      const name = err instanceof DOMException ? err.name : 'play-blocked';
      setStatus(`HLS 已缓冲，点击播放器继续 (${name})`, false);
    });
  };

  const markPlaying = () => {
    hasPlayed = true;
    setStatus('HLS Fallback 播放中', true);
  };
  video.onplaying = markPlaying;
  video.ontimeupdate = () => {
    if (video.currentTime > 0) markPlaying();
  };
  video.oncanplay = () => {
    if (!hasPlayed) {
      setStatus('HLS 已缓冲，准备播放...', false);
      tryPlay('canplay');
    }
  };
  video.onwaiting = () => setStatus('HLS 正在缓冲分片...', false);
  video.onstalled = () => setStatus('HLS 分片暂时停顿，可能是上游源不可达或没有新分片...', false);
  video.onerror = () => setStatus(`HLS 播放失败 (${video.error?.message ?? 'media error'})`, false);
  video.onclick = () => tryPlay('manual');

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    setStatus('HLS 原生播放加载中...');
    video.src = url;
    video.load();
    tryPlay('native');
  } else if (Hls.isSupported()) {
    hls = new Hls({
      backBufferLength: 20,
      liveSyncDurationCount: 2,
      lowLatencyMode: true,
      manifestLoadingTimeOut: 10_000,
      fragLoadingTimeOut: 15_000
    });
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      setStatus('HLS MediaSource 已挂载，正在拉 manifest...');
      hls?.loadSource(url);
    });
    hls.on(Hls.Events.MANIFEST_LOADING, () => setStatus('HLS manifest 加载中...'));
    hls.on(Hls.Events.MANIFEST_LOADED, () => setStatus('HLS manifest 已加载，等待分片...'));
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setStatus('HLS manifest 已解析，准备播放...');
      tryPlay('manifest');
    });
    hls.on(Hls.Events.FRAG_LOADED, () => setStatus('HLS 已收到视频分片，正在解码...', false));
    hls.on(Hls.Events.BUFFER_APPENDED, () => {
      if (!hasPlayed) tryPlay('buffer');
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      const reason = `${data.type}/${data.details}`;
      if (!data.fatal) {
        setStatus(`HLS 非致命波动：${reason}`, false);
        return;
      }

      setStatus(`HLS 异常，正在恢复：${reason}`, false);
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls?.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls?.recoverMediaError();
      } else {
        hls?.destroy();
      }
    });
    hls.attachMedia(video);
  } else {
    setStatus('当前浏览器不支持 HLS', false);
  }

  return {
    destroy() {
      destroyed = true;
      hls?.destroy();
      video.pause();
      video.onclick = null;
      video.onplaying = null;
      video.ontimeupdate = null;
      video.oncanplay = null;
      video.onwaiting = null;
      video.onstalled = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    }
  };
}
