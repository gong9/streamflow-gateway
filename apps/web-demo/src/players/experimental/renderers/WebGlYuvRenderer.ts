import { TurboFrame, TurboRenderer } from '../types';

export class WebGlYuvRenderer implements TurboRenderer {
  readonly mode = 'webgl-render' as const;
  private gl: WebGL2RenderingContext | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  initialize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false });
    if (!this.gl) throw new Error('WebGL2 不可用');
    this.gl.viewport(0, 0, width, height);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  render(_frame: TurboFrame) {
    // 第一版先占位：真实实现会上传 Y/U/V 三个纹理，用 fragment shader 做 YUV -> RGB。
    // 保持独立文件，不影响当前生产播放器。
    this.gl?.clear(this.gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    this.gl = null;
  }
}
