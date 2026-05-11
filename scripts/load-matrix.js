#!/usr/bin/env node
const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5177';
const wsBaseUrl = baseUrl.replace(/^http/, 'ws');
const streams = Number(process.env.STREAMS || 20);
const viewers = Number(process.env.VIEWERS || 100);
const durationSeconds = Number(process.env.DURATION_SECONDS || 30);
const rampMs = Number(process.env.RAMP_MS || 5000);
const createConcurrency = Number(process.env.CREATE_CONCURRENCY || 8);
const viewerMode = process.env.VIEWER_MODE || 'ws';
const rawUrls = (process.env.STREAM_URLS || '')
  .split(/[\n,]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

const stats = {
  createOk: 0,
  createFail: 0,
  wsOpen: 0,
  wsClosed: 0,
  wsError: 0,
  wsMessages: 0,
  wsBytes: 0,
  hlsOk: 0,
  hlsFail: 0,
};
let shuttingDown = false;

function streamUrl(index) {
  if (rawUrls.length > 0) return rawUrls[index % rawUrls.length];
  return `rtsp://load.test/live/stream-${index}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function waitForHealthy() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const { response, body } = await request('/health');
      if (response.ok && body?.ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error(`gateway not healthy: ${baseUrl}`);
}

async function createStream(url) {
  const { response, body } = await request('/api/streams', {
    method: 'POST',
    body: JSON.stringify({ url, mode: 'auto' }),
  });
  if (!response.ok) {
    stats.createFail += 1;
    throw new Error(`create failed ${response.status}: ${JSON.stringify(body)}`);
  }
  stats.createOk += 1;
  return body;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function openWs(stream, index) {
  const ws = new WebSocket(`${wsBaseUrl}${stream.ws_url}`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    stats.wsOpen += 1;
  };
  ws.onmessage = (event) => {
    stats.wsMessages += 1;
    if (event.data instanceof ArrayBuffer) {
      stats.wsBytes += event.data.byteLength;
    } else if (typeof event.data === 'string') {
      stats.wsBytes += Buffer.byteLength(event.data);
    }
  };
  ws.onerror = () => {
    if (!shuttingDown) stats.wsError += 1;
  };
  ws.onclose = () => {
    stats.wsClosed += 1;
  };
  ws.__loadIndex = index;
  return ws;
}

async function pollHls(stream, stopAt) {
  while (Date.now() < stopAt) {
    try {
      const response = await fetch(`${baseUrl}${stream.hls_url}?load_t=${Date.now()}`);
      if (response.ok) stats.hlsOk += 1;
      else stats.hlsFail += 1;
    } catch {
      stats.hlsFail += 1;
    }
    await wait(1000);
  }
}

async function snapshot(created, startedAt) {
  let metrics = {};
  try {
    const result = await request('/api/metrics');
    metrics = result.body || {};
  } catch {}
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(JSON.stringify({
    time: now(),
    elapsed,
    requested_streams: streams,
    requested_viewers: viewers,
    gateway: metrics,
    ...stats,
    active_ws: stats.wsOpen - stats.wsClosed,
    kb_received: Math.round(stats.wsBytes / 1024),
    created_streams: created.length,
  }));
}

async function cleanup(created, sockets) {
  shuttingDown = true;
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {}
  }
  await Promise.allSettled(created.map((stream) => (
    request(`/api/streams/${stream.stream_id}`, { method: 'DELETE' })
  )));
}

async function main() {
  await waitForHealthy();
  const startedAt = Date.now();
  const urls = Array.from({ length: streams }, (_, index) => streamUrl(index));
  console.log(JSON.stringify({
    event: 'load-start',
    baseUrl,
    streams,
    viewers,
    durationSeconds,
    rampMs,
    viewerMode,
    usingProvidedUrls: rawUrls.length,
  }));

  const created = await mapLimit(urls, createConcurrency, createStream);
  const sockets = [];
  const hlsTasks = [];
  const stopAt = Date.now() + durationSeconds * 1000;
  const reporter = setInterval(() => {
    void snapshot(created, startedAt);
  }, 1000);

  for (let i = 0; i < viewers; i += 1) {
    const stream = created[i % created.length];
    if (viewerMode === 'hls') {
      hlsTasks.push(pollHls(stream, stopAt));
    } else {
      sockets.push(openWs(stream, i));
    }
    if (rampMs > 0 && viewers > 1) {
      await wait(Math.max(1, Math.floor(rampMs / viewers)));
    }
  }

  await wait(Math.max(0, stopAt - Date.now()));
  clearInterval(reporter);
  await Promise.allSettled(hlsTasks);
  await snapshot(created, startedAt);
  await cleanup(created, sockets);

  const activeWs = stats.wsOpen - stats.wsClosed;
  const failedCreates = stats.createFail;
  console.log(JSON.stringify({
    event: 'load-finished',
    ok: failedCreates === 0 && stats.wsError === 0,
    activeWs,
    ...stats,
    kb_received: Math.round(stats.wsBytes / 1024),
  }, null, 2));

  if (failedCreates > 0 || stats.wsError > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
