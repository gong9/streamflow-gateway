export class MediaClock {
  private startedAt = 0;
  private mediaOffsetMs = 0;
  private running = false;

  start(offsetMs = 0) {
    this.startedAt = performance.now();
    this.mediaOffsetMs = offsetMs;
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  now() {
    if (!this.running) return this.mediaOffsetMs;
    return this.mediaOffsetMs + performance.now() - this.startedAt;
  }
}
