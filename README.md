# streamflow-gateway

面向摄像头和直播流的轻量网关。支持把 `RTSP / RTMP / HTTP-FLV` 输入转成浏览器可播放的 HLS，并提供流状态、诊断指标和前端预览页面。

## 核心优势

- **高并发友好**：同一个源地址只拉一路 upstream，多人观看复用同一路转码结果。
- **自动省资源**：服务会先探测源编码，H264 直接 remux；H265 优先交给浏览器 Jessibuca/WASM 原始播放，浏览器解码过慢时再按需启动低分辨率轻量转码。
- **H265 前端优化**：浏览器端使用 SIMD WASM 解码和节奏化渲染队列，优先丢旧帧保实时，降低监控画面 PPT 式卡顿。
- **浏览器直接播放**：前端只需要输入流地址，后端输出 HLS，浏览器用 `<video>` / HLS.js 播放。
- **多流隔离**：不同视频源独立运行，单路异常不会影响其他流。
- **自动恢复**：检测上游退出、分片长时间不更新后自动重启。
- **空闲清理**：无人观看后按 TTL 自动释放 upstream，避免资源泄露。
- **状态可观测**：提供 FPS、速度、分片新鲜度、重启次数、viewer 数等诊断信息。
- **部署简单**：推荐本地构建 `linux/amd64` 镜像，服务器只负责加载镜像和重启容器。

## 架构

```text
RTSP / RTMP / HTTP-FLV
        ↓
Rust Gateway
        ↓
FFmpeg 自动 remux / H265 直出 / 按需转码
        ↓
浏览器前端播放
```

并发重点：

```text
100 个用户看同一个摄像头
        ↓
1 路 upstream + 1 路转码 + 100 个 HLS 读取
```

## 本地启动

启动 ZLMediaKit sidecar：

```bash
make docker-up
```

启动后端：

```bash
make dev-api
```

启动前端开发服务：

```bash
cd apps/web-demo
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:5178
```

## 本地一体化服务

构建并启动完整 Docker 服务：

```bash
make docker-stack-up
```

访问：

```text
http://127.0.0.1:5177
```

## 生产部署

推荐方式：本地构建 `linux/amd64` 镜像，再上传服务器。服务器不编译 Rust、Node 或 FFmpeg。

首次需要安装本地构建工具：

```bash
brew install zig
cargo install cargo-zigbuild
```

构建 amd64 镜像：

```bash
make image-amd64
```

上传并重启远端服务：

```bash
make deploy-image
```

一条命令完成构建和部署：

```bash
make release-amd64
```

默认部署目标：

```text
root@example.com:/opt/streamflow-gateway
```

默认生产访问：

```text
http://example.com
```

生产端口设计：

```text
公网 80 -> nginx -> gateway:8000
```

2C2G 小服务器默认会限制容器资源，避免多路转码把整机打满：

```text
gateway: 1.6 CPU / 1500m 内存
zlm:     0.3 CPU / 256m 内存
```

这类限制是为了保护机器，不是提升转码能力。多路不同源同时转码仍建议控制在 1-2 路。

现在服务会自动选择处理策略：

```text
源视频是 H264 -> 只 remux 成 HLS，CPU 压力低
源视频是 H265/HEVC -> 优先推给 ZLMediaKit 原始直出，前端 H265 播放失败后再按需转 H264
源视频未知 -> 使用安全的 H264 兼容兜底
```

可以通过 `GET /api/streams/:streamId/status` 里的 `profiles`、`recommended_profile`、`source_video_codec` 和 `strategy_reason` 判断每一路是否在转码。

详细部署说明见 [docs/deployment.md](docs/deployment.md)。
H265 前端播放优化记录见 [docs/frontend-h265-playback.md](docs/frontend-h265-playback.md)。

## 常用接口

创建或复用流：

```http
POST /api/streams
```

查看活跃流：

```http
GET /api/streams
```

查看单路状态：

```http
GET /api/streams/:streamId/status
```

查看诊断指标：

```http
GET /api/streams/:streamId/diagnostics
```

停止/释放流：

```http
DELETE /api/streams/:streamId
```

HLS 播放地址：

```text
/hls/live/:streamId/hls.m3u8
```

## 关键配置

复制环境变量模板：

```bash
cp .env.example .env
```

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `GATEWAY_HOST` | 网关监听地址 | `0.0.0.0` |
| `GATEWAY_PORT` | 网关端口 | 本地 `5177` / 生产 `8000` |
| `MAX_UPSTREAMS` | 最大 upstream 数 | `50` |
| `MAX_VIEWERS` | 最大 viewer 数 | `500` |
| `MAX_TRANSCODE_STREAMS` | 最大 H264 兼容转码路数 | `2` |
| `TRANSCODE_HEIGHT` | H265 轻量兼容输出高度 | `540` |
| `CLEANUP_AFTER_SECS` | 空闲清理时间 | `120` |
| `VIEWER_BUFFER_BYTES` | viewer 缓冲大小 | `262144` |
| `ZLM_HTTP_ORIGIN` | ZLMediaKit HTTP 地址 | `http://zlm:80` |
| `ZLM_RTMP_ORIGIN` | ZLMediaKit RTMP 推流地址 | `rtmp://zlm:1935/live` |
| `STREAMFLOW_H265_DIRECT` | H265 原始直出开关 | `1` |
| `STREAMFLOW_H264_FALLBACK` | H264 兼容兜底开关 | `1` |
| `VITE_JESSIBUCA_SCRIPT_URL` | 可选 H265 Web 播放器脚本覆盖地址 | 内置 Jessibuca |
| `VITE_JESSIBUCA_DECODER_URL` | 可选 H265 Web 播放器解码器覆盖地址 | 内置 decoder |
| `GATEWAY_CPUS` | gateway CPU 限制 | `1.6` |
| `GATEWAY_MEM_LIMIT` | gateway 内存限制 | `1500m` |
| `ZLM_CPUS` | ZLM CPU 限制 | `0.3` |
| `ZLM_MEM_LIMIT` | ZLM 内存限制 | `256m` |

## 测试

```bash
make check
make test
make test-functional
make test-frontend-flow
make load
```

压测示例：

```bash
make load LOAD_STREAMS=50 LOAD_VIEWERS=500 LOAD_DURATION_SECONDS=60
```

## 当前定位

这是一个生产雏形，适合做摄像头预览、直播流接入、内网/公网视频源聚合和高并发播放验证。

第一版主路径是 **HLS 稳定播放**。WebCodecs/WebSocket 路径保留为实验能力，后续低延迟场景更建议接 WebRTC。
