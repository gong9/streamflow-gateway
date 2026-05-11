#!/usr/bin/env bash
set -euo pipefail
mkdir -p logs

if pgrep -f "streamflow-testsrc" >/dev/null 2>&1; then
  echo "test source already running"
  exit 0
fi

port_open() {
  (echo > /dev/tcp/127.0.0.1/8554) >/dev/null 2>&1
}

if ! port_open && command -v docker >/dev/null 2>&1; then
  echo "starting local ZLMediaKit dependency"
  docker compose up -d zlm >/dev/null
fi

for _ in {1..30}; do
  if port_open; then
    break
  fi
  sleep 1
done

if ! port_open; then
  echo "RTSP port 8554 is not available; start ZLMediaKit with 'make docker-up'" >&2
  exit 1
fi

ffmpeg -hide_banner -loglevel warning -re -f lavfi -i testsrc=size=1280x720:rate=15 \
  -metadata title=streamflow-testsrc \
  -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
  -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/live/test \
  > logs/test-source.log 2>&1 &

echo $! > logs/test-source.pid
sleep 2
if ! kill -0 "$(cat logs/test-source.pid)" >/dev/null 2>&1; then
  echo "failed to start test source; see logs/test-source.log" >&2
  exit 1
fi

echo "started test source pid $(cat logs/test-source.pid)"
echo "test url: rtsp://127.0.0.1:8554/live/test"
