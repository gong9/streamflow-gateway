import { TurboCapabilities, TurboRenderer } from '../types';
import { Canvas2dYuvRenderer } from './Canvas2dYuvRenderer';
import { WebGlYuvRenderer } from './WebGlYuvRenderer';
import { WebGpuYuvRenderer } from './WebGpuYuvRenderer';

export function createTurboRenderer(canvas: HTMLCanvasElement, capabilities: TurboCapabilities): TurboRenderer {
  if (capabilities.webGpu) return new WebGpuYuvRenderer(canvas);
  if (capabilities.webGl2) return new WebGlYuvRenderer(canvas);
  return new Canvas2dYuvRenderer(canvas);
}
