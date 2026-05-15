import { TurboFrame } from '../types';

export interface YuvFrameGeneratorOptions {
  width: number;
  height: number;
  frames?: number;
}

export class YuvFrameGenerator {
  private readonly frames: TurboFrame[];
  private cursor = 0;

  constructor(options: YuvFrameGeneratorOptions) {
    const width = even(options.width);
    const height = even(options.height);
    const frameCount = Math.max(2, options.frames ?? 24);
    this.frames = Array.from({ length: frameCount }, (_, index) => createPatternFrame(width, height, index, frameCount));
  }

  nextFrame(pts: number): TurboFrame {
    const base = this.frames[this.cursor];
    this.cursor = (this.cursor + 1) % this.frames.length;
    return {
      ...base,
      pts,
      close: undefined
    };
  }

  destroy() {
    this.frames.length = 0;
  }
}

function createPatternFrame(width: number, height: number, index: number, total: number): TurboFrame {
  const y = new Uint8Array(width * height);
  const chromaWidth = width / 2;
  const chromaHeight = height / 2;
  const u = new Uint8Array(chromaWidth * chromaHeight);
  const v = new Uint8Array(chromaWidth * chromaHeight);
  const phase = index / total;
  const band = Math.round(phase * width);

  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * width;
    for (let col = 0; col < width; col += 1) {
      const gradient = Math.round((col / width) * 96 + (row / height) * 64);
      const moving = Math.abs(((col + band) % width) - width / 2) < width / 10 ? 64 : 0;
      y[rowOffset + col] = clamp(42 + gradient + moving);
    }
  }

  for (let row = 0; row < chromaHeight; row += 1) {
    const rowOffset = row * chromaWidth;
    for (let col = 0; col < chromaWidth; col += 1) {
      const wave = Math.sin((col / chromaWidth + phase) * Math.PI * 2);
      const vertical = Math.cos((row / chromaHeight + phase * 0.5) * Math.PI * 2);
      u[rowOffset + col] = clamp(112 + wave * 42);
      v[rowOffset + col] = clamp(142 + vertical * 48);
    }
  }

  return { y, u, v, width, height, pts: 0 };
}

function even(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function clamp(value: number) {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}
