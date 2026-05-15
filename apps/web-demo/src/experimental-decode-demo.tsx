import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createStream, StreamResponse } from './api';
import { H265WasmDecodeRuntime } from './players/experimental/decode/H265WasmDecodeRuntime';
import { TurboPlaybackMetrics } from './players/experimental/types';
import './experimental-decode.css';

const defaultUrl = 'https://example.test/live/h265.flv?codeType=H265';
type DecodeMode = 'main-thread-yuv' | 'worker-video-frame' | 'worker-direct-canvas' | 'scheduled-video-frame' | 'packed-yuv';

const decodeModes: Array<{ value: DecodeMode; label: string; description: string }> = [
  { value: 'worker-direct-canvas', label: 'Worker Direct Canvas', description: '单 worker 解码并绘制，对照模式' },
  { value: 'worker-video-frame', label: 'Worker VideoFrame', description: '解码 worker 输出 VideoFrame，独立 worker 渲染，当前推荐' },
  { value: 'scheduled-video-frame', label: 'Scheduled VideoFrame', description: '解码包按小节奏喂给 WASM，观察 burst 是否下降' },
  { value: 'packed-yuv', label: 'Packed YUV', description: '解码 worker transfer I420 buffer，减少 VideoFrame 对象创建' },
  { value: 'main-thread-yuv', label: '主线程 YUV', description: '主线程接收 YUV 后 WebGL 渲染' }
];

function DecodeLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<H265WasmDecodeRuntime | null>(null);
  const [url, setUrl] = useState(defaultUrl);
  const [status, setStatus] = useState('等待启动');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [stream, setStream] = useState<StreamResponse | null>(null);
  const [metrics, setMetrics] = useState<TurboPlaybackMetrics | null>(null);
  const [mode, setMode] = useState<DecodeMode>('worker-video-frame');

  async function start() {
    const canvas = canvasRef.current;
    const input = url.trim();
    if (!canvas || !input) return;
    runtimeRef.current?.destroy();
    setRunning(false);
    setError('');
    setMetrics(null);
    setStatus('正在准备同源 raw-flv...');

    try {
      const prepared = await prepareRawFlv(input);
      setStream(prepared.stream ?? null);
      const runtime = new H265WasmDecodeRuntime({
        rawUrl: prepared.rawUrl,
        canvas,
        width: prepared.stream?.source_width,
        height: prepared.stream?.source_height,
        onStatus: setStatus,
        onMetrics: setMetrics,
        onError: setError,
        preferDirectWorkerCanvas: mode === 'worker-direct-canvas',
        preferWorkerRender: mode === 'worker-video-frame' || mode === 'scheduled-video-frame',
        preferDecodeScheduler: mode === 'scheduled-video-frame',
        preferPackedYuv: mode === 'packed-yuv'
      });
      runtimeRef.current = runtime;
      await runtime.start();
      setRunning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动失败');
      setStatus('启动失败');
    }
  }

  function stop() {
    runtimeRef.current?.destroy();
    runtimeRef.current = null;
    setRunning(false);
    setStatus('已停止');
  }

  return (
    <main className="decode-page">
      <section className="decode-hero">
        <div>
          <p className="eyebrow">H265 WASM Decode Lab</p>
          <h1>真实 H265 软解实验</h1>
          <p className="summary">真实流进入 Demux，WASM SIMD 解码输出 YUV，再进入我们的队列和 WebGL 渲染。</p>
        </div>
        <div className={`score-card ${scoreLevel(metrics)}`}>
          <span>渲染</span>
          <strong>{formatFps(metrics?.renderedFps)}</strong>
        </div>
      </section>

      <section className="decode-card">
        <form className="decode-form" onSubmit={(event) => { event.preventDefault(); void start(); }}>
          <input value={url} onChange={(event) => setUrl(event.target.value)} disabled={running} placeholder="粘贴 H265 HTTP-FLV / RTMP / RTSP 地址" spellCheck={false} />
          <select value={mode} onChange={(event) => setMode(event.target.value as DecodeMode)} disabled={running}>
            {decodeModes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button disabled={running}>{running ? '运行中' : '开始软解'}</button>
          <button type="button" className="ghost" onClick={stop} disabled={!running}>停止</button>
        </form>
        <div className="decode-status">
          <span>{status} · {decodeModes.find((item) => item.value === mode)?.description}</span>
          {error && <strong>{error}</strong>}
        </div>
        <div className="decode-stage">
          <canvas ref={canvasRef} width={1280} height={720} />
        </div>
        <aside className="decode-metrics">
          <div className="metrics-title">
            <span>端到端指标</span>
            <strong>{modeLabel(mode)}</strong>
          </div>
          <Metric label="输入" value={formatFps(metrics?.inputFps)} />
          <Metric label="解封装" value={formatFps(metrics?.demuxFps)} />
          <Metric label="解码输出" value={formatFps(metrics?.decodedFps)} />
          <Metric label="渲染" value={formatFps(metrics?.renderedFps)} />
          <Metric label="渲染耗时" value={formatMs(metrics?.renderCostMs)} />
          <Metric label="帧间隔 P95" value={formatMs(metrics?.frameP95Ms)} />
          <Metric label="时钟延迟" value={formatMs(metrics?.clockDelayMs)} />
          <Metric label="媒体滞后" value={formatMs(metrics?.mediaLagMs)} />
          <Metric label="解码间隔P95" value={formatMs(metrics?.decodedIntervalP95Ms)} />
          <Metric label="突发帧数" value={String(metrics?.decodedBurstMax ?? '--')} />
          <Metric label="喂包队列" value={String(metrics?.decodeQueueDepth ?? '--')} />
          <Metric label="队列" value={String(metrics?.queueDepth ?? '--')} />
          <Metric label="丢帧" value={String(metrics?.droppedFrames ?? '--')} />
          <Metric label="瓶颈" value={formatBottleneck(metrics?.bottleneck)} />
        </aside>
      </section>
    </main>
  );
}

async function prepareRawFlv(input: string): Promise<{ rawUrl: string; stream?: StreamResponse }> {
  if (input.startsWith('/raw-flv/') || input.includes('/raw-flv/')) {
    return { rawUrl: input };
  }
  const stream = await createStream(input, 'auto');
  return {
    rawUrl: stream.raw_flv_url ?? `/raw-flv/${stream.stream_id}.flv`,
    stream
  };
}

function Metric(props: { label: string; value: string }) {
  return <div className="metric"><span>{props.label}</span><strong>{props.value}</strong></div>;
}

function formatFps(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} fps` : '--';
}

function formatMs(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} ms` : '--';
}

function formatBottleneck(value: TurboPlaybackMetrics['bottleneck'] | undefined) {
  const labels: Record<TurboPlaybackMetrics['bottleneck'], string> = {
    input: '输入',
    demux: '解封装',
    decode: '解码',
    render: '渲染',
    'main-thread': '主线程',
    queue: '队列',
    healthy: '健康',
    unknown: '观察中'
  };
  return value ? labels[value] : '--';
}

function scoreLevel(metrics: TurboPlaybackMetrics | null) {
  const fps = metrics?.renderedFps ?? 0;
  if (fps >= 24) return 'good';
  if (fps >= 15) return 'ok';
  if (fps > 0) return 'warn';
  return 'idle';
}

function modeLabel(mode: DecodeMode) {
  if (mode === 'worker-direct-canvas') return 'Direct Canvas';
  if (mode === 'worker-video-frame') return 'VideoFrame';
  if (mode === 'scheduled-video-frame') return 'Scheduled';
  if (mode === 'packed-yuv') return 'Packed YUV';
  return 'YUV';
}

createRoot(document.getElementById('root')!).render(<DecodeLab />);
