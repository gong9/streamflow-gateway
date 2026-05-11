import { defineConfig } from '@playwright/test';

const webPort = process.env.VITE_WEB_PORT ?? '5178';
const baseURL = process.env.WEB_BASE_URL ?? `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './src/tests/e2e',
  use: { baseURL },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${webPort}`,
    url: baseURL,
    reuseExistingServer: true
  }
});
