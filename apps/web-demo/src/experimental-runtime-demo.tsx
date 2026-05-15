import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FakeYuvRuntime } from './players/experimental/runtime/FakeYuvRuntime';
import { TurboPlaybackMetrics } from './players/experimental/types';
import './experimental-runtime.css';

const presets = [
  { label: '720p / 60fps', width: 1280, height: 720, fps: 60 },
  { label: '1080p / 25fps', width: 1920, height: 1080, fps: 25 },
  { label: '1080p / 60fps', width: 1920, height: 1080, fps: 60 },
  { label: '2K / 60fps', width: 2560, height: 1440, fps: 60 }
];

function RuntimeLab() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<FakeYuvRuntime | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const [status, setStatus] = useState('等待启动');
  const [running, setRunning] = useState(false);
  const [metrics, setMetrics] = useState<TurboPlaybackMetrics | null>(null);
  const preset = presets[presetIndex];
  const score = useMemo(() => smoothnessScore(metrics), [metrics]);

  async function start() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    runtimeRef.current?.destroy();
    setMetrics(null);
    setStatus('正在启动 Runtime...');
    const runtime = new FakeYuvRuntime({
      canvas,
      width: preset.width,
      height: preset.height,
      fps: preset.fps,
      onStatus: setStatus,
      onMetrics: setMetrics
    });
    runtimeRef.current = runtime;
    await runtime.start();
    setRunning(true);
  }

  function stop() {
    runtimeRef.current?.destroy();
    runtimeRef.current = null;
    setRunning(false);
    setStatus('已停止');
  }

  return (
    <main className="runtime-page">
      <section className="runtime-hero">
        <div>
          <p className="eyebrow">Browser Video Runtime Lab</p>
          <h1>浏览器视频引擎实验场</h1>
          <p className="summary">先不解码真实 H265，只验证 YUV 帧队列、调度和 GPU 渲染能否稳定跑满。</p>
        </div>
        <div className={`score-card ${score.level}`}>
          <span>流畅度</span>
          <strong>{score.label}</strong>
        </div>
      </section>

      <section className="runtime-card">
        <div className="runtime-toolbar">
          <select value={presetIndex} onChange={(event) => setPresetIndex(Number(event.target.value))} disabled={running}>
            {presets.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
          </select>
          <button onClick={() => void start()} disabled={running}>启动实验</button>
          <button className="ghost" onClick={stop} disabled={!running}>停止</button>
          <span className="runtime-status">{status}</span>
        </div>

        <div className="stage-wrap">
          <canvas ref={canvasRef} width={1280} height={720} />
        </div>

        <aside className="metrics-panel">
          <div className="metrics-panel__title">
            <span>实时指标</span>
            <strong>{preset.width}x{preset.height}</strong>
          </div>
          <div className="metrics-grid">
            <Metric label="输入" value={formatFps(metrics?.inputFps)} />
            <Metric label="解封装" value={formatFps(metrics?.demuxFps)} />
            <Metric label="解码模拟" value={formatFps(metrics?.decodedFps)} />
            <Metric label="渲染" value={formatFps(metrics?.renderedFps)} />
            <Metric label="渲染耗时" value={formatMs(metrics?.renderCostMs)} />
            <Metric label="帧间隔 P95" value={formatMs(metrics?.frameP95Ms)} />
            <Metric label="队列" value={String(metrics?.queueDepth ?? '--')} />
            <Metric label="丢帧" value={String(metrics?.droppedFrames ?? '--')} />
            <Metric label="长任务" value={String(metrics?.longTaskCount ?? '--')} />
            <Metric label="瓶颈" value={formatBottleneck(metrics?.bottleneck)} />
          </div>
        </aside>
      </section>
    </main>
  );
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
    unknown: '检测中'
  };
  return value ? labels[value] : '--';
}

function smoothnessScore(metrics: TurboPlaybackMetrics | null) {
  if (!metrics?.renderedFps) return { label: '待测', level: 'idle' };
  if (metrics.renderedFps >= 55 && (metrics.frameP95Ms ?? 0) <= 24) return { label: '优秀', level: 'good' };
  if (metrics.renderedFps >= 45) return { label: '良好', level: 'ok' };
  if (metrics.renderedFps >= 25) return { label: '可用', level: 'warn' };
  return { label: '卡顿', level: 'bad' };
}

createRoot(document.getElementById('root')!).render(<RuntimeLab />);
