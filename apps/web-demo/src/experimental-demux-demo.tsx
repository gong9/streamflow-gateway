import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DemuxMetrics } from './players/experimental/demux/DemuxProfiler';
import { HttpFlvDemuxRuntime } from './players/experimental/demux/HttpFlvDemuxRuntime';
import './experimental-demux.css';

function DemuxLab() {
  const runtimeRef = useRef<HttpFlvDemuxRuntime | null>(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('等待输入真实流地址');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [metrics, setMetrics] = useState<DemuxMetrics | null>(null);
  const health = useMemo(() => healthLabel(metrics), [metrics]);

  async function start() {
    const nextUrl = url.trim();
    if (!nextUrl) {
      setStatus('请先输入 HTTP-FLV / raw-flv 地址');
      return;
    }
    runtimeRef.current?.destroy();
    setError('');
    setMetrics(null);
    setStatus('正在启动 Demux Lab...');
    const runtime = new HttpFlvDemuxRuntime({
      url: nextUrl,
      onStatus: setStatus,
      onMetrics: setMetrics,
      onError: setError
    });
    runtimeRef.current = runtime;
    try {
      await runtime.start();
      setRunning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动失败');
      setStatus('启动失败');
      setRunning(false);
    }
  }

  function stop() {
    runtimeRef.current?.destroy();
    runtimeRef.current = null;
    setRunning(false);
    setStatus('已停止');
  }

  return (
    <main className="demux-page">
      <section className="demux-hero">
        <div>
          <p className="eyebrow">Real Stream Demux Lab</p>
          <h1>真实流解封装实验</h1>
          <p className="summary">只拉流和拆包，不解码。用来判断真实视频卡顿是不是来自网络、封装、关键帧或 PTS。</p>
        </div>
        <div className={`health-card ${health.level}`}>
          <span>输入健康</span>
          <strong>{health.label}</strong>
        </div>
      </section>

      <section className="demux-card">
        <form className="demux-form" onSubmit={(event) => { event.preventDefault(); void start(); }}>
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="粘贴 HTTP-FLV / raw-flv 流地址" disabled={running} spellCheck={false} />
          <button disabled={running}>{running ? '运行中' : '开始测试'}</button>
          <button className="ghost" type="button" onClick={stop} disabled={!running}>停止</button>
        </form>

        <div className="status-line">
          <span>{status}</span>
          {error && <strong>{error}</strong>}
        </div>

        <div className="demux-grid">
          <Metric label="视频包" value={formatFps(metrics?.videoFps)} />
          <Metric label="音频包" value={formatFps(metrics?.audioFps)} />
          <Metric label="码率" value={formatBitrate(metrics?.bitrateKbps)} />
          <Metric label="关键帧" value={formatFps(metrics?.keyframeFps)} />
          <Metric label="关键帧间隔" value={formatMs(metrics?.keyframeIntervalMs)} />
          <Metric label="PTS 抖动" value={formatMs(metrics?.ptsJitterMs)} />
          <Metric label="编码" value={metrics?.codec ?? '--'} />
          <Metric label="分辨率" value={metrics?.resolution ?? '--'} />
          <Metric label="视频包数" value={String(metrics?.videoPackets ?? '--')} />
          <Metric label="音频包数" value={String(metrics?.audioPackets ?? '--')} />
          <Metric label="时间戳" value={formatTimestamp(metrics?.lastVideoTimestamp)} />
          <Metric label="判断" value={formatBottleneck(metrics?.bottleneck)} />
        </div>
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: string }) {
  return <div className="metric"><span>{props.label}</span><strong>{props.value}</strong></div>;
}

function formatFps(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} /s` : '--';
}

function formatMs(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} ms` : '--';
}

function formatBitrate(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return value >= 1000 ? `${(value / 1000).toFixed(2)} Mbps` : `${value.toFixed(0)} Kbps`;
}

function formatTimestamp(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(0) : '--';
}

function formatBottleneck(value: DemuxMetrics['bottleneck'] | undefined) {
  const labels: Record<DemuxMetrics['bottleneck'], string> = {
    healthy: '输入健康',
    'no-video': '没有视频包',
    'keyframe-sparse': '关键帧过少',
    'pts-jitter': 'PTS 抖动',
    'low-input': '输入偏低',
    unknown: '观察中'
  };
  return value ? labels[value] : '--';
}

function healthLabel(metrics: DemuxMetrics | null) {
  if (!metrics) return { label: '待测', level: 'idle' };
  if (metrics.bottleneck === 'healthy') return { label: '健康', level: 'good' };
  if (metrics.bottleneck === 'unknown') return { label: '观察', level: 'ok' };
  return { label: '异常', level: 'bad' };
}

createRoot(document.getElementById('root')!).render(<DemuxLab />);
