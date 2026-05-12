FROM rust:1-bookworm AS gateway-builder
WORKDIR /src
ENV RUSTUP_DIST_SERVER=https://rsproxy.cn \
    RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup \
    RUSTUP_TOOLCHAIN=1.95.0 \
    CARGO_HTTP_TIMEOUT=120 \
    PATH=/usr/local/cargo/bin:$PATH
COPY .cargo-docker/config.toml ./.cargo/config.toml
COPY vendor ./vendor
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY crates ./crates
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/cargo-target \
    CARGO_TARGET_DIR=/cargo-target cargo build --release --locked -p streamflow-gateway && \
    cp /cargo-target/release/streamflow-gateway /usr/local/bin/streamflow-gateway

FROM linuxserver/ffmpeg:latest AS runtime
WORKDIR /app
COPY --from=gateway-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=gateway-builder /usr/local/bin/streamflow-gateway /usr/local/bin/streamflow-gateway
COPY apps/web-demo/dist /app/apps/web-demo/dist
ENTRYPOINT []
ENV GATEWAY_HOST=0.0.0.0 \
    GATEWAY_PORT=5177 \
    ZLM_HTTP_ORIGIN=http://127.0.0.1:8080 \
    RTSP_PUSH_ORIGIN=rtsp://127.0.0.1:8554/live
EXPOSE 5177
CMD ["streamflow-gateway"]
