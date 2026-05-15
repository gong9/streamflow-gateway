import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/vendor/jessibuca4');
const entry = resolve(root, 'scripts/jv4-simd-entry.ts');

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: resolve(outDir, 'jv4-simd.js'),
  tsconfig: resolve(root, 'scripts/jv4-tsconfig.json'),
  logLevel: 'info'
});

const bundlePath = resolve(outDir, 'jv4-simd.js');
const bundle = await readFile(bundlePath, 'utf8');
let patchedBundle = bundle.replace(
  `const gl = canvas?.getContext("2d");
      let width = 0;
      let height = 0;`,
  `const gl = canvas?.getContext("2d");
      let width = 0;
      let height = 0;
      let pendingFrame = null;
      let pendingPts = 0;
      let droppedFrames = 0;
      const renderIntervalMs = 25;
      const drawPendingFrame = () => {
        if (!canvas || !gl || !pendingFrame) return;
        const frame = pendingFrame;
        const pts = pendingPts;
        pendingFrame = null;
        const startedAt = performance.now();
        try {
          gl.drawImage(frame, 0, 0, canvas.width, canvas.height);
          self.postMessage({
            type: "rendered",
            pts,
            at: performance.now(),
            costMs: performance.now() - startedAt,
            dropped: droppedFrames
          });
          droppedFrames = 0;
        } finally {
          frame.close();
        }
      };
      const renderTimer = canvas ? setInterval(drawPendingFrame, renderIntervalMs) : 0;`
);

patchedBundle = patchedBundle.replace(
  `const videoFrame = new VideoFrame(data, {
                codedWidth: width,
                codedHeight: height,
                format: "I420",
                timestamp: pts
              });
              if (canvas) {
                gl?.drawImage(videoFrame, 0, 0, canvas.width, canvas.height);
                gl?.commit();
              } else {
                self.postMessage({ type: "yuvData", videoFrame }, [videoFrame]);
              }`,
  `if (packedYuvMode && !canvas) {
                self.postMessage({ type: "packedYuvData", data: data.buffer, width, height, timestamp: pts }, [data.buffer]);
              } else {
                const videoFrame = new VideoFrame(data, {
                  codedWidth: width,
                  codedHeight: height,
                  format: "I420",
                  timestamp: pts
                });
                if (canvas) {
                  if (pendingFrame) {
                    pendingFrame.close();
                    droppedFrames += 1;
                  }
                  self.postMessage({ type: "decoded", pts, at: performance.now() });
                  pendingFrame = videoFrame;
                  pendingPts = pts;
                } else {
                  self.postMessage({ type: "yuvData", videoFrame }, [videoFrame]);
                }
              }`
);

patchedBundle = patchedBundle.replace(
  `const { canvas, wasmScript, wasmBinary } = evt.data;`,
  `const { canvas, wasmScript, wasmBinary, packedYuvMode = false } = evt.data;`
);

patchedBundle = patchedBundle.replace(
  `if (evt.data.type === "ready") {
            delete this.wasmBinary;
            resolve();
            console.warn(\`worker mode initialize success\`);
          } else if (evt.data.type === "yuvData") {
            const { videoFrame } = evt.data;
            this.emit("videoFrame" /* VideoFrame */, videoFrame);
          }`,
  `if (evt.data.type === "ready") {
            delete this.wasmBinary;
            resolve();
            console.warn(\`worker mode initialize success\`);
          } else if (evt.data.type === "yuvData") {
            const { videoFrame } = evt.data;
            this.emit("videoFrame" /* VideoFrame */, videoFrame);
          } else if (evt.data.type === "packedYuvData") {
            this.emit("packedYuvData", evt.data);
          } else if (evt.data.type === "decoded") {
            this.emit("decoded", evt.data);
          } else if (evt.data.type === "rendered") {
            this.emit("rendered", evt.data);
          }`
);

patchedBundle = patchedBundle.replace(
  `  constructor(createModule, wasmBinary, workerMode = false, canvas, yuvMode = false) {
    super();
    this.createModule = createModule;
    this.wasmBinary = wasmBinary;
    this.workerMode = workerMode;
    this.canvas = canvas;
    this.yuvMode = yuvMode;`,
  `  constructor(createModule, wasmBinary, workerMode = false, canvas, yuvMode = false, packedYuvMode = false) {
    super();
    this.createModule = createModule;
    this.wasmBinary = wasmBinary;
    this.workerMode = workerMode;
    this.canvas = canvas;
    this.yuvMode = yuvMode;
    this.packedYuvMode = packedYuvMode;`
);

patchedBundle = patchedBundle.replace(
  `this.worker.postMessage({ type: "init", canvas: offsetCanvas, wasmScript: this.createModule.toString(), wasmBinary }, offsetCanvas ? [offsetCanvas, wasmBinary] : [wasmBinary]);`,
  `this.worker.postMessage({ type: "init", canvas: offsetCanvas, wasmScript: this.createModule.toString(), wasmBinary, packedYuvMode: this.packedYuvMode }, offsetCanvas ? [offsetCanvas, wasmBinary] : [wasmBinary]);`
);

patchedBundle = patchedBundle.replace(
  `super(videodec_simd_default, opt?.wasmPath ? fetch(opt.wasmPath).then((res) => res.arrayBuffer()) : void 0, opt?.workerMode, opt?.canvas, opt?.yuvMode);`,
  `super(videodec_simd_default, opt?.wasmPath ? fetch(opt.wasmPath).then((res) => res.arrayBuffer()) : void 0, opt?.workerMode, opt?.canvas, opt?.yuvMode, opt?.packedYuvMode);`
);

patchedBundle = patchedBundle.replace(
  `  close() {
    this.removeAllListeners();
    if (this.decoder) {`,
  `  close() {
    this.removeAllListeners();
    if (this.worker) {
      this.worker.terminate();
      this.worker = void 0;
    }
    if (this.decoder) {`
);

if (patchedBundle === bundle) {
  throw new Error('Failed to patch Jessibuca4 worker direct canvas runtime');
}

await writeFile(bundlePath, patchedBundle);

await copyFile(
  resolve(root, 'node_modules/jv4-decoder/wasm/types/videodec_simd.wasm'),
  resolve(outDir, 'videodec_simd.wasm')
);
