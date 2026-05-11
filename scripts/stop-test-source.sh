#!/usr/bin/env bash
set -euo pipefail
if [ -f logs/test-source.pid ]; then
  kill "$(cat logs/test-source.pid)" >/dev/null 2>&1 || true
  rm -f logs/test-source.pid
fi
pkill -f "streamflow-testsrc" >/dev/null 2>&1 || true
echo "stopped test source"
