import { TurboCapabilities, TurboDecoderMode } from './types';

let cachedSimdSupport: boolean | null | undefined;

export async function detectTurboCapabilities(): Promise<TurboCapabilities> {
  const webGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const webGl2 = detectWebGl2();
  const hardwareConcurrency = Math.max(1, navigator.hardwareConcurrency || 1);
  const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const crossOriginIsolated = window.crossOriginIsolated === true;
  const worker = typeof Worker !== 'undefined';
  const offscreenCanvas = typeof OffscreenCanvas !== 'undefined'
    && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;
  const wasmSimd = await detectWasmSimd();
  const notes: string[] = [];

  if (!sharedArrayBuffer || !crossOriginIsolated) {
    notes.push('SharedArrayBuffer 不可用，WASM pthreads 不能启用');
  }
  if (!webGpu) notes.push('WebGPU 不可用，渲染走 WebGL2/Canvas 兜底');
  if (!offscreenCanvas) notes.push('OffscreenCanvas 不可用，渲染 Worker 能力受限');
  if (hardwareConcurrency <= 2) notes.push('CPU 核心较少，不建议开太多解码线程');

  return {
    webAssembly: typeof WebAssembly === 'object',
    wasmSimd,
    sharedArrayBuffer,
    crossOriginIsolated,
    worker,
    offscreenCanvas,
    webGpu,
    webGl2,
    videoFrame: typeof VideoFrame !== 'undefined',
    hardwareConcurrency,
    recommendedDecodeThreads: recommendDecodeThreads(hardwareConcurrency, sharedArrayBuffer && crossOriginIsolated),
    recommendedMode: recommendMode(webGpu, webGl2),
    notes
  };
}

export function detectTurboCapabilitiesSync(): TurboCapabilities {
  const webGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const webGl2 = detectWebGl2();
  const hardwareConcurrency = Math.max(1, navigator.hardwareConcurrency || 1);
  const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const crossOriginIsolated = window.crossOriginIsolated === true;
  return {
    webAssembly: typeof WebAssembly === 'object',
    wasmSimd: cachedSimdSupport ?? null,
    sharedArrayBuffer,
    crossOriginIsolated,
    worker: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined'
      && 'transferControlToOffscreen' in HTMLCanvasElement.prototype,
    webGpu,
    webGl2,
    videoFrame: typeof VideoFrame !== 'undefined',
    hardwareConcurrency,
    recommendedDecodeThreads: recommendDecodeThreads(hardwareConcurrency, sharedArrayBuffer && crossOriginIsolated),
    recommendedMode: recommendMode(webGpu, webGl2),
    notes: []
  };
}

function recommendDecodeThreads(cores: number, canUsePthreads: boolean) {
  if (!canUsePthreads) return 1;
  if (cores >= 8) return 4;
  if (cores >= 4) return 2;
  return 1;
}

function recommendMode(webGpu: boolean, webGl2: boolean): TurboDecoderMode {
  if (webGpu) return 'webgpu-render';
  if (webGl2) return 'webgl-render';
  return 'canvas2d-render';
}

function detectWebGl2() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

async function detectWasmSimd() {
  if (cachedSimdSupport !== undefined) return cachedSimdSupport;
  if (typeof WebAssembly !== 'object' || typeof WebAssembly.validate !== 'function') {
    cachedSimdSupport = false;
    return cachedSimdSupport;
  }

  // Minimal wasm module using v128.const. If the browser validates it, SIMD is available.
  const simdProbe = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
    0x03, 0x02, 0x01, 0x00,
    0x0a, 0x15, 0x01, 0x13, 0x00, 0xfd, 0x0c,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x0b
  ]);
  cachedSimdSupport = WebAssembly.validate(simdProbe);
  return cachedSimdSupport;
}
