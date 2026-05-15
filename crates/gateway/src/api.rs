use crate::{
    errors::AppError,
    fanout::StreamPacket,
    hls_fallback::HlsFallback,
    metrics::GatewayMetrics,
    stream_manager::{CreateStreamRequest, StreamManager, ViewerSlot},
};
use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket},
        Path, Request, State, WebSocketUpgrade,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::sync::Arc;
use tokio::{process::Command, sync::broadcast};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use tracing::{info, warn};

#[derive(Clone)]
pub struct AppState {
    pub manager: Arc<StreamManager>,
    pub hls: HlsFallback,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub service: &'static str,
    pub version: &'static str,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/streams", post(create_stream).get(list_streams))
        .route("/api/streams/:stream_id/status", get(stream_status))
        .route(
            "/api/streams/:stream_id/diagnostics",
            get(stream_diagnostics),
        )
        .route(
            "/api/streams/:stream_id/profiles/fallback-h264",
            post(start_h264_fallback),
        )
        .route("/api/streams/:stream_id", delete(delete_stream))
        .route("/api/metrics", get(metrics))
        .route("/ws/streams/:stream_id", get(stream_ws))
        .route("/raw-flv/*path", get(stream_raw_flv).head(stream_raw_flv))
        .route("/fmp4/*path", get(stream_fmp4).head(stream_fmp4))
        .route("/hls/*path", get(proxy_hls).head(proxy_hls))
        .route("/zlm/*path", get(proxy_zlm).head(proxy_zlm))
        .nest_service("/", ServeDir::new("apps/web-demo/dist"))
        .layer(CorsLayer::permissive())
        .layer(middleware::from_fn(cross_origin_isolation))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn cross_origin_isolation(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "cross-origin-opener-policy",
        HeaderValue::from_static("same-origin"),
    );
    headers.insert(
        "cross-origin-embedder-policy",
        HeaderValue::from_static("require-corp"),
    );
    response
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "streamflow-gateway",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn create_stream(
    State(state): State<AppState>,
    Json(req): Json<CreateStreamRequest>,
) -> Result<impl IntoResponse, AppError> {
    let response = state.manager.create_or_reuse(req).await?;
    Ok(Json(response))
}

async fn list_streams(
    State(state): State<AppState>,
) -> Json<Vec<crate::stream_manager::StreamStatus>> {
    Json(state.manager.list().await)
}

async fn stream_status(
    State(state): State<AppState>,
    Path(stream_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(state.manager.status(&stream_id).await?))
}

async fn stream_diagnostics(
    State(state): State<AppState>,
    Path(stream_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(state.manager.status(&stream_id).await?.diagnostics))
}

async fn start_h264_fallback(
    State(state): State<AppState>,
    Path(stream_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(state.manager.start_h264_fallback(&stream_id).await?))
}

async fn delete_stream(
    State(state): State<AppState>,
    Path(stream_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    Ok(Json(state.manager.release(&stream_id).await?))
}

async fn metrics(State(state): State<AppState>) -> Json<GatewayMetrics> {
    Json(state.manager.metrics())
}

async fn stream_ws(
    State(state): State<AppState>,
    Path(stream_id): Path<String>,
    ws: WebSocketUpgrade,
) -> Result<Response, AppError> {
    let stream = state.manager.get(&stream_id).ok_or(AppError::NotFound)?;
    let viewer_slot = state.manager.try_acquire_viewer()?;
    Ok(ws.on_upgrade(move |socket| handle_ws(socket, stream, viewer_slot)))
}

async fn handle_ws(
    socket: WebSocket,
    stream: Arc<crate::stream_manager::StreamHandle>,
    _viewer_slot: ViewerSlot,
) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = stream.fanout.subscribe();
    let stream_id = stream.id.clone();
    stream.mark_viewer_joined().await;
    info!(stream_id, "viewer connected");

    let _ = sender
        .send(Message::Text(format!(
            r#"{{"event":"subscribed","streamId":"{}","codec":"{}","container":"mpegts"}}"#,
            stream.id, stream.codec
        )))
        .await;

    let fanout = stream.fanout.clone();
    let send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(packet) => {
                    let result = match packet {
                        StreamPacket::Control(text) => sender.send(Message::Text(text)).await,
                        StreamPacket::Binary(bytes) => {
                            sender.send(Message::Binary(bytes.to_vec())).await
                        }
                    };
                    if result.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(count)) => {
                    fanout.mark_dropped(count);
                    warn!(
                        dropped = count,
                        "viewer lagged behind; dropping buffered packets"
                    );
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    while let Some(message) = receiver.next().await {
        match message {
            Ok(Message::Close(_)) => break,
            Ok(Message::Ping(_))
            | Ok(Message::Pong(_))
            | Ok(Message::Text(_))
            | Ok(Message::Binary(_)) => {}
            Err(err) => {
                warn!(stream_id, error = %err, "websocket receive error");
                break;
            }
        }
    }

    send_task.abort();
    stream.fanout.unsubscribe();
    stream.mark_viewer_left_if_idle().await;
    info!(stream_id, "viewer disconnected");
}

async fn stream_raw_flv(
    State(state): State<AppState>,
    Path(path): Path<String>,
) -> Result<Response, AppError> {
    let stream_id = path
        .strip_suffix(".flv")
        .unwrap_or(path.as_str())
        .to_string();
    let stream = state.manager.get(&stream_id).ok_or(AppError::NotFound)?;
    state.manager.mark_raw_flv_access(&stream_id).await;

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-hide_banner")
        .arg("-loglevel")
        .arg("warning")
        .arg("-analyzeduration")
        .arg("10000000")
        .arg("-probesize")
        .arg("10000000")
        .arg("-fflags")
        .arg("+genpts+discardcorrupt")
        .arg("-err_detect")
        .arg("ignore_err")
        .arg("-i")
        .arg(&stream.input_url)
        .arg("-map")
        .arg("0:v:0")
        .arg("-an")
        .arg("-c:v")
        .arg("copy")
        .arg("-f")
        .arg("flv")
        .arg("pipe:1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null());

    let mut child = cmd
        .spawn()
        .map_err(|err| AppError::Internal(format!("raw flv process failed: {err}")))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Internal("raw flv stdout unavailable".to_string()))?;

    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("video/x-flv"),
    );
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(stdout));
    Ok((StatusCode::OK, headers, body).into_response())
}

async fn stream_fmp4(
    State(state): State<AppState>,
    Path(path): Path<String>,
) -> Result<Response, AppError> {
    let stream_id = path
        .strip_suffix(".mp4")
        .unwrap_or(path.as_str())
        .to_string();
    let stream = state.manager.get(&stream_id).ok_or(AppError::NotFound)?;
    state.manager.mark_raw_flv_access(&stream_id).await;

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-hide_banner")
        .arg("-loglevel")
        .arg("warning")
        .arg("-analyzeduration")
        .arg("10000000")
        .arg("-probesize")
        .arg("10000000")
        .arg("-fflags")
        .arg("+genpts+discardcorrupt")
        .arg("-err_detect")
        .arg("ignore_err")
        .arg("-i")
        .arg(&stream.input_url)
        .arg("-map")
        .arg("0:v:0")
        .arg("-an")
        .arg("-c:v")
        .arg("copy")
        .arg("-tag:v")
        .arg("hvc1")
        .arg("-f")
        .arg("mp4")
        .arg("-movflags")
        .arg("frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset")
        .arg("pipe:1")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null());

    let mut child = cmd
        .spawn()
        .map_err(|err| AppError::Internal(format!("fmp4 process failed: {err}")))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Internal("fmp4 stdout unavailable".to_string()))?;

    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("video/mp4"),
    );
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(stdout));
    Ok((StatusCode::OK, headers, body).into_response())
}

async fn proxy_hls(
    State(state): State<AppState>,
    Path(path): Path<String>,
    request_uri: axum::http::Uri,
) -> Result<Response, AppError> {
    let managed_stream = if let Some(stream_id) = hls_stream_id(&path) {
        state.manager.mark_hls_access(stream_id).await;
        state.manager.get(stream_id).is_some()
    } else {
        false
    };

    if let Some(local_path) = state.hls.local_path_for_hls(&path) {
        if let Ok(bytes) = tokio::fs::read(&local_path).await {
            let mut headers = HeaderMap::new();
            headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static(content_type_for_hls_path(&path)),
            );
            return Ok((StatusCode::OK, headers, bytes).into_response());
        }

        if managed_stream {
            let mut headers = HeaderMap::new();
            headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static(content_type_for_hls_path(&path)),
            );
            if request_uri
                .query()
                .is_some_and(|query| query.split('&').any(|item| item.starts_with("ready=")))
            {
                return Ok((StatusCode::NO_CONTENT, headers).into_response());
            }
            return Ok((StatusCode::NOT_FOUND, headers, "hls segment is not ready").into_response());
        }
    }

    let query = request_uri
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let upstream_path = format!("/{path}{query}");
    let upstream_url = state.hls.upstream_http_url(&upstream_path);
    let upstream = reqwest::get(&upstream_url)
        .await
        .map_err(|err| AppError::Internal(format!("hls proxy failed: {err}")))?;

    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type = upstream.headers().get(header::CONTENT_TYPE).cloned();
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Some(value) = content_type {
        headers.insert(header::CONTENT_TYPE, value);
    }

    let body = Body::from_stream(upstream.bytes_stream());
    Ok((status, headers, body).into_response())
}

async fn proxy_zlm(
    State(state): State<AppState>,
    Path(path): Path<String>,
    request_uri: axum::http::Uri,
) -> Result<Response, AppError> {
    if let Some(stream_id) = zlm_stream_id(&path) {
        state.manager.mark_hls_access(stream_id).await;
    }

    let query = request_uri
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let upstream_path = format!("/{path}{query}");
    let upstream_url = state.hls.upstream_http_url(&upstream_path);
    let upstream = reqwest::get(&upstream_url)
        .await
        .map_err(|err| AppError::Internal(format!("zlm proxy failed: {err}")))?;

    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type = upstream.headers().get(header::CONTENT_TYPE).cloned();
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if let Some(value) = content_type {
        headers.insert(header::CONTENT_TYPE, value);
    } else if path.ends_with(".flv") {
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("video/x-flv"),
        );
    }

    let body = Body::from_stream(upstream.bytes_stream());
    Ok((status, headers, body).into_response())
}

fn hls_stream_id(path: &str) -> Option<&str> {
    let mut parts = path.split('/');
    match (parts.next(), parts.next()) {
        (Some("live"), Some(stream_id)) if !stream_id.is_empty() => Some(stream_id),
        _ => None,
    }
}

fn zlm_stream_id(path: &str) -> Option<&str> {
    let mut parts = path.split('/');
    match (parts.next(), parts.next()) {
        (Some("live"), Some(file_name)) => file_name.strip_suffix(".live.flv"),
        _ => None,
    }
}

fn content_type_for_hls_path(path: &str) -> &'static str {
    if path.ends_with(".m3u8") {
        "application/vnd.apple.mpegurl"
    } else if path.ends_with(".ts") {
        "video/mp2t"
    } else {
        "application/octet-stream"
    }
}

#[cfg(test)]
mod tests {
    use super::hls_stream_id;

    #[test]
    fn extracts_hls_stream_id_from_manifest_and_segments() {
        assert_eq!(hls_stream_id("live/stream-1/hls.m3u8"), Some("stream-1"));
        assert_eq!(
            hls_stream_id("live/stream-1/2026-05-11/14/00-01_1.ts"),
            Some("stream-1")
        );
        assert_eq!(hls_stream_id("other/stream-1/hls.m3u8"), None);
    }

    #[test]
    fn extracts_zlm_stream_id_from_flv_path() {
        assert_eq!(
            super::zlm_stream_id("live/stream-1.live.flv"),
            Some("stream-1")
        );
        assert_eq!(super::zlm_stream_id("live/stream-1.m3u8"), None);
    }
}
