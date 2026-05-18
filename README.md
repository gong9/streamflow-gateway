# streamflow-gateway

轻量流媒体网关。面向摄像头、公网直播流和内网视频源，把 `RTSP / RTMP / HTTP-FLV` 接入后，输出浏览器可播放的预览链路。

核心目标不是做一个重型流媒体平台，而是用尽量少的服务器 CPU 承载更多实时预览。

## 核心优势

- **少转码**：H264 走轻量 remux；H265 优先走浏览器原生硬解；只有浏览器播不了时才启用 H264 兼容转码。
- **同源复用**：同一个流地址只拉一路 upstream，多人观看共享同一份输出，避免重复拉流和重复转码。
- **H265 友好**：提供 `/fmp4` 原生 HEVC MSE 路径和 `/raw-flv` 原始流路径，服务端尽量只转封装、不重编码。
- **小机器可控**：内置 upstream、viewer、转码路数限制，保护 2C2G 这类小服务器不被多路 H265 打满。
- **自动恢复与清理**：上游退出、分片停更会自动恢复；无人观看后自动释放进程和临时文件。
- **可观测**：接口返回编码、策略、viewer 数、FPS、分片新鲜度、重启次数和当前播放链路。

## 当前播放策略

```text
RTSP / RTMP / HTTP-FLV
  -> Rust Gateway 创建或复用 streamId
  -> FFprobe 探测编码
  -> H264: HLS / MSE 兼容播放
  -> H265: 优先 /fmp4 原生硬解
  -> 失败后: 按需 H264 HLS 兼容兜底
```

H265 的关键思路：

```text
能让浏览器硬解，就不要让服务器转码。
能转封装解决，就不要重新编码。
```

实验性的 WASM 软解链路仍保留，但默认生产构建不启用。需要实验页面时使用 `build:experiments`。

## 浏览器软解实验优势

软解不是默认兜底主路径，但它解决的是另一个关键问题：当浏览器不能原生硬解 H265 时，仍然尽量不把压力打回服务器。

- **服务器继续省 CPU**：H265 数据通过 `/raw-flv` 原始直出，服务端只做接入和转封装，避免默认启动 H265 -> H264 转码。
- **端侧消化算力**：把解码压力分散到观看端浏览器，适合多用户看不同 H265 源时保护服务器。
- **可控播放管线**：软解链路拆成 demux、decode、frame queue、render clock、renderer，方便定位瓶颈。
- **实时优先**：队列过深时优先丢旧帧，保证监控预览尽量接近实时，而不是为了每帧必播变成 PPT。
- **渲染可替换**：支持 Canvas2D / WebGL / Worker VideoFrame 等实验渲染路径，后续可以按浏览器能力选择最合适的输出。
- **诊断更细**：能看到 decoded FPS、rendered FPS、丢帧、队列深度、渲染耗时和 P95 帧间隔，用来判断是解码慢、渲染慢还是输入抖动。

所以当前策略不是“软解替代硬解”，而是：

```text
原生硬解优先；
软解用于扩大 H265 可播放范围；
服务器转码只做最后保险。
```

## 架构

```text
用户输入流地址
  -> POST /api/streams
  -> StreamManager 按 normalized URL 复用 stream
  -> FFmpeg 拉流、探测、转封装或兜底转码
  -> /hls /fmp4 /raw-flv 输出
  -> React Demo 播放与展示诊断状态
```

同源复用效果：

```text
100 个用户看同一个摄像头
  -> 1 路 upstream
  -> 1 份输出
  -> 100 个浏览器读取
```

## 本地启动

启动 ZLMediaKit sidecar：

```bash
make docker-up
```

启动网关：

```bash
make dev-api
```

启动前端：

```bash
cd apps/web-demo
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:5178
```

也可以一体化启动 Docker 服务：

```bash
make docker-stack-up
```

访问：

```text
http://127.0.0.1:5177
```

## 生产部署

推荐在本地构建 `linux/amd64` 镜像，再上传服务器。服务器只负责加载镜像和重启容器，不负责编译 Rust、Node 或 FFmpeg。

```bash
make image-amd64
make deploy-image
```

一条命令完成：

```bash
make release-amd64
```

生产推荐入口：

```text
公网 80/443 -> nginx -> gateway:8000
```

## 常用接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/streams` | 创建或复用一路流 |
| `GET` | `/api/streams` | 查看活跃流 |
| `GET` | `/api/streams/:streamId/status` | 查看单路状态 |
| `GET` | `/api/streams/:streamId/diagnostics` | 查看诊断指标 |
| `POST` | `/api/streams/:streamId/profiles/fallback-h264` | 按需启动 H264 兼容兜底 |
| `DELETE` | `/api/streams/:streamId` | 停止并释放流 |
| `GET` | `/hls/live/:streamId/hls.m3u8` | HLS 播放地址 |
| `GET` | `/fmp4/:streamId.mp4` | H265 fMP4 原生硬解路径 |
| `GET` | `/raw-flv/:streamId.flv` | H265 raw FLV 实验/软解路径 |

## 关键配置

复制环境变量模板：

```bash
cp .env.example .env
```

最常用的配置：

| 变量 | 说明 |
| --- | --- |
| `GATEWAY_HOST` / `GATEWAY_PORT` | 网关监听地址和端口 |
| `MAX_UPSTREAMS` | 最大 upstream 数 |
| `MAX_VIEWERS` | 最大 viewer 数 |
| `MAX_TRANSCODE_STREAMS` | 最大 H264 兼容转码路数 |
| `TRANSCODE_HEIGHT` | 兼容转码输出高度 |
| `CLEANUP_AFTER_SECS` | 无人观看后的清理时间 |
| `STREAMFLOW_H265_DIRECT` | H265 直出能力开关 |
| `STREAMFLOW_H264_FALLBACK` | H264 兼容兜底开关 |

## 前端构建

默认生产构建只包含主预览页面：

```bash
npm --prefix apps/web-demo run build
```

需要实验页和 H265 WASM 软解实验链路：

```bash
npm --prefix apps/web-demo run build:experiments
```

## 测试

```bash
make check
make test
make test-functional
make test-frontend-flow
```

压测：

```bash
make load LOAD_STREAMS=50 LOAD_VIEWERS=500 LOAD_DURATION_SECONDS=60
```

## 当前定位

`streamflow-gateway` 适合做摄像头预览、直播流接入、视频源聚合和小服务器上的多路预览验证。

当前主线是 **稳定预览 + H265 少转码**。低延迟互动场景后续更适合接 WebRTC。
