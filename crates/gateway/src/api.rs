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
        Path, State, WebSocketUpgrade,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::broadcast;
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
        .route("/api/streams/:stream_id", delete(delete_stream))
        .route("/api/metrics", get(metrics))
        .route("/ws/streams/:stream_id", get(stream_ws))
        .route("/hls/*path", get(proxy_hls).head(proxy_hls))
        .nest_service("/", ServeDir::new("apps/web-demo/dist"))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
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

async fn proxy_hls(
    State(state): State<AppState>,
    Path(path): Path<String>,
    request_uri: axum::http::Uri,
) -> Result<Response, AppError> {
    if let Some(stream_id) = hls_stream_id(&path) {
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

fn hls_stream_id(path: &str) -> Option<&str> {
    let mut parts = path.split('/');
    match (parts.next(), parts.next()) {
        (Some("live"), Some(stream_id)) if !stream_id.is_empty() => Some(stream_id),
        _ => None,
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
}
