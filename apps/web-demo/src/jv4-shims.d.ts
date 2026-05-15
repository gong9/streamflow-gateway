declare module 'jv4-connection' {
  export interface ConnectionOptions {
    reconnectCount?: number;
    reconnectTimeout?: (reconnectionCount: number) => number;
    requestInit?: RequestInit;
  }

  export class HttpConnection {
    constructor(url: string, options?: ConnectionOptions);
    connect(): Promise<void>;
    close(): void;
    read<T extends number | Uint8Array>(need: T): Promise<Uint8Array>;
  }
}

declare module 'jv4-demuxer' {
  export enum DemuxEvent {
    AUDIO_ENCODER_CONFIG_CHANGED = 'audio-encoder-config-changed',
    VIDEO_ENCODER_CONFIG_CHANGED = 'video-encoder-config-changed',
    DEMUX_ERROR = 'demux-error'
  }

  export enum DemuxMode {
    PULL = 0,
    PUSH = 1
  }

  export class FlvDemuxer {
    constructor(source?: unknown, mode?: DemuxMode, format?: 'annexb' | 'avcc');
    audioReadable?: ReadableStream<EncodedAudioChunkInit>;
    videoReadable?: ReadableStream<EncodedVideoChunkInit>;
    on(event: DemuxEvent.VIDEO_ENCODER_CONFIG_CHANGED, listener: (config: VideoDecoderConfig) => void): this;
    on(event: DemuxEvent.AUDIO_ENCODER_CONFIG_CHANGED, listener: (config: AudioDecoderConfig) => void): this;
    on(event: DemuxEvent.DEMUX_ERROR, listener: (error: Error) => void): this;
  }
}
