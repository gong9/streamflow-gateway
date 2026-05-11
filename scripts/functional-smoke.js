#!/usr/bin/env node
const baseUrl = process.env.APP_URL || 'http://127.0.0.1:5177';
const wsBaseUrl = baseUrl.replace(/^http/, 'ws');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHealthy() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const { response, body } = await request('/health');
      if (response.ok && body?.ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error('gateway did not become healthy');
}

async function create(url) {
  const { response, body } = await request('/api/streams', {
    method: 'POST',
    body: JSON.stringify({ url, mode: 'auto' }),
  });
  assert(response.ok, `create stream failed: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function status(streamId) {
  const { response, body } = await request(`/api/streams/${streamId}/status`);
  return { ok: response.ok, status: response.status, body };
}

async function openWs(streamId) {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}/ws/streams/${streamId}`);
    const timeout = setTimeout(() => reject(new Error('websocket subscribe timed out')), 4000);
    ws.onmessage = (event) => {
      clearTimeout(timeout);
      resolve({ ws, message: String(event.data) });
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('websocket subscribe failed'));
    };
  });
}

async function main() {
  await waitForHealthy();

  const bad = await request('/api/streams', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://example.test/not-supported' }),
  });
  assert(bad.response.status === 400, `invalid url should return 400, got ${bad.response.status}`);

  const first = await create('rtsp://example.test/live/a');
  assert(first.stream_id && first.ws_url && first.hls_url, 'create response missing playback urls');
  assert(first.reused === false, 'first create should not be reused');

  const same = await create('rtsp://example.test/live/a');
  assert(same.stream_id === first.stream_id, 'same source should reuse stream id');
  assert(same.reused === true, 'same source should report reused=true');

  const second = await create('rtmp://example.test/live/b');
  assert(second.stream_id !== first.stream_id, 'different source should create independent stream');

  const list = await request('/api/streams');
  assert(list.response.ok && Array.isArray(list.body) && list.body.length >= 2, 'list should return active streams');

  const wsSub = await openWs(first.stream_id);
  assert(wsSub.message.includes('subscribed'), `expected subscribed event, got ${wsSub.message}`);

  await wait(250);
  const withViewer = await status(first.stream_id);
  assert(withViewer.ok, 'status should succeed with viewer');
  assert(withViewer.body.viewer_count === 1, `viewer count should be 1, got ${withViewer.body.viewer_count}`);

  const metrics = await request('/api/metrics');
  assert(metrics.response.ok, 'metrics should succeed');
  assert(metrics.body.viewer_count === 1, `metrics viewer count should be 1, got ${metrics.body.viewer_count}`);

  wsSub.ws.close();
  await wait(500);
  const afterClose = await status(first.stream_id);
  assert(afterClose.ok, 'status should still exist immediately after close');
  assert(afterClose.body.viewer_count === 0, `viewer count should return to 0, got ${afterClose.body.viewer_count}`);

  const release = await request(`/api/streams/${first.stream_id}`, { method: 'DELETE' });
  assert(release.response.ok, `release should succeed: ${release.response.status}`);

  await wait(12000);
  const afterTtl = await status(first.stream_id);
  assert(afterTtl.status === 404, `stream should be cleaned after TTL, got ${afterTtl.status}`);

  console.log(JSON.stringify({
    ok: true,
    checked: ['health', 'invalid-url', 'create', 'reuse', 'isolation', 'list', 'websocket', 'metrics', 'release', 'ttl-cleanup'],
    firstStream: first.stream_id,
    secondStream: second.stream_id,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
