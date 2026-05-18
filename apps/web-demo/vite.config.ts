import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const gatewayTarget = process.env.VITE_GATEWAY_TARGET ?? 'http://127.0.0.1:5177';
const webPort = Number(process.env.VITE_WEB_PORT ?? 5178);
const wsTarget = gatewayTarget.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        experimentalRuntime: resolve(__dirname, 'experimental-runtime.html'),
        experimentalDemux: resolve(__dirname, 'experimental-demux.html'),
        experimentalDecode: resolve(__dirname, 'experimental-decode.html')
      }
    }
  },
  server: {
    port: webPort,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    proxy: {
      '/api': gatewayTarget,
      '/ws': { target: wsTarget, ws: true },
      '/raw-flv': gatewayTarget,
      '/fmp4': gatewayTarget,
      '/hls': gatewayTarget,
      '/zlm': gatewayTarget
    }
  },
  test: {
    environment: 'jsdom',
    exclude: ['node_modules/**', 'dist/**', 'src/tests/e2e/**']
  }
});
