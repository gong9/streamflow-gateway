# Experimental Workers

这个目录预留给浏览器 H265 Turbo 软解实验链路。

计划拆分：

- `demux.worker.ts`: 拉流和解封装，输出 H265 NALU/EncodedVideoChunk。
- `decode.worker.ts`: 驱动 WASM SIMD/pthreads 解码核心。
- `render.worker.ts`: OffscreenCanvas + WebGPU/WebGL 渲染。

当前目录先不接入主播放器，避免影响生产链路。
