SHELL := /bin/bash
.DEFAULT_GOAL := help

APP_DIR := apps/web-demo
FFMPEG_VERSION ?= 8.1
GATEWAY_HOST ?= 127.0.0.1
GATEWAY_PORT ?= 5177
TEST_GATEWAY_PORT ?= 5187
FRONTEND_FLOW_GATEWAY_PORT ?= 5188
FRONTEND_FLOW_WEB_PORT ?= 5179
LOAD_GATEWAY_PORT ?= 5190
LOAD_STREAMS ?= 20
LOAD_VIEWERS ?= 100
LOAD_DURATION_SECONDS ?= 30
LOAD_RAMP_MS ?= 5000
DOCKER_BUILDKIT ?= 1
DOCKER_SERVER_ARCH ?= $(shell docker info --format '{{.Architecture}}' 2>/dev/null | sed -e 's/aarch64/arm64/' -e 's/x86_64/amd64/')
DOCKER_PLATFORM ?= linux/$(DOCKER_SERVER_ARCH)

.PHONY: help dev dev-api dev-web check test test-functional test-frontend-flow test-integration test-e2e load load-live soak soak-24h prepare-ffmpeg-sources docker-build image-amd64 deploy-image release-amd64 docker-up docker-stack-up docker-down clean

help:
	@echo "streamflow-gateway commands:"
	@echo "  make dev              Run gateway and web demo"
	@echo "  make dev-api          Run Rust gateway"
	@echo "  make dev-web          Run React demo"
	@echo "  make check            Rust fmt/clippy/tests + frontend typecheck"
	@echo "  make test             Unit tests"
	@echo "  make test-functional  Functional API/WebSocket smoke test"
	@echo "  make test-frontend-flow Browser flow: start/switch/stop through UI"
	@echo "  make test-integration Integration test scaffold"
	@echo "  make test-e2e         Playwright e2e scaffold"
	@echo "  make load             Safe API/WebSocket load test without FFmpeg"
	@echo "  make load-live        Load test current gateway; pass STREAM_URLS for real streams"
	@echo "  make soak             1-hour health loop"
	@echo "  make soak-24h         24-hour health loop"
	@echo "  make prepare-ffmpeg-sources Download FFmpeg $(FFMPEG_VERSION) + x264 sources"
	@echo "  make docker-build     Build gateway + web demo image"
	@echo "  make image-amd64      Cross-compile Linux amd64 binary and package image"
	@echo "  make deploy-image     Upload prebuilt amd64 image and restart remote gateway"
	@echo "  make release-amd64    Build amd64 image locally, upload, and restart remote"
	@echo "  make docker-up        Start ZLMediaKit dependency"
	@echo "  make docker-stack-up  Start gateway + ZLMediaKit"
	@echo "  make clean            Remove local temp files"

dev:
	@echo "Run these in two terminals: make dev-api and make dev-web"

dev-api:
	GATEWAY_HOST=$(GATEWAY_HOST) GATEWAY_PORT=$(GATEWAY_PORT) cargo run -p streamflow-gateway

dev-web:
	cd $(APP_DIR) && npm run dev -- --host 127.0.0.1

check:
	cargo fmt --all -- --check
	cargo clippy --workspace --all-targets -- -D warnings
	cargo test --workspace
	@if [ -d "$(APP_DIR)/node_modules" ]; then cd $(APP_DIR) && npm run typecheck; else echo "Skip frontend typecheck: run npm install in $(APP_DIR)"; fi

test:
	cargo test --workspace
	@if [ -d "$(APP_DIR)/node_modules" ]; then cd $(APP_DIR) && npm test; else echo "Skip frontend tests: run npm install in $(APP_DIR)"; fi

test-functional:
	@set -euo pipefail; \
	mkdir -p logs; \
	GATEWAY_HOST=$(GATEWAY_HOST) GATEWAY_PORT=$(TEST_GATEWAY_PORT) STREAMFLOW_SPAWN_PROCESSES=0 CLEANUP_AFTER_SECS=1 cargo run -p streamflow-gateway > logs/functional-gateway.log 2>&1 & \
	pid=$$!; \
	trap 'kill $$pid >/dev/null 2>&1 || true' EXIT; \
	APP_URL=http://$(GATEWAY_HOST):$(TEST_GATEWAY_PORT) node scripts/functional-smoke.js

test-frontend-flow:
	@set -euo pipefail; \
	mkdir -p logs; \
	GATEWAY_HOST=$(GATEWAY_HOST) GATEWAY_PORT=$(FRONTEND_FLOW_GATEWAY_PORT) STREAMFLOW_SPAWN_PROCESSES=0 CLEANUP_AFTER_SECS=30 cargo run -p streamflow-gateway > logs/frontend-flow-gateway.log 2>&1 & \
	pid=$$!; \
	trap 'kill $$pid >/dev/null 2>&1 || true' EXIT; \
	cd $(APP_DIR) && VITE_GATEWAY_TARGET=http://$(GATEWAY_HOST):$(FRONTEND_FLOW_GATEWAY_PORT) VITE_WEB_PORT=$(FRONTEND_FLOW_WEB_PORT) npm run test:e2e:flow

test-integration:
	./scripts/start-test-source.sh
	trap './scripts/stop-test-source.sh' EXIT; cargo test --workspace --test '*'

test-e2e:
	cd $(APP_DIR) && npm run test:e2e

load:
	@set -euo pipefail; \
	mkdir -p logs; \
	GATEWAY_HOST=$(GATEWAY_HOST) GATEWAY_PORT=$(LOAD_GATEWAY_PORT) STREAMFLOW_SPAWN_PROCESSES=0 MAX_UPSTREAMS=$$(($(LOAD_STREAMS) + 5)) MAX_VIEWERS=$$(($(LOAD_VIEWERS) + 20)) CLEANUP_AFTER_SECS=5 cargo run -p streamflow-gateway > logs/load-gateway.log 2>&1 & \
	pid=$$!; \
	trap 'kill $$pid >/dev/null 2>&1 || true' EXIT; \
	APP_URL=http://$(GATEWAY_HOST):$(LOAD_GATEWAY_PORT) STREAMS=$(LOAD_STREAMS) VIEWERS=$(LOAD_VIEWERS) DURATION_SECONDS=$(LOAD_DURATION_SECONDS) RAMP_MS=$(LOAD_RAMP_MS) node scripts/load-matrix.js | tee logs/load-matrix.ndjson

load-live:
	APP_URL=$${APP_URL:-http://$(GATEWAY_HOST):$(GATEWAY_PORT)} STREAMS=$${STREAMS:-$(LOAD_STREAMS)} VIEWERS=$${VIEWERS:-$(LOAD_VIEWERS)} DURATION_SECONDS=$${DURATION_SECONDS:-$(LOAD_DURATION_SECONDS)} RAMP_MS=$${RAMP_MS:-$(LOAD_RAMP_MS)} STREAM_URLS="$${STREAM_URLS:-}" VIEWER_MODE=$${VIEWER_MODE:-ws} node scripts/load-matrix.js | tee logs/load-live.ndjson

soak:
	DURATION_SECONDS=$${DURATION_SECONDS:-3600} ./scripts/collect-metrics.sh

soak-24h:
	DURATION_SECONDS=86400 ./scripts/collect-metrics.sh

prepare-ffmpeg-sources:
	mkdir -p .docker-sources
	test -s .docker-sources/ffmpeg-$(FFMPEG_VERSION).tar.xz || curl -fL --connect-timeout 15 --max-time 180 --retry 3 --retry-delay 2 -o .docker-sources/ffmpeg-$(FFMPEG_VERSION).tar.xz https://ffmpeg.org/releases/ffmpeg-$(FFMPEG_VERSION).tar.xz
	test -s .docker-sources/x264-master.tar.gz || curl -fL --connect-timeout 15 --max-time 180 --retry 3 --retry-delay 2 -o .docker-sources/x264-master.tar.gz https://codeload.github.com/mirror/x264/tar.gz/refs/heads/master

docker-build: prepare-ffmpeg-sources
	cd $(APP_DIR) && npm ci && npm run build
	rm -rf vendor .cargo-docker
	mkdir -p .cargo-docker
	cargo vendor --locked vendor > .cargo-docker/config.toml
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --platform=$(DOCKER_PLATFORM) --build-arg FFMPEG_VERSION=$(FFMPEG_VERSION) -t streamflow-gateway:local .

image-amd64:
	./scripts/build-amd64-local.sh

deploy-image:
	./scripts/deploy-image.sh

release-amd64: image-amd64 deploy-image

docker-up:
	docker compose up -d zlm

docker-stack-up:
	DOCKER_DEFAULT_PLATFORM=$(DOCKER_PLATFORM) DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker compose up -d --build

docker-down:
	docker compose down

clean:
	rm -rf logs tmp target/.tmp .cargo-docker vendor .build dist/streamflow-gateway-amd64.tar.gz
