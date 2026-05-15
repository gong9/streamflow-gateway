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
const patchedBundle = bundle.replace(
  /gl\?\.drawImage\(videoFrame, 0, 0, canvas\.width, canvas\.height\);\s+gl\?\.commit\(\);/,
  `gl?.drawImage(videoFrame, 0, 0, canvas.width, canvas.height);
                videoFrame.close();
                gl?.commit();`
);

if (patchedBundle === bundle) {
  throw new Error('Failed to patch Jessibuca4 worker canvas VideoFrame cleanup');
}

await writeFile(bundlePath, patchedBundle);

await copyFile(
  resolve(root, 'node_modules/jv4-decoder/wasm/types/videodec_simd.wasm'),
  resolve(outDir, 'videodec_simd.wasm')
);
