import { TurboRenderableFrame, TurboRenderer } from '../types';

type WorkerMessage =
  | { type: 'ready' }
  | { type: 'rendered'; id: number; costMs: number }
  | { type: 'error'; id?: number; message: string };

export class WorkerVideoFrameRenderer implements TurboRenderer {
  readonly mode = 'worker-video-frame' as const;
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: boolean) => void; reject: (error: Error) => void }>();
  private initialized = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  initialize(width: number, height: number): Promise<void> {
    if (!('transferControlToOffscreen' in this.canvas)) {
      throw new Error('OffscreenCanvas 不可用');
    }
    const offscreen = this.canvas.transferControlToOffscreen();
    this.worker = new Worker(new URL('./WorkerVideoFrameRenderer.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handleWorkerMessage(event.data);
    this.worker.onerror = (event) => this.rejectAll(new Error(event.message || 'Worker 渲染错误'));
    this.worker.postMessage({ type: 'init', canvas: offscreen, width, height }, [offscreen]);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Worker 渲染初始化超时')), 8000);
      const onMessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === 'ready') {
          window.clearTimeout(timer);
          this.worker?.removeEventListener('message', onMessage);
          this.initialized = true;
          resolve();
        } else if (event.data.type === 'error') {
          window.clearTimeout(timer);
          this.worker?.removeEventListener('message', onMessage);
          reject(new Error(event.data.message));
        }
      };
      this.worker?.addEventListener('message', onMessage);
    });
  }

  render(frame: TurboRenderableFrame): Promise<boolean> | boolean {
    if (!(frame instanceof VideoFrame)) return false;
    if (!this.worker || !this.initialized) {
      frame.close();
      return true;
    }
    const id = this.nextId++;
    const promise = new Promise<boolean>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.worker.postMessage({ type: 'render', id, frame }, [frame]);
    return promise;
  }

  destroy() {
    this.rejectAll(new Error('Worker 渲染器已销毁'));
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }

  private handleWorkerMessage(message: WorkerMessage) {
    if (message.type === 'rendered') {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      pending?.resolve(true);
    } else if (message.type === 'error') {
      const error = new Error(message.message);
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        pending?.reject(error);
      } else {
        this.rejectAll(error);
      }
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
