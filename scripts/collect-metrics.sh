#!/usr/bin/env bash
set -euo pipefail
DURATION_SECONDS=${DURATION_SECONDS:-3600}
APP_URL=${APP_URL:-http://127.0.0.1:5177}
mkdir -p logs
end=$((SECONDS + DURATION_SECONDS))
echo "time,health,metrics" > logs/soak.csv
while [ $SECONDS -lt $end ]; do
  health=$(curl -fsS "$APP_URL/health" 2>/dev/null || echo 'down')
  metrics=$(curl -fsS "$APP_URL/api/metrics" 2>/dev/null || echo '{}')
  printf '%s,%q,%q\n' "$(date -Iseconds)" "$health" "$metrics" >> logs/soak.csv
  sleep 30
done
echo "wrote logs/soak.csv"
