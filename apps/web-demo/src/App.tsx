import React, { useEffect, useRef, useState } from 'react';
import { createStream, deleteStream, getStreamStatus, waitForHlsReady, StreamResponse, StreamStatus } from './api';
import { ActiveMode, ControllerHandle, startPlayer } from './players/PlayerController';
import { H265ClientStats } from './players/H265DirectPlayer';
import './styles.css';

const DEFAULT_URL = '';
const SHOW_DIAGNOSTICS = shouldShowDiagnostics();

interface BrowserPerformanceStats {
  longTaskCount: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number | null;
  memoryMB: number | null;
}

function toFriendlyStatus(status: string, busy: boolean, ok: boolean) {
  if (busy) return '正在准备画面...';
  if (ok) return '正在播放';
  if (status === '已停止') return '已停止';
  if (status.includes('暂不可用')) return '视频源暂时不可用';
  if (status.includes('恢复') || status.includes('重启')) return '正在恢复画面...';
  if (status.includes('等待') || status.includes('请先输入')) return '输入地址后开始播放';
  if (status.includes('失败') || status.includes('错误') || status.includes('异常') || status.includes('退出')) return '连接失败，请换一个地址试试';
  if (status.includes('缓冲') || status.includes('加载') || status.includes('等待')) return '画面加载中...';
  return status || '输入地址后开始播放';
}

function videoLooksAlive(video: HTMLVideoElement | null) {
  return Boolean(
    video &&
    !video.paused &&
    !video.ended &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.currentTime > 0
  );
}

function formatNumber(value: number | null | undefined, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function formatBitrate(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return value >= 1000 ? `${(value / 1000).toFixed(2)}M` : `${Math.round(value)}K`;
}

function formatMs(value: number | null | undefined, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}ms` : '--';
}

function formatCount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : '--';
}

function formatStrategy(value: StreamStatus['hls_strategy'] | null | undefined) {
  if (value === 'copy') return '省资源';
  if (value === 'transcode') return '兼容转码';
  return '检测中';
}

function formatTreatment(details: StreamStatus | null, mode: ActiveMode | 'idle') {
  if (mode === 'native-hevc') return '不转码';
  if (mode === 'h265') return '不转码';
  if (mode === 'webcodecs') return '低延迟';
  return formatStrategy(details?.hls_strategy);
}

function formatSmoothness(stats: H265ClientStats, fps: number | null | undefined) {
  const p95 = stats.frameIntervalP95Ms;
  if (typeof p95 === 'number' && Number.isFinite(p95)) {
    if (p95 <= 55) return '顺畅';
    if (p95 <= 90) return '一般';
    return '卡顿';
  }
  if (typeof fps === 'number' && fps >= 20) return '顺畅';
  if (typeof fps === 'number' && fps >= 10) return '一般';
  return '--';
}

function formatCodec(value: string | null | undefined) {
  if (!value) return '检测中';
  const normalized = value.toLowerCase();
  if (normalized === 'hevc' || normalized === 'h265') return 'H265';
  if (normalized === 'h264' || normalized === 'avc') return 'H264';
  return value.toUpperCase();
}

function formatPipeline(value: string | null | undefined) {
  if (value === 'main-webgl') return 'WebGL 渲染';
  if (value === 'worker-2d') return 'Worker 解码';
  if (value === 'worker-canvas') return 'Worker 绘制';
  if (value === 'webcodecs-hevc') return '硬解';
  if (value === 'native-hevc-mse') return '原生硬解';
  if (value === 'jessibuca-full') return '完整链路';
  if (value === 'h265web-pthreads') return 'WASM 多线程';
  return '浏览器解码';
}

function playbackPipelineLabel(mode: ActiveMode | 'idle', stats: H265ClientStats) {
  if (mode === 'native-hevc') return '原生硬解';
  if (mode === 'h265') return formatPipeline(stats.pipeline);
  if (mode === 'webcodecs') return 'WebCodecs';
  if (mode === 'hls') return '兼容播放';
  return '未连接';
}

function formatResolution(width: number | null | undefined, height: number | null | undefined) {
  return width && height ? `${width}x${height}` : '--';
}

function diagnosePlayback(stats: H265ClientStats, browserPerf: BrowserPerformanceStats, mode: ActiveMode | 'idle') {
  if (mode !== 'h265') return '后端链路';
  const decodedFps = stats.decodedFps ?? stats.fps;
  const renderedFps = stats.renderedFps ?? stats.fps;
  const renderCost = stats.renderCostMs;
  const frameP95 = stats.frameIntervalP95Ms;
  const droppedFrames = stats.droppedFrames ?? 0;

  if (browserPerf.longTaskTotalMs > 300 || browserPerf.longTaskCount >= 4) return '主线程阻塞';
  if (typeof renderedFps === 'number' && renderedFps >= 20) return '链路正常';
  if (
    typeof decodedFps === 'number' &&
    typeof renderedFps === 'number' &&
    decodedFps - renderedFps >= 8 &&
    renderedFps < 18
  ) return '绘制追不上';
  if (typeof renderCost === 'number' && renderCost >= 18) return '绘制偏重';
  if (typeof decodedFps === 'number' && decodedFps > 0 && decodedFps < 12) return '解码偏重';
  if (typeof frameP95 === 'number' && frameP95 >= 120) return '帧间隔抖动';
  if (droppedFrames >= 5) return '排队丢帧';
  return '链路正常';
}

function useBrowserPerformanceStats(active: boolean): BrowserPerformanceStats {
  const [stats, setStats] = useState<BrowserPerformanceStats>({
    longTaskCount: 0,
    longTaskTotalMs: 0,
    longTaskMaxMs: null,
    memoryMB: readMemoryMB()
  });

  useEffect(() => {
    if (!active) {
      setStats({
        longTaskCount: 0,
        longTaskTotalMs: 0,
        longTaskMaxMs: null,
        memoryMB: readMemoryMB()
      });
      return;
    }

    const longTasks: Array<{ at: number; duration: number }> = [];
    let observer: PerformanceObserver | null = null;

    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({ at: performance.now(), duration: entry.duration });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    }

    const timer = window.setInterval(() => {
      const now = performance.now();
      while (longTasks.length && now - longTasks[0].at > 10_000) {
        longTasks.shift();
      }
      const durations = longTasks.map((item) => item.duration);
      setStats({
        longTaskCount: durations.length,
        longTaskTotalMs: durations.reduce((sum, value) => sum + value, 0),
        longTaskMaxMs: durations.length ? Math.max(...durations) : null,
        memoryMB: readMemoryMB()
      });
    }, 1000);

    return () => {
      observer?.disconnect();
      window.clearInterval(timer);
    };
  }, [active]);

  return stats;
}

function readMemoryMB() {
  const performanceWithMemory = performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  };
  const used = performanceWithMemory.memory?.usedJSHeapSize;
  return typeof used === 'number' && Number.isFinite(used) ? used / 1024 / 1024 : null;
}

function shouldShowDiagnostics() {
  if (import.meta.env.DEV || import.meta.env.VITE_SHOW_DIAGNOSTICS === '1') return true;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === '1') return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function App() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [stream, setStream] = useState<StreamResponse | null>(null);
  const [status, setStatus] = useState('等待输入流地址');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ActiveMode | 'idle'>('idle');
  const [details, setDetails] = useState<StreamStatus | null>(null);
  const [h265Stats, setH265Stats] = useState<H265ClientStats>({ fps: null, bitrateKbps: null });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const h265Ref = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ControllerHandle | null>(null);
  const startTokenRef = useRef(0);
  const lastPlaybackOkAtRef = useRef(0);
  const backendDownCountRef = useRef(0);
  const isRunning = Boolean(stream);
  const browserPerf = useBrowserPerformanceStats(isRunning && mode === 'h265');

  useEffect(() => {
    if (!stream) return;
    const timer = window.setInterval(() => {
      void getStreamStatus(stream.stream_id).then((nextDetails) => {
        setDetails(nextDetails);
        if (mode === 'h265') {
          return;
        }
        if (nextDetails.health_state === 'playing') {
          backendDownCountRef.current = 0;
          setStatus('正在播放');
          setOk(true);
          return;
        }

        if (nextDetails.health_state === 'recovering' || nextDetails.health_state === 'restarting') {
          const playbackRecentlyOk = Date.now() - lastPlaybackOkAtRef.current < 15_000;
          if (videoLooksAlive(videoRef.current) || playbackRecentlyOk) {
            setStatus('正在播放');
            setOk(true);
          } else {
            setStatus('正在恢复画面...');
            setOk(false);
          }
          return;
        }

        if (nextDetails.health_state === 'unavailable') {
          setStatus('视频源暂时不可用，请稍后重试');
          setOk(false);
          return;
        }

        if (nextDetails.running) {
          backendDownCountRef.current = 0;
          return;
        }

        if (!nextDetails.running) {
          backendDownCountRef.current += 1;
          const playbackRecentlyOk = Date.now() - lastPlaybackOkAtRef.current < 15_000;
          if (videoLooksAlive(videoRef.current) || playbackRecentlyOk) {
            setStatus('正在播放');
            setOk(true);
            return;
          }

          if (backendDownCountRef.current < 3) {
            return;
          }

          setStatus(nextDetails.last_error || '上游连接失败或已退出，请检查 RTSP/RTMP/HTTP-FLV 地址是否能被 Docker 网关访问');
          setOk(false);
        }
      }).catch((err) => {
        backendDownCountRef.current += 1;
        if (backendDownCountRef.current < 2 && videoLooksAlive(videoRef.current)) {
          return;
        }
        setDetails(null);
        setStatus(err instanceof Error ? err.message : '连接已断开，请重新播放');
        setOk(false);
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [stream, mode]);

  async function start() {
    if (!url.trim()) {
      setStatus('请先输入 RTSP/RTMP/HTTP-FLV 地址');
      setOk(false);
      return;
    }
    const startToken = startTokenRef.current + 1;
    startTokenRef.current = startToken;
    const previousStream = stream;
    const previousController = controllerRef.current;
    backendDownCountRef.current = 0;
    setH265Stats({ fps: null, bitrateKbps: null });
    setBusy(true);
    setStatus(stream ? '正在切换视频源...' : '正在创建流...');
    setOk(false);
    try {
      const created = await createStream(url.trim(), 'auto');
      if (startTokenRef.current !== startToken) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const h265Container = h265Ref.current;
      if (!video || !canvas || !h265Container) throw new Error('播放器未就绪');

      setMode('hls');
      if (!isH265Source(created.source_video_codec)) {
        setStatus('正在等待上游视频分片...');
        await waitForHlsReady(created.hls_url, {
          timeoutMs: 60_000,
          intervalMs: 700,
          minSegments: 3,
          onTick: (attempt) => {
            if (attempt > 1) setStatus(`正在等待上游视频分片...(${attempt})`);
          }
        });
        if (startTokenRef.current !== startToken) return;
      }

      previousController?.destroy();
      controllerRef.current = startPlayer(created, video, canvas, h265Container, setMode, (text, nextOk) => {
        setStatus(text);
        if (nextOk === true) {
          lastPlaybackOkAtRef.current = Date.now();
          setOk(true);
        } else if (nextOk === false) {
          setOk(videoLooksAlive(videoRef.current));
        }
      }, setH265Stats);
      setStream(created);
      const nextDetails = await getStreamStatus(created.stream_id);
      setDetails(nextDetails);
      if (previousStream && previousStream.stream_id !== created.stream_id) {
        void deleteStream(previousStream.stream_id).catch(() => undefined);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '启动失败');
      setOk(false);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    startTokenRef.current += 1;
    setBusy(true);
    try {
      controllerRef.current?.destroy();
      controllerRef.current = null;
      if (stream) await deleteStream(stream.stream_id);
      setStream(null);
      setDetails(null);
      setMode('idle');
      setH265Stats({ fps: null, bitrateKbps: null });
      setStatus('已停止');
      setOk(false);
      backendDownCountRef.current = 0;
      lastPlaybackOkAtRef.current = 0;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '停止失败');
    } finally {
      setBusy(false);
    }
  }

  const friendlyStatus = toFriendlyStatus(status, busy, ok);
  const diagnostics = details?.diagnostics;
  const displayFps = mode === 'h265' ? h265Stats.fps : diagnostics?.fps;
  const displayBitrate = mode === 'h265' ? h265Stats.bitrateKbps : diagnostics?.bitrate_kbps;
  const displaySmoothness = mode === 'h265' ? formatSmoothness(h265Stats, displayFps) : '--';
  const displayDecodedFps = h265Stats.decodedFps ?? (mode === 'h265' ? h265Stats.fps : null);
  const displayRenderedFps = h265Stats.renderedFps ?? (mode === 'h265' ? h265Stats.fps : null);
  const bottleneck = diagnosePlayback(h265Stats, browserPerf, mode);
  const sourceWidth = details?.source_width ?? stream?.source_width;
  const sourceHeight = details?.source_height ?? stream?.source_height;
  const pipelineLabel = playbackPipelineLabel(mode, h265Stats);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-block">
          <h1>视频预览</h1>
        </div>
        <div className="topbar-status" aria-live="polite">
          <span className={ok ? 'pulse is-on' : 'pulse'} />
          <span>{ok ? '画面在线' : isRunning ? '连接中' : '待播放'}</span>
        </div>
      </header>

      <section className="console-card">
        <div className="control-panel">
          <form className="url-form" onSubmit={(event) => { event.preventDefault(); void start(); }}>
            <label className="url-input-wrap" htmlFor="stream-url">
              <span>视频地址</span>
              <input id="stream-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="粘贴视频流地址" spellCheck={false} />
            </label>
            <button type="submit" disabled={busy}>{busy ? '连接中' : isRunning ? '切换' : '播放'}</button>
            <button type="button" className="secondary" onClick={() => void stop()} disabled={busy || !isRunning}>停止</button>
          </form>
          <div className="quick-stats" aria-label="流状态概览">
            {SHOW_DIAGNOSTICS && (
              <div>
                <span>帧率</span>
                <strong>{formatNumber(displayFps)}</strong>
              </div>
            )}
            <div>
              <span>处理</span>
              <strong>{formatTreatment(details, mode)}</strong>
            </div>
            {SHOW_DIAGNOSTICS && (
              <>
                <div>
                  <span>编码</span>
                  <strong>{formatCodec(details?.source_video_codec)}</strong>
                </div>
                <div>
                  <span>链路</span>
                  <strong>{pipelineLabel}</strong>
                </div>
                <div>
                  <span>{mode === 'h265' || mode === 'native-hevc' ? '流畅度' : '状态'}</span>
                  <strong>{mode === 'h265' && ok ? displaySmoothness : details?.health_label ?? '待机'}</strong>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="player-frame">
          <video ref={videoRef} controls muted playsInline />
          <canvas ref={canvasRef} width={1280} height={720} hidden />
          <div ref={h265Ref} className="h265-stage" hidden />
          {!isRunning && !busy && (
            <div className="empty-state">
              <div className="lens-mark" />
              <strong>等待信号</strong>
              <span>输入地址后开始预览</span>
            </div>
          )}
          {busy && <div className="loading"><span />正在建立视频通道</div>}
          {isRunning && (
            <div className="diagnostics-strip" aria-label="当前流状态">
              <span>{formatTreatment(details, mode)}</span>
              {SHOW_DIAGNOSTICS && (
                <>
                  <span>帧率 {formatNumber(displayFps)}</span>
                  <span>码率 {formatBitrate(displayBitrate)}</span>
                  <span>{formatCodec(details?.source_video_codec)}</span>
                  <span>{pipelineLabel}</span>
                  {mode === 'h265' && <span>流畅度 {displaySmoothness}</span>}
                  <span>{mode === 'h265' || mode === 'native-hevc' ? '浏览器端' : diagnostics?.segment_fresh ? '分片正常' : '分片等待'}</span>
                  {(mode === 'h265' || mode === 'native-hevc') && <span>同源转发</span>}
                </>
              )}
            </div>
          )}
          {SHOW_DIAGNOSTICS && isRunning && (mode === 'h265' || mode === 'native-hevc') && (
            <div className="performance-panel" aria-label="浏览器性能诊断">
              <div className="performance-panel__head">
                <span>诊断</span>
                <strong>{bottleneck}</strong>
              </div>
              <div className="performance-metrics">
                <span>解码 {formatNumber(displayDecodedFps)}</span>
                <span>渲染 {formatNumber(displayRenderedFps)}</span>
                <span>耗时 {formatMs(h265Stats.renderCostMs)}</span>
                <span>P95 {formatMs(h265Stats.frameIntervalP95Ms, 0)}</span>
                <span>丢帧 {formatCount(h265Stats.droppedFrames)}</span>
                <span>排队 {formatCount(h265Stats.queueDepth)}</span>
                <span>长任务 {browserPerf.longTaskCount}</span>
                <span>内存 {browserPerf.memoryMB ? `${browserPerf.memoryMB.toFixed(0)}M` : '--'}</span>
                <span>分辨率 {formatResolution(sourceWidth, sourceHeight)}</span>
                <span>{pipelineLabel}</span>
              </div>
            </div>
          )}
          <div className="video-chrome">
            <div className={`status ${ok ? 'ok' : ''}`}>{friendlyStatus}</div>
            <div className="stream-meta">
              <span>{SHOW_DIAGNOSTICS ? pipelineLabel : formatTreatment(details, mode)}</span>
              {SHOW_DIAGNOSTICS && <span>{stream?.stream_id ? stream.stream_id.slice(0, 8) : '--------'}</span>}
            </div>
          </div>
        </div>

        <div className="visually-hidden" aria-hidden="true">
          <span data-testid="mode-label">{modeLabel(mode)}</span>
          <span data-testid="player-status">{status}</span>
        </div>

        <div className="details-grid visually-hidden" aria-hidden="true">
          <div><b>streamId</b><code data-testid="stream-id">{stream?.stream_id ?? '-'}</code></div>
          <div><b>ws</b><code data-testid="ws-url">{stream?.ws_url ?? '-'}</code></div>
          <div><b>hls</b><code data-testid="hls-url">{stream?.hls_url ?? '-'}</code></div>
          <div><b>pid</b><code data-testid="upstream-pid">{details?.upstream_pid ?? '-'}</code></div>
          <div><b>reused</b><code data-testid="reused">{stream ? String(stream.reused) : '-'}</code></div>
          <div><b>dropped</b><code data-testid="dropped">{details?.dropped_frames ?? 0}</code></div>
          <div><b>帧率</b><code data-testid="fps">{displayFps ?? '-'}</code></div>
          <div><b>renderP95</b><code data-testid="render-p95">{h265Stats.frameIntervalP95Ms ?? '-'}</code></div>
          <div><b>clientDropped</b><code data-testid="client-dropped">{h265Stats.droppedFrames ?? 0}</code></div>
          <div><b>diagnosis</b><code data-testid="client-diagnosis">{bottleneck}</code></div>
          <div><b>longTasks</b><code data-testid="client-longtasks">{browserPerf.longTaskCount}</code></div>
        </div>
      </section>
    </main>
  );
}

export default App;

function isH265Source(codec: string | null | undefined) {
  const normalized = codec?.toLowerCase();
  return normalized === 'hevc' || normalized === 'h265';
}

function modeLabel(mode: ActiveMode | 'idle') {
  if (mode === 'idle') return '未连接';
  if (mode === 'webcodecs') return '低延迟';
  if (mode === 'native-hevc') return '原生硬解';
  if (mode === 'h265') return '浏览器解码';
  return '稳定播放';
}
