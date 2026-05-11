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
RUN cargo build --release --locked -p streamflow-gateway

FROM rust:1-bookworm AS media-builder
WORKDIR /build
ARG FFMPEG_VERSION=8.1
ENV PREFIX=/opt/streamflow-ffmpeg \
    PKG_CONFIG_PATH=/opt/streamflow-ffmpeg/lib/pkgconfig
COPY .docker-sources/ffmpeg-${FFMPEG_VERSION}.tar.xz /tmp/ffmpeg.tar.xz
COPY .docker-sources/x264-master.tar.gz /tmp/x264.tar.gz
RUN set -eux; \
    mkdir -p "$PREFIX"; \
    tar -xzf /tmp/x264.tar.gz -C /build; \
    cd /build/x264-master; \
    ./configure \
      --prefix="$PREFIX" \
      --enable-static \
      --disable-cli \
      --disable-asm; \
    make -j"$(nproc)"; \
    make install; \
    tar -xJf /tmp/ffmpeg.tar.xz -C /build; \
    cd /build/ffmpeg-${FFMPEG_VERSION}; \
    ./configure \
      --prefix="$PREFIX" \
      --pkg-config-flags="--static" \
      --extra-cflags="-I$PREFIX/include" \
      --extra-ldflags="-L$PREFIX/lib" \
      --extra-libs="-lpthread -ldl -lm" \
      --disable-autodetect \
      --enable-gpl \
      --enable-libx264 \
      --enable-openssl \
      --enable-nonfree \
      --enable-pthreads \
      --disable-xlib \
      --disable-libxcb \
      --disable-debug \
      --disable-doc \
      --disable-ffplay; \
    make -j"$(nproc)" ffmpeg ffprobe; \
    make install; \
    "$PREFIX/bin/ffmpeg" -hide_banner -version | head -1; \
    "$PREFIX/bin/ffmpeg" -hide_banner -h protocol=rtmp | grep rtmp_enhanced_codecs

FROM rust:1-bookworm AS runtime-libs
RUN set -eux; \
    mkdir -p /runtime-libs; \
    cp /usr/lib/*-linux-gnu/libssl.so.3 /runtime-libs/; \
    cp /usr/lib/*-linux-gnu/libcrypto.so.3 /runtime-libs/

FROM debian:bookworm-slim AS runtime
WORKDIR /app
COPY --from=runtime-libs /runtime-libs/ /usr/local/lib/
COPY --from=media-builder /opt/streamflow-ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=media-builder /opt/streamflow-ffmpeg/bin/ffprobe /usr/local/bin/ffprobe
COPY --from=gateway-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=gateway-builder /src/target/release/streamflow-gateway /usr/local/bin/streamflow-gateway
COPY apps/web-demo/dist /app/apps/web-demo/dist
ENV GATEWAY_HOST=0.0.0.0 \
    GATEWAY_PORT=5177 \
    LD_LIBRARY_PATH=/usr/local/lib \
    ZLM_HTTP_ORIGIN=http://127.0.0.1:8080 \
    RTSP_PUSH_ORIGIN=rtsp://127.0.0.1:8554/live
EXPOSE 5177
CMD ["streamflow-gateway"]
