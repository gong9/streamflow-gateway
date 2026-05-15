type InitMessage = {
  type: 'init';
  canvas: OffscreenCanvas;
  width: number;
  height: number;
};

type RenderMessage = {
  type: 'render';
  id: number;
  frame: VideoFrame;
};

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;

self.onmessage = (event: MessageEvent<InitMessage | RenderMessage>) => {
  const message = event.data;
  if (message.type === 'init') {
    initialize(message.canvas, message.width, message.height);
    self.postMessage({ type: 'ready' });
    return;
  }

  if (message.type === 'render') {
    const startedAt = performance.now();
    try {
      renderFrame(message.frame);
      self.postMessage({ type: 'rendered', id: message.id, costMs: performance.now() - startedAt });
    } catch (err) {
      self.postMessage({
        type: 'error',
        id: message.id,
        message: err instanceof Error ? err.message : 'Worker 渲染失败'
      });
    } finally {
      message.frame.close();
    }
  }
};

function initialize(nextCanvas: OffscreenCanvas, nextWidth: number, nextHeight: number) {
  canvas = nextCanvas;
  width = nextWidth;
  height = nextHeight;
  canvas.width = width;
  canvas.height = height;
  ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true
  });
  if (!ctx) throw new Error('Worker Canvas2D 不可用');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
}

function renderFrame(frame: VideoFrame) {
  if (!canvas || !ctx) return;
  const sourceWidth = frame.displayWidth || frame.codedWidth || width;
  const sourceHeight = frame.displayHeight || visibleHeightFor(frame) || height;

  // Let the browser's VideoFrame path handle color conversion. We deliberately
  // draw only the visible 1080 rows for common 1088-coded HEVC streams, otherwise
  // the padded chroma rows can leak as red/green garbage at the bottom.
  ctx.drawImage(frame, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
}

function visibleHeightFor(frame: VideoFrame) {
  const codedWidth = frame.codedWidth || width;
  const codedHeight = frame.codedHeight || height;
  const likely16By9Height = Math.round(codedWidth * 9 / 16);
  if (codedHeight - likely16By9Height > 0 && codedHeight - likely16By9Height <= 16) {
    return likely16By9Height;
  }
  return codedHeight;
}
