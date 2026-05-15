import { TurboFrame, TurboRenderableFrame, TurboRenderer } from '../types';

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  v_texCoord = a_texCoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision mediump float;

uniform sampler2D u_y;
uniform sampler2D u_u;
uniform sampler2D u_v;
in vec2 v_texCoord;
out vec4 outColor;

void main() {
  float y = texture(u_y, v_texCoord).r;
  float u = texture(u_u, v_texCoord).r - 0.5;
  float v = texture(u_v, v_texCoord).r - 0.5;

  vec3 rgb = vec3(
    y + 1.402 * v,
    y - 0.344136 * u - 0.714136 * v,
    y + 1.772 * u
  );
  outColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}`;

const rgbFragmentShaderSource = `#version 300 es
precision mediump float;

uniform sampler2D u_frame;
in vec2 v_texCoord;
out vec4 outColor;

void main() {
  outColor = texture(u_frame, v_texCoord);
}`;

export class WebGlYuvRenderer implements TurboRenderer {
  readonly mode = 'webgl-render' as const;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private yTexture: WebGLTexture | null = null;
  private uTexture: WebGLTexture | null = null;
  private vTexture: WebGLTexture | null = null;
  private rgbProgram: WebGLProgram | null = null;
  private rgbTexture: WebGLTexture | null = null;
  private width = 0;
  private height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  initialize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('WebGL2 不可用');

    this.gl = gl;
    this.program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    this.rgbProgram = createProgram(gl, vertexShaderSource, rgbFragmentShaderSource);
    this.vao = createFullscreenVao(gl, this.program);
    this.yTexture = createPlaneTexture(gl);
    this.uTexture = createPlaneTexture(gl);
    this.vTexture = createPlaneTexture(gl);
    this.rgbTexture = createPlaneTexture(gl);

    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_y'), 0);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_u'), 1);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_v'), 2);
    gl.useProgram(this.rgbProgram);
    gl.uniform1i(gl.getUniformLocation(this.rgbProgram, 'u_frame'), 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  render(frame: TurboRenderableFrame) {
    if (frame instanceof VideoFrame) {
      this.renderVideoFrame(frame);
      return true;
    }
    const gl = this.gl;
    if (!gl || !this.program || !this.vao || !this.yTexture || !this.uTexture || !this.vTexture) return false;
    if (frame.width !== this.width || frame.height !== this.height) {
      this.width = frame.width;
      this.height = frame.height;
      this.canvas.width = frame.width;
      this.canvas.height = frame.height;
      gl.viewport(0, 0, frame.width, frame.height);
    }

    uploadPlane(gl, 0, this.yTexture, frame.width, frame.height, frame.y);
    uploadPlane(gl, 1, this.uTexture, Math.floor(frame.width / 2), Math.floor(frame.height / 2), frame.u);
    uploadPlane(gl, 2, this.vTexture, Math.floor(frame.width / 2), Math.floor(frame.height / 2), frame.v);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    return true;
  }

  destroy() {
    const gl = this.gl;
    if (gl) {
      if (this.yTexture) gl.deleteTexture(this.yTexture);
      if (this.uTexture) gl.deleteTexture(this.uTexture);
      if (this.vTexture) gl.deleteTexture(this.vTexture);
      if (this.rgbTexture) gl.deleteTexture(this.rgbTexture);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
      if (this.rgbProgram) gl.deleteProgram(this.rgbProgram);
    }
    this.gl = null;
    this.program = null;
    this.vao = null;
    this.yTexture = null;
    this.uTexture = null;
    this.vTexture = null;
    this.rgbProgram = null;
    this.rgbTexture = null;
  }

  private renderVideoFrame(frame: VideoFrame) {
    const gl = this.gl;
    if (!gl || !this.rgbProgram || !this.vao || !this.rgbTexture) return;
    const width = frame.codedWidth || frame.displayWidth || this.width || this.canvas.width;
    const height = frame.codedHeight || frame.displayHeight || this.height || this.canvas.height;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.rgbTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    gl.useProgram(this.rgbProgram);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL shader 创建失败');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'WebGL shader 编译失败';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL program 创建失败');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'WebGL program 链接失败';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createFullscreenVao(gl: WebGL2RenderingContext, program: WebGLProgram) {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (!vao || !buffer) throw new Error('WebGL buffer 创建失败');
  const data = new Float32Array([
    -1, -1, 0, 1,
    1, -1, 1, 1,
    -1, 1, 0, 0,
    -1, 1, 0, 0,
    1, -1, 1, 1,
    1, 1, 1, 0
  ]);

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  const texCoord = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(texCoord);
  gl.vertexAttribPointer(texCoord, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return vao;
}

function createPlaneTexture(gl: WebGL2RenderingContext) {
  const texture = gl.createTexture();
  if (!texture) throw new Error('WebGL texture 创建失败');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

function uploadPlane(
  gl: WebGL2RenderingContext,
  unit: number,
  texture: WebGLTexture,
  width: number,
  height: number,
  data: Uint8Array
) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, data);
}
