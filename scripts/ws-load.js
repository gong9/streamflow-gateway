#!/usr/bin/env node
const target = process.env.WS_URL || 'ws://127.0.0.1:5177/ws/streams/demo';
const total = Number(process.env.CONNECTIONS || 50);
let open = 0;
let bytes = 0;
for (let i = 0; i < total; i += 1) {
  const ws = new WebSocket(target);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { open += 1; };
  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) bytes += event.data.byteLength;
  };
  ws.onclose = () => { open -= 1; };
}
setInterval(() => {
  console.log(JSON.stringify({ target, requested: total, open, kb: Math.round(bytes / 1024) }));
}, 1000);
