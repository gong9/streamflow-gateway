import { TurboFrame, TurboRenderer } from '../types';

type NavigatorWithGpu = Navigator & {
  gpu?: {
    requestAdapter(): Promise<unknown>;
  };
};

export class WebGpuYuvRenderer implements TurboRenderer {
  readonly mode = 'webgpu-render' as const;
  private ready = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async initialize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    const gpu = (navigator as NavigatorWithGpu).gpu;
    if (!gpu) throw new Error('WebGPU 不可用');
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error('WebGPU Adapter 不可用');
    // 第一版只完成能力握手，后续再放 YUV shader pipeline。
    this.ready = true;
  }

  render(_frame: TurboFrame) {
    if (!this.ready) return;
    // TODO: 上传 Y/U/V plane 到 GPU texture，shader 完成 YUV -> RGB 和缩放。
  }

  destroy() {
    this.ready = false;
  }
}
