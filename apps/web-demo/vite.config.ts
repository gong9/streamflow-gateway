import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gatewayTarget = process.env.VITE_GATEWAY_TARGET ?? 'http://127.0.0.1:5177';
const webPort = Number(process.env.VITE_WEB_PORT ?? 5178);
const wsTarget = gatewayTarget.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': gatewayTarget,
      '/ws': { target: wsTarget, ws: true },
      '/hls': gatewayTarget
    }
  },
  test: {
    environment: 'jsdom',
    exclude: ['node_modules/**', 'dist/**', 'src/tests/e2e/**']
  }
});
