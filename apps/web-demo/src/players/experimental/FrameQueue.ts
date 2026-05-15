import { TurboRenderableFrame } from './types';

export interface FrameQueueOptions {
  maxFrames?: number;
  preferLatest?: boolean;
  onDrop?: (count: number) => void;
}

export class FrameQueue {
  private readonly frames: TurboRenderableFrame[] = [];
  private readonly maxFrames: number;
  private readonly preferLatest: boolean;

  constructor(private readonly options: FrameQueueOptions = {}) {
    this.maxFrames = options.maxFrames ?? 4;
    this.preferLatest = options.preferLatest ?? true;
  }

  trimToLatest(maxDepth: number) {
    let dropped = 0;
    while (this.frames.length > Math.max(1, maxDepth)) {
      const removed = this.frames.shift();
      if (removed) {
        closeRenderableFrame(removed);
        dropped += 1;
      }
    }
    if (dropped > 0) this.options.onDrop?.(dropped);
  }

  push(frame: TurboRenderableFrame) {
    this.frames.push(frame);
    let dropped = 0;
    while (this.frames.length > this.maxFrames) {
      const removed = this.preferLatest ? this.frames.shift() : this.frames.pop();
      if (removed) {
        closeRenderableFrame(removed);
        dropped += 1;
      }
    }
    if (dropped > 0) this.options.onDrop?.(dropped);
  }

  popLatest() {
    // Dropping happens on push when the queue exceeds maxFrames.
    // On render, consume one frame at a time so bursty worker output does not
    // collapse into one visible frame per burst.
    return this.frames.shift() ?? null;
  }

  peekOldest() {
    return this.frames[0] ?? null;
  }

  dropWhile(shouldDrop: (frame: TurboRenderableFrame) => boolean, minDepth = 1) {
    let dropped = 0;
    while (this.frames.length > Math.max(0, minDepth)) {
      const frame = this.frames[0];
      if (!frame || !shouldDrop(frame)) break;
      this.frames.shift();
      closeRenderableFrame(frame);
      dropped += 1;
    }
    if (dropped > 0) this.options.onDrop?.(dropped);
    return dropped;
  }

  get depth() {
    return this.frames.length;
  }

  clear() {
    while (this.frames.length) {
      const frame = this.frames.shift();
      if (frame) closeRenderableFrame(frame);
    }
  }
}

function closeRenderableFrame(frame: TurboRenderableFrame) {
  if (frame instanceof VideoFrame) {
    frame.close();
    return;
  }
  frame.close?.();
}
