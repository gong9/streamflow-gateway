import { TurboFrame, TurboRenderableFrame, TurboRenderer } from '../types';

export class Canvas2dYuvRenderer implements TurboRenderer {
  readonly mode = 'canvas2d-render' as const;
  private ctx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  initialize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D 不可用');
    this.imageData = this.ctx.createImageData(width, height);
  }

  render(frame: TurboRenderableFrame) {
    if (!this.ctx || !this.imageData) return false;
    if (frame instanceof VideoFrame) {
      this.ctx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
      return true;
    }
    yuv420ToRgba(frame, this.imageData.data);
    this.ctx.putImageData(this.imageData, 0, 0);
    return true;
  }

  destroy() {
    this.ctx = null;
    this.imageData = null;
  }
}

function yuv420ToRgba(frame: TurboFrame, out: Uint8ClampedArray) {
  const { y, u, v, width, height } = frame;
  let offset = 0;
  for (let row = 0; row < height; row += 1) {
    const yRow = row * width;
    const uvRow = Math.floor(row / 2) * Math.floor(width / 2);
    for (let col = 0; col < width; col += 1) {
      const yy = y[yRow + col] ?? 16;
      const uu = u[uvRow + Math.floor(col / 2)] ?? 128;
      const vv = v[uvRow + Math.floor(col / 2)] ?? 128;
      const c = yy - 16;
      const d = uu - 128;
      const e = vv - 128;
      out[offset++] = clamp((298 * c + 409 * e + 128) >> 8);
      out[offset++] = clamp((298 * c - 100 * d - 208 * e + 128) >> 8);
      out[offset++] = clamp((298 * c + 516 * d + 128) >> 8);
      out[offset++] = 255;
    }
  }
}

function clamp(value: number) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}
