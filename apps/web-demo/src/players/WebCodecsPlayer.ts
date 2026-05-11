export interface WebCodecsHandle {
  destroy(): void;
}

export interface WebCodecsOptions {
  wsUrl: string;
  canvas: HTMLCanvasElement;
  onStatus(text: string, ok?: boolean): void;
  onFallback(reason: string): void;
}

export function canUseWebCodecs(): boolean {
  return typeof window !== 'undefined' && 'VideoDecoder' in window && 'WebSocket' in window;
}

export function startWebCodecsPlayer(options: WebCodecsOptions): WebCodecsHandle {
  if (!canUseWebCodecs()) {
    options.onFallback('浏览器不支持 WebCodecs');
    return { destroy() {} };
  }

  const wsUrl = new URL(options.wsUrl, window.location.href);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  const ctx = options.canvas.getContext('2d');
  let bytes = 0;
  let fallbackTimer = window.setTimeout(() => {
    options.onFallback('WebCodecs H264 解析器尚未启用，回退 HLS');
  }, 3500);

  ws.onopen = () => options.onStatus('WebSocket 已连接，探测 WebCodecs...');
  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      options.onStatus(`控制事件：${event.data}`);
      return;
    }
    bytes += event.data.byteLength;
    if (ctx) {
      ctx.clearRect(0, 0, options.canvas.width, options.canvas.height);
      ctx.fillStyle = '#101814';
      ctx.fillRect(0, 0, options.canvas.width, options.canvas.height);
      ctx.fillStyle = '#f6c85f';
      ctx.font = '18px ui-monospace, Menlo, monospace';
      ctx.fillText(`WebSocket receiving ${(bytes / 1024).toFixed(0)} KB`, 28, 42);
      ctx.fillStyle = '#d8fff2';
      ctx.fillText('H264 frame parser pending; falling back to HLS for video.', 28, 74);
    }
  };
  ws.onerror = () => options.onFallback('WebSocket 连接失败');
  ws.onclose = () => options.onStatus('WebSocket 已断开');

  return {
    destroy() {
      window.clearTimeout(fallbackTimer);
      ws.close();
    }
  };
}
