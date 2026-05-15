export type TurboDecoderMode = 'webgpu-render' | 'webgl-render' | 'canvas2d-render';

export interface TurboSourceInfo {
  url: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  codec?: string | null;
}

export interface TurboCapabilities {
  webAssembly: boolean;
  wasmSimd: boolean | null;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  worker: boolean;
  offscreenCanvas: boolean;
  webGpu: boolean;
  webGl2: boolean;
  videoFrame: boolean;
  hardwareConcurrency: number;
  recommendedDecodeThreads: number;
  recommendedMode: TurboDecoderMode;
  notes: string[];
}

export interface TurboFrame {
  y: Uint8Array;
  u: Uint8Array;
  v: Uint8Array;
  width: number;
  height: number;
  pts: number;
  close?: () => void;
}

export interface TurboPlaybackMetrics {
  inputFps: number | null;
  demuxFps: number | null;
  decodedFps: number | null;
  renderedFps: number | null;
  decodeCostMs: number | null;
  renderCostMs: number | null;
  frameP95Ms: number | null;
  queueDepth: number;
  droppedFrames: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  mode: TurboDecoderMode;
  bottleneck: 'input' | 'demux' | 'decode' | 'render' | 'main-thread' | 'queue' | 'healthy' | 'unknown';
}

export interface TurboRenderer {
  readonly mode: TurboDecoderMode;
  initialize(width: number, height: number): Promise<void> | void;
  render(frame: TurboFrame): Promise<void> | void;
  destroy(): void;
}

export interface TurboPlayerOptions {
  source: TurboSourceInfo;
  canvas: HTMLCanvasElement;
  onStatus?: (message: string, ok?: boolean) => void;
  onMetrics?: (metrics: TurboPlaybackMetrics) => void;
  preferWebGpu?: boolean;
}

export interface TurboPlayerHandle {
  start(): Promise<void>;
  destroy(): void;
  getCapabilities(): TurboCapabilities;
}
