import React, { useEffect, useRef, useState } from 'react';
import { createStream, deleteStream, getStreamStatus, StreamResponse, StreamStatus } from './api';
import { ActiveMode, ControllerHandle, startPlayer } from './players/PlayerController';
import './styles.css';

const DEFAULT_URL = '';

function toFriendlyStatus(status: string, busy: boolean, ok: boolean) {
  if (busy) return '正在准备画面...';
  if (ok) return '正在播放';
  if (status === '已停止') return '已停止';
  if (status.includes('等待') || status.includes('请先输入')) return '输入地址后开始播放';
  if (status.includes('失败') || status.includes('错误') || status.includes('异常') || status.includes('退出')) return '连接失败，请换一个地址试试';
  if (status.includes('缓冲') || status.includes('加载') || status.includes('等待')) return '画面加载中...';
  return status || '输入地址后开始播放';
}

function App() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [stream, setStream] = useState<StreamResponse | null>(null);
  const [status, setStatus] = useState('等待输入流地址');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ActiveMode | 'idle'>('idle');
  const [details, setDetails] = useState<StreamStatus | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<ControllerHandle | null>(null);

  useEffect(() => {
    if (!stream) return;
    const timer = window.setInterval(() => {
      void getStreamStatus(stream.stream_id).then((nextDetails) => {
        setDetails(nextDetails);
        if (!nextDetails.running) {
          setStatus(nextDetails.last_error || '上游连接失败或已退出，请检查 RTSP/RTMP/HTTP-FLV 地址是否能被 Docker 网关访问');
          setOk(false);
        }
      }).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [stream]);

  async function start() {
    if (!url.trim()) {
      setStatus('请先输入 RTSP/RTMP/HTTP-FLV 地址');
      setOk(false);
      return;
    }
    setBusy(true);
    setStatus(stream ? '正在切换视频源...' : '正在创建流...');
    setOk(false);
    try {
      controllerRef.current?.destroy();
      const created = await createStream(url.trim(), 'auto');
      setStream(created);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error('播放器未就绪');
      controllerRef.current = startPlayer(created, video, canvas, setMode, (text, nextOk) => {
        setStatus(text);
        if (typeof nextOk === 'boolean') setOk(nextOk);
      });
      const nextDetails = await getStreamStatus(created.stream_id);
      setDetails(nextDetails);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '启动失败');
      setOk(false);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      controllerRef.current?.destroy();
      controllerRef.current = null;
      if (stream) await deleteStream(stream.stream_id);
      setStream(null);
      setDetails(null);
      setMode('idle');
      setStatus('已停止');
      setOk(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '停止失败');
    } finally {
      setBusy(false);
    }
  }

  const isRunning = Boolean(stream);
  const friendlyStatus = toFriendlyStatus(status, busy, ok);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">CAMERA PREVIEW</p>
          <h1>视频预览</h1>
          <p className="lede">粘贴地址，立即查看画面。</p>
        </div>
        <div className="hero-badge" aria-hidden="true">
          <span className={ok ? 'pulse is-on' : 'pulse'} />
          <span>{ok ? '画面在线' : isRunning ? '连接中' : '待播放'}</span>
        </div>
      </section>

      <section className="console-card">
        <form className="url-form" onSubmit={(event) => { event.preventDefault(); void start(); }}>
          <label className="url-input-wrap" htmlFor="stream-url">
            <span>视频地址</span>
            <input id="stream-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="粘贴摄像头或直播地址" spellCheck={false} />
          </label>
          <button type="submit" disabled={busy}>{busy ? '准备中...' : isRunning ? '切换画面' : '开始播放'}</button>
          <button type="button" className="secondary" onClick={() => void stop()} disabled={busy || !isRunning}>停止</button>
        </form>

        <div className="player-frame">
          <video ref={videoRef} controls muted playsInline />
          <canvas ref={canvasRef} width={1280} height={720} hidden />
          {!isRunning && !busy && (
            <div className="empty-state">
              <div className="lens-mark" />
              <strong>等待播放</strong>
              <span>输入地址后，这里会显示实时画面。</span>
            </div>
          )}
          {busy && <div className="loading"><span />正在准备画面...</div>}
          <div className={`status ${ok ? 'ok' : ''}`}>{friendlyStatus}</div>
        </div>

        <div className="visually-hidden" aria-hidden="true">
          <span data-testid="mode-label">{mode === 'idle' ? '未连接' : mode === 'webcodecs' ? 'WebCodecs' : 'HLS Fallback'}</span>
          <span data-testid="player-status">{status}</span>
        </div>

        <div className="details-grid visually-hidden" aria-hidden="true">
          <div><b>streamId</b><code data-testid="stream-id">{stream?.stream_id ?? '-'}</code></div>
          <div><b>ws</b><code data-testid="ws-url">{stream?.ws_url ?? '-'}</code></div>
          <div><b>hls</b><code data-testid="hls-url">{stream?.hls_url ?? '-'}</code></div>
          <div><b>pid</b><code data-testid="upstream-pid">{details?.upstream_pid ?? '-'}</code></div>
          <div><b>reused</b><code data-testid="reused">{stream ? String(stream.reused) : '-'}</code></div>
          <div><b>dropped</b><code data-testid="dropped">{details?.dropped_frames ?? 0}</code></div>
        </div>
      </section>
    </main>
  );
}

export default App;
