import { TurboFrame } from './types';

export interface FrameQueueOptions {
  maxFrames?: number;
  preferLatest?: boolean;
  onDrop?: (count: number) => void;
}

export class FrameQueue {
  private readonly frames: TurboFrame[] = [];
  private readonly maxFrames: number;
  private readonly preferLatest: boolean;

  constructor(private readonly options: FrameQueueOptions = {}) {
    this.maxFrames = options.maxFrames ?? 4;
    this.preferLatest = options.preferLatest ?? true;
  }

  push(frame: TurboFrame) {
    this.frames.push(frame);
    let dropped = 0;
    while (this.frames.length > this.maxFrames) {
      const removed = this.preferLatest ? this.frames.shift() : this.frames.pop();
      if (removed) {
        removed.close?.();
        dropped += 1;
      }
    }
    if (dropped > 0) this.options.onDrop?.(dropped);
  }

  popLatest() {
    if (!this.preferLatest) return this.frames.shift() ?? null;
    if (this.frames.length <= 1) return this.frames.shift() ?? null;

    const latest = this.frames.pop() ?? null;
    let dropped = 0;
    while (this.frames.length) {
      const old = this.frames.shift();
      old?.close?.();
      dropped += 1;
    }
    if (dropped > 0) this.options.onDrop?.(dropped);
    return latest;
  }

  get depth() {
    return this.frames.length;
  }

  clear() {
    while (this.frames.length) {
      this.frames.shift()?.close?.();
    }
  }
}
