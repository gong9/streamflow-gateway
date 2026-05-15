import { HttpConnection } from 'jv4-connection';
import { DemuxEvent, DemuxMode, FlvDemuxer } from 'jv4-demuxer';
import { DemuxMetrics, DemuxProfiler } from './DemuxProfiler';

export interface HttpFlvDemuxRuntimeOptions {
  url: string;
  onStatus?: (message: string, ok?: boolean) => void;
  onMetrics?: (metrics: DemuxMetrics) => void;
  onError?: (message: string) => void;
}

export class HttpFlvDemuxRuntime {
  private destroyed = false;
  private connection: HttpConnection | null = null;
  private abort = new AbortController();
  private metricsTimer = 0;
  private profiler = new DemuxProfiler();

  constructor(private readonly options: HttpFlvDemuxRuntimeOptions) {}

  async start() {
    this.destroyed = false;
    this.options.onStatus?.('正在连接真实流...');
    this.connection = new HttpConnection(this.options.url, {
      reconnectCount: 2,
      requestInit: { cache: 'no-store' }
    });
    await this.connection.connect();
    if (this.destroyed) return;

    this.options.onStatus?.('正在解封装 FLV...');
    const demuxer = new FlvDemuxer(this.connection, DemuxMode.PULL, 'annexb');
    demuxer.on(DemuxEvent.VIDEO_ENCODER_CONFIG_CHANGED, (config) => {
      this.profiler.setVideoConfig(config);
      this.options.onStatus?.('已探测到视频轨', true);
    });
    demuxer.on(DemuxEvent.AUDIO_ENCODER_CONFIG_CHANGED, () => {
      this.options.onStatus?.('已探测到音频轨', true);
    });
    demuxer.on(DemuxEvent.DEMUX_ERROR, (error) => {
      const message = error instanceof Error ? error.message : 'FLV 解封装错误';
      this.options.onError?.(message);
      this.options.onStatus?.('解封装恢复中...', false);
    });

    void demuxer.videoReadable?.pipeTo(new WritableStream<EncodedVideoChunkInit>({
      write: (chunk) => {
        if (this.destroyed) return;
        this.profiler.markVideo(chunk);
      }
    }), { signal: this.abort.signal }).catch((err) => {
      if (!this.destroyed) this.options.onError?.(err instanceof Error ? err.message : '视频流读取失败');
    });

    void demuxer.audioReadable?.pipeTo(new WritableStream<EncodedAudioChunkInit>({
      write: (chunk) => {
        if (this.destroyed) return;
        this.profiler.markAudio(chunk);
      }
    }), { signal: this.abort.signal }).catch((err) => {
      if (!this.destroyed) this.options.onError?.(err instanceof Error ? err.message : '音频流读取失败');
    });

    this.metricsTimer = window.setInterval(() => {
      if (this.destroyed) return;
      this.options.onMetrics?.(this.profiler.snapshot());
    }, 1000);
  }

  destroy() {
    this.destroyed = true;
    if (this.metricsTimer) window.clearInterval(this.metricsTimer);
    this.metricsTimer = 0;
    this.abort.abort();
    this.abort = new AbortController();
    this.connection?.close();
    this.connection = null;
  }
}
