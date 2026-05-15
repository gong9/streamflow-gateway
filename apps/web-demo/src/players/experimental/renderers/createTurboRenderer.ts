import { TurboCapabilities, TurboRenderer } from '../types';
import { Canvas2dYuvRenderer } from './Canvas2dYuvRenderer';
import { WebGlYuvRenderer } from './WebGlYuvRenderer';
import { WebGpuYuvRenderer } from './WebGpuYuvRenderer';
import { WorkerVideoFrameRenderer } from './WorkerVideoFrameRenderer';

export function createTurboRenderer(
  canvas: HTMLCanvasElement,
  capabilities: TurboCapabilities,
  options: { preferWebGpu?: boolean; preferWorkerRender?: boolean } = {}
): TurboRenderer {
  if (options.preferWorkerRender && capabilities.offscreenCanvas && capabilities.videoFrame) {
    return new WorkerVideoFrameRenderer(canvas);
  }
  if (options.preferWebGpu && capabilities.webGpu) return new WebGpuYuvRenderer(canvas);
  if (capabilities.webGl2) return new WebGlYuvRenderer(canvas);
  return new Canvas2dYuvRenderer(canvas);
}
