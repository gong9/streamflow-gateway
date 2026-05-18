import React from 'react';
import { createRoot } from 'react-dom/client';
import './site.css';

const advantages = [
  {
    title: '少转码',
    text: 'H264 走轻量 remux，H265 优先交给浏览器原生硬解，只有播不了时才启动服务器 H264 兜底。'
  },
  {
    title: '同源复用',
    text: '相同流地址只拉一路 upstream，多人观看共享同一份输出，避免重复拉流、重复切片和重复转码。'
  },
  {
    title: 'H265 友好',
    text: '提供 /fmp4 原生 HEVC MSE 和 /raw-flv 原始流路径，服务端尽量只转封装，不重新编码。'
  },
  {
    title: '小机器可控',
    text: '内置 upstream、viewer、转码路数和空闲清理策略，保护 2C2G 小服务器不被多路 H265 打满。'
  }
];

const softDecode = [
  'demux / decode / frame queue / render clock 分层管线',
  '队列过深时优先丢旧帧，监控预览保持实时',
  'Canvas2D / WebGL / Worker VideoFrame 多渲染路径',
  'decoded FPS、rendered FPS、丢帧、P95 帧间隔可观测'
];

const metrics = [
  ['1 路', '同源 upstream'],
  ['100+', '共享 viewer'],
  ['0 转码', '优先路径'],
  ['2C2G', '可控部署']
];

function Site() {
  return (
    <main className="site-page">
      <nav className="site-nav" aria-label="主导航">
        <a className="site-brand" href="/site.html" aria-label="Streamflow Gateway 官网">
          <span className="brand-mark" aria-hidden="true">SF</span>
          <span>Streamflow Gateway</span>
        </a>
        <div className="nav-links">
          <a href="#advantage">优势</a>
          <a href="#pipeline">链路</a>
          <a href="#soft-decode">软解</a>
          <a href="/">打开 Demo</a>
        </div>
      </nav>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">RTSP / RTMP / HTTP-FLV 轻量接入</p>
          <h1>让摄像头预览少转码、能复用、跑得住。</h1>
          <p className="hero-lead">
            Streamflow Gateway 是面向真实视频源的轻量流媒体网关。它把复杂的拉流、探测、转封装、H265 兼容和状态诊断收敛成一个可部署的预览入口。
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="/">打开播放 Demo</a>
            <a className="secondary-action" href="#pipeline">查看技术链路</a>
          </div>
          <div className="metric-row reveal-group" aria-label="核心指标">
            {metrics.map(([value, label]) => (
              <div className="metric-item" key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="product-visual hero-visual-motion" aria-label="Streamflow Gateway 产品界面预览">
          <div className="visual-topbar">
            <span className="dot is-red" />
            <span className="dot is-yellow" />
            <span className="dot is-green" />
            <span className="visual-title">streamflow live console</span>
          </div>
          <div className="visual-body">
            <div className="video-pane">
              <div className="scanline" />
              <div className="camera-label">H265 camera / fMP4 / native HEVC</div>
              <div className="play-ring" />
              <div className="signal-dot dot-a" />
              <div className="signal-dot dot-b" />
              <div className="signal-dot dot-c" />
            </div>
            <div className="status-pane">
              <div className="status-card">
                <span>策略</span>
                <strong>原生硬解优先</strong>
              </div>
              <div className="status-card">
                <span>viewer</span>
                <strong>128 shared</strong>
              </div>
              <div className="status-card">
                <span>fallback</span>
                <strong>按需启用</strong>
              </div>
              <div className="route-list">
                <span>/hls/live/stream.m3u8</span>
                <span>/fmp4/stream.mp4</span>
                <span>/raw-flv/stream.flv</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-block" id="advantage">
        <div className="section-heading">
          <p className="eyebrow">Core advantage</p>
          <h2>不是堆转码能力，而是减少不必要的重活。</h2>
        </div>
        <div className="advantage-grid reveal-group">
          {advantages.map((item, index) => (
            <article className="advantage-card" key={item.title} style={{ '--delay': `${index * 90}ms` } as React.CSSProperties}>
              <span className="card-index">{item.title.slice(0, 2)}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pipeline-section" id="pipeline">
        <div className="section-heading">
          <p className="eyebrow">Playback strategy</p>
          <h2>H265 源优先走浏览器端能力，服务器只做最后保险。</h2>
        </div>
        <div className="pipeline-card">
          <div className="pipeline-step">输入流</div>
          <div className="pipeline-arrow" />
          <div className="pipeline-step">FFprobe 探测</div>
          <div className="pipeline-arrow" />
          <div className="pipeline-step is-strong">H265: /fmp4 硬解</div>
          <div className="pipeline-arrow" />
          <div className="pipeline-step">失败后 H264 HLS</div>
        </div>
        <div className="principle">
          <span>原则</span>
          <p>能让浏览器硬解，就不要让服务器转码；能转封装解决，就不要重新编码。</p>
        </div>
      </section>

      <section className="soft-section" id="soft-decode">
        <div className="soft-copy">
          <p className="eyebrow">Browser soft decode lab</p>
          <h2>软解链路用于扩大 H265 可播放范围。</h2>
          <p>
            当浏览器不能原生 HEVC MSE 时，软解实验链路让 H265 数据继续从 `/raw-flv` 原始直出，把解码压力分散到观看端，同时保留可诊断、可替换的播放管线。
          </p>
        </div>
        <div className="soft-list">
          {softDecode.map((item, index) => (
            <div className="soft-item" key={item} style={{ '--delay': `${index * 100}ms` } as React.CSSProperties}>
              <span aria-hidden="true" />
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="deploy-section">
        <div>
          <p className="eyebrow">Deploy</p>
          <h2>本地构建，服务器只运行。</h2>
          <p>推荐本地构建 linux/amd64 镜像后上传，小服务器不用编译 Rust、Node 或 FFmpeg。</p>
        </div>
        <pre aria-label="部署命令"><code>make image-amd64{'\n'}make deploy-image</code></pre>
      </section>
    </main>
  );
}

createRoot(document.getElementById('site-root')!).render(
  <React.StrictMode>
    <Site />
  </React.StrictMode>
);
