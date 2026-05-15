import Hls from 'hls.js';

export interface HlsPlayerHandle {
  destroy(): void;
}

export function startHlsPlayer(video: HTMLVideoElement, hlsUrl: string, onStatus: (text: string, ok?: boolean) => void): HlsPlayerHandle {
  const sourceUrl = () => `${hlsUrl}${hlsUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
  let url = sourceUrl();
  let hls: Hls | undefined;
  let hasPlayed = false;
  let destroyed = false;
  let lastTime = 0;
  let lastAdvanceAt = Date.now();
  let lastReloadAt = 0;

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
      setStatus('正在播放', true);
    }).catch((err) => {
      const name = err instanceof DOMException ? err.name : 'play-blocked';
      setStatus(`画面已缓冲，点击播放器继续 (${name})`, false);
    });
  };

  const markPlaying = () => {
    hasPlayed = true;
    setStatus('正在播放', true);
  };
  video.onplaying = markPlaying;
  video.ontimeupdate = () => {
    if (video.currentTime > 0) {
      lastTime = video.currentTime;
      lastAdvanceAt = Date.now();
      markPlaying();
    }
  };
  video.oncanplay = () => {
    if (!hasPlayed) {
      setStatus('画面已缓冲，准备播放...', false);
      tryPlay('canplay');
    }
  };
  video.onwaiting = () => setStatus('正在恢复画面...', false);
  video.onstalled = () => setStatus('画面暂时停顿，正在恢复...', false);
  video.onerror = () => setStatus(`播放失败 (${video.error?.message ?? 'media error'})`, false);
  video.onclick = () => tryPlay('manual');

  const recoverFrozenPlayback = () => {
    if (destroyed || !hasPlayed || video.paused || video.ended) return;
    const now = Date.now();
    if (video.currentTime > lastTime + 0.05) {
      lastTime = video.currentTime;
      lastAdvanceAt = now;
      return;
    }

    const frozenFor = now - lastAdvanceAt;
    if (frozenFor < 10_000) return;

    setStatus('画面暂时停顿，正在恢复...', false);
    hls?.startLoad();
    void video.play().catch(() => undefined);

    if (frozenFor >= 25_000 && now - lastReloadAt > 15_000) {
      lastReloadAt = now;
      url = sourceUrl();
      if (hls) {
        hls.loadSource(url);
        hls.startLoad();
      } else {
        video.src = url;
        video.load();
        tryPlay('reload');
      }
    }
  };
  const watchdog = window.setInterval(recoverFrozenPlayback, 3_000);

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    setStatus('正在加载画面...');
    video.src = url;
    video.load();
    tryPlay('native');
  } else if (Hls.isSupported()) {
    hls = new Hls({
      backBufferLength: 20,
      initialLiveManifestSize: 3,
      liveSyncDurationCount: 3,
      lowLatencyMode: true,
      manifestLoadingTimeOut: 10_000,
      fragLoadingTimeOut: 15_000
    });
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      setStatus('正在加载画面...');
      hls?.loadSource(url);
    });
    hls.on(Hls.Events.MANIFEST_LOADING, () => setStatus('正在加载画面...'));
    hls.on(Hls.Events.MANIFEST_LOADED, () => setStatus('正在等待视频分片...'));
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setStatus('画面已准备，正在播放...');
      tryPlay('manifest');
    });
    hls.on(Hls.Events.FRAG_LOADED, () => setStatus('已收到视频画面，正在解码...', false));
    hls.on(Hls.Events.BUFFER_APPENDED, () => {
      if (!hasPlayed) tryPlay('buffer');
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      const reason = `${data.type}/${data.details}`;
      if (!data.fatal) {
        setStatus('画面有短暂波动，正在恢复...', false);
        return;
      }

      setStatus('播放异常，正在自动恢复...', false);
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
    setStatus('当前浏览器不支持播放该视频流', false);
  }

  return {
    destroy() {
      destroyed = true;
      window.clearInterval(watchdog);
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
