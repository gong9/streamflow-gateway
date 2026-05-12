use crate::{
    config::Config,
    errors::AppError,
    fanout::{FanoutHub, FanoutStats},
    hls_fallback::HlsFallback,
    metrics::GatewayMetrics,
    upstream::UpstreamSession,
};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc, Weak,
    },
    time::Duration,
};
use tokio::{sync::RwLock, time};
use tracing::{error, info, warn};
use url::Url;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateStreamRequest {
    pub url: String,
    #[serde(default = "default_mode")]
    pub mode: String,
}

fn default_mode() -> String {
    "auto".to_string()
}

#[derive(Debug, Serialize)]
pub struct StreamResponse {
    pub stream_id: String,
    pub play_mode: String,
    pub ws_url: String,
    pub hls_url: String,
    pub codec: String,
    pub reused: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamStatus {
    pub stream_id: String,
    pub input_url: String,
    pub codec: String,
    pub running: bool,
    pub viewer_count: usize,
    pub upstream_pid: Option<u32>,
    pub started_at: DateTime<Utc>,
    pub idle_since: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub restart_count: u64,
    pub dropped_frames: u64,
    pub hls_url: String,
    pub ws_url: String,
}

#[derive(Debug)]
pub struct StreamHandle {
    pub id: String,
    pub input_url: String,
    pub normalized_url: String,
    pub codec: String,
    pub hls_url: String,
    pub ws_url: String,
    pub started_at: DateTime<Utc>,
    pub fanout: Arc<FanoutHub>,
    pub upstream: RwLock<Option<UpstreamSession>>,
    pub idle_since: RwLock<Option<DateTime<Utc>>>,
    pub last_error: RwLock<Option<String>>,
    pub restart_count: AtomicU64,
}

impl StreamHandle {
    pub async fn status(&self) -> StreamStatus {
        let stats: FanoutStats = self.fanout.stats();
        let upstream = self.upstream.read().await;
        let running = match upstream.as_ref() {
            Some(session) => session.is_running().await,
            None => false,
        };
        StreamStatus {
            stream_id: self.id.clone(),
            input_url: self.input_url.clone(),
            codec: self.codec.clone(),
            running,
            viewer_count: stats.viewer_count,
            upstream_pid: upstream.as_ref().and_then(|item| item.pid()),
            started_at: self.started_at,
            idle_since: *self.idle_since.read().await,
            last_error: self.last_error.read().await.clone(),
            restart_count: self.restart_count.load(Ordering::Relaxed),
            dropped_frames: stats.dropped_frames,
            hls_url: self.hls_url.clone(),
            ws_url: self.ws_url.clone(),
        }
    }

    pub async fn mark_viewer_joined(&self) {
        *self.idle_since.write().await = None;
    }

    pub async fn mark_viewer_left_if_idle(&self) {
        if self.fanout.stats().viewer_count == 0 {
            *self.idle_since.write().await = Some(Utc::now());
        }
    }

    pub async fn mark_hls_access(&self) {
        if self.fanout.stats().viewer_count == 0 {
            *self.idle_since.write().await = Some(Utc::now());
        }
    }
}

#[derive(Debug)]
pub struct StreamManager {
    config: Config,
    hls: HlsFallback,
    streams_by_id: DashMap<String, Arc<StreamHandle>>,
    streams_by_url: DashMap<String, String>,
    viewer_slots: AtomicUsize,
}

#[derive(Debug)]
pub struct ViewerSlot {
    manager: Weak<StreamManager>,
    released: bool,
}

impl ViewerSlot {
    fn new(manager: &Arc<StreamManager>) -> Self {
        Self {
            manager: Arc::downgrade(manager),
            released: false,
        }
    }
}

impl Drop for ViewerSlot {
    fn drop(&mut self) {
        if self.released {
            return;
        }
        if let Some(manager) = self.manager.upgrade() {
            manager.viewer_slots.fetch_sub(1, Ordering::Relaxed);
        }
        self.released = true;
    }
}

impl StreamManager {
    pub fn new(config: Config, hls: HlsFallback) -> Self {
        Self {
            config,
            hls,
            streams_by_id: DashMap::new(),
            streams_by_url: DashMap::new(),
            viewer_slots: AtomicUsize::new(0),
        }
    }

    pub async fn create_or_reuse(
        &self,
        req: CreateStreamRequest,
    ) -> Result<StreamResponse, AppError> {
        let normalized_url = normalize_stream_url(&req.url)?;
        if let Some(existing) = self.streams_by_url.get(&normalized_url) {
            if let Some(handle) = self.streams_by_id.get(existing.value()) {
                return Ok(response_for(&handle, &req.mode, true));
            }
        }

        if self.streams_by_id.len() >= self.config.max_upstreams {
            return Err(AppError::UpstreamLimit);
        }

        let stream_id = Uuid::new_v4().to_string();
        let hls_url = self.hls.hls_url(&stream_id);
        let ws_url = format!("/ws/streams/{stream_id}");
        let fanout = Arc::new(FanoutHub::new(viewer_channel_capacity(
            self.config.viewer_buffer,
        )));
        let handle = Arc::new(StreamHandle {
            id: stream_id.clone(),
            input_url: req.url.trim().to_string(),
            normalized_url: normalized_url.clone(),
            codec: "h264".to_string(),
            hls_url,
            ws_url,
            started_at: Utc::now(),
            fanout: fanout.clone(),
            upstream: RwLock::new(None),
            idle_since: RwLock::new(Some(Utc::now())),
            last_error: RwLock::new(None),
            restart_count: AtomicU64::new(0),
        });

        if self.config.spawn_processes {
            if let Err(err) = self.start_upstream(handle.clone()).await {
                *handle.last_error.write().await = Some(err.to_string());
            }
        } else if let Ok(session) = UpstreamSession::start(
            stream_id.clone(),
            req.url.trim().to_string(),
            self.config.clone(),
            self.hls.clone(),
            fanout,
        )
        .await
        {
            *handle.upstream.write().await = Some(session);
        }

        self.streams_by_url
            .insert(normalized_url, stream_id.clone());
        self.streams_by_id.insert(stream_id, handle.clone());
        Ok(response_for(&handle, &req.mode, false))
    }

    pub fn get(&self, stream_id: &str) -> Option<Arc<StreamHandle>> {
        self.streams_by_id
            .get(stream_id)
            .map(|entry| entry.value().clone())
    }

    pub fn try_acquire_viewer(self: &Arc<Self>) -> Result<ViewerSlot, AppError> {
        let result =
            self.viewer_slots
                .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |current| {
                    (current < self.config.max_viewers).then_some(current + 1)
                });
        result
            .map(|_| ViewerSlot::new(self))
            .map_err(|_| AppError::ViewerLimit)
    }

    pub async fn status(&self, stream_id: &str) -> Result<StreamStatus, AppError> {
        let handle = self.get(stream_id).ok_or(AppError::NotFound)?;
        Ok(handle.status().await)
    }

    pub async fn list(&self) -> Vec<StreamStatus> {
        let handles: Vec<_> = self
            .streams_by_id
            .iter()
            .map(|entry| entry.value().clone())
            .collect();
        let mut statuses = Vec::with_capacity(handles.len());
        for handle in handles {
            statuses.push(handle.status().await);
        }
        statuses
    }

    pub async fn release(&self, stream_id: &str) -> Result<StreamStatus, AppError> {
        let handle = self.get(stream_id).ok_or(AppError::NotFound)?;
        handle.mark_viewer_left_if_idle().await;
        Ok(handle.status().await)
    }

    pub async fn mark_hls_access(&self, stream_id: &str) {
        if let Some(handle) = self.get(stream_id) {
            handle.mark_hls_access().await;
        }
    }

    pub async fn delete_now(&self, stream_id: &str) -> Result<StreamStatus, AppError> {
        let (_, handle) = self
            .streams_by_id
            .remove(stream_id)
            .ok_or(AppError::NotFound)?;
        self.streams_by_url.remove(&handle.normalized_url);
        if let Some(upstream) = handle.upstream.write().await.take() {
            upstream.stop().await;
        }
        Ok(handle.status().await)
    }

    pub async fn reap_idle_once(&self) -> usize {
        let ttl = self.cleanup_after();
        let now = Utc::now();
        let candidates: Vec<String> = self
            .streams_by_id
            .iter()
            .filter_map(|entry| {
                let handle = entry.value();
                if handle.fanout.stats().viewer_count > 0 {
                    return None;
                }
                let idle_since = handle.idle_since.try_read().ok().and_then(|value| *value);
                let idle_for = idle_since
                    .and_then(|time| (now - time).to_std().ok())
                    .unwrap_or_default();
                (idle_for >= ttl).then(|| handle.id.clone())
            })
            .collect();

        let mut removed = 0;
        for stream_id in candidates {
            match self.delete_now(&stream_id).await {
                Ok(_) => {
                    removed += 1;
                    info!(stream_id, "removed idle stream");
                }
                Err(err) => warn!(stream_id, error = %err, "failed to remove idle stream"),
            }
        }
        removed
    }

    pub async fn restart_failed_once(&self) -> usize {
        if !self.config.spawn_processes {
            return 0;
        }

        let handles: Vec<_> = self
            .streams_by_id
            .iter()
            .map(|entry| entry.value().clone())
            .collect();
        let mut restarted = 0;

        for handle in handles {
            if handle.fanout.stats().viewer_count == 0 {
                continue;
            }

            let running = {
                let upstream = handle.upstream.read().await;
                match upstream.as_ref() {
                    Some(session) => session.is_running().await,
                    None => false,
                }
            };

            if running {
                continue;
            }

            if let Some(upstream) = handle.upstream.write().await.take() {
                upstream.stop().await;
            }

            match self.start_upstream(handle.clone()).await {
                Ok(()) => {
                    restarted += 1;
                    handle.restart_count.fetch_add(1, Ordering::Relaxed);
                    *handle.last_error.write().await = None;
                    info!(stream_id = handle.id, "restarted upstream");
                }
                Err(err) => {
                    let message = err.to_string();
                    *handle.last_error.write().await = Some(message.clone());
                    error!(stream_id = handle.id, error = %message, "failed to restart upstream");
                }
            }
        }

        restarted
    }

    pub async fn run_housekeeping(self: Arc<Self>) {
        let mut interval = time::interval(Duration::from_secs(10));
        loop {
            interval.tick().await;
            self.reap_idle_once().await;
            self.restart_failed_once().await;
        }
    }

    pub fn metrics(&self) -> GatewayMetrics {
        let viewer_count = self.viewer_slots.load(Ordering::Relaxed);
        GatewayMetrics {
            upstream_count: self.streams_by_id.len(),
            viewer_count,
            max_upstreams: self.config.max_upstreams,
            max_viewers: self.config.max_viewers,
        }
    }

    pub fn cleanup_after(&self) -> Duration {
        Duration::from_secs(self.config.cleanup_after_secs)
    }

    async fn start_upstream(&self, handle: Arc<StreamHandle>) -> anyhow::Result<()> {
        let session = UpstreamSession::start(
            handle.id.clone(),
            handle.input_url.clone(),
            self.config.clone(),
            self.hls.clone(),
            handle.fanout.clone(),
        )
        .await?;
        *handle.upstream.write().await = Some(session);
        Ok(())
    }
}

fn response_for(handle: &StreamHandle, mode: &str, reused: bool) -> StreamResponse {
    let webcodecs_ok = mode == "webcodecs";
    StreamResponse {
        stream_id: handle.id.clone(),
        play_mode: if webcodecs_ok { "webcodecs" } else { "hls" }.to_string(),
        ws_url: handle.ws_url.clone(),
        hls_url: handle.hls_url.clone(),
        codec: handle.codec.clone(),
        reused,
    }
}

fn viewer_channel_capacity(viewer_buffer_bytes: usize) -> usize {
    (viewer_buffer_bytes / (16 * 1024)).clamp(16, 4096)
}

pub fn normalize_stream_url(input: &str) -> Result<String, AppError> {
    let trimmed = input.trim();
    let parsed = Url::parse(trimmed).map_err(|_| AppError::InvalidUrl(trimmed.to_string()))?;
    match parsed.scheme() {
        "rtsp" | "rtmp" | "rtmps" => Ok(parsed.to_string()),
        "http" | "https" if is_supported_http_stream(&parsed) => Ok(parsed.to_string()),
        "http" | "https" => Err(AppError::InvalidUrl(
            "only HTTP-FLV URLs ending with .flv are supported for http/https".to_string(),
        )),
        other => Err(AppError::InvalidUrl(format!("unsupported scheme {other}"))),
    }
}

fn is_supported_http_stream(url: &Url) -> bool {
    url.path().to_ascii_lowercase().ends_with(".flv")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_supported_stream_schemes() {
        assert!(normalize_stream_url("rtsp://example.test/live/a").is_ok());
        assert!(normalize_stream_url("rtmp://example.test/live/a").is_ok());
        assert!(normalize_stream_url("https://example.test/live/a.flv?codeType=H265").is_ok());
        assert!(normalize_stream_url("https://example.test/live/a").is_err());
    }

    #[test]
    fn accepts_only_http_flv_stream_paths() {
        assert!(is_supported_http_stream(
            &Url::parse("https://example.test/live/a.flv?codeType=H265").unwrap()
        ));
        assert!(!is_supported_http_stream(
            &Url::parse("https://example.test/live/a.m3u8").unwrap()
        ));
    }

    #[test]
    fn derives_bounded_viewer_channel_capacity() {
        assert_eq!(viewer_channel_capacity(1), 16);
        assert_eq!(viewer_channel_capacity(256 * 1024), 16);
        assert_eq!(viewer_channel_capacity(128 * 1024 * 1024), 4096);
    }
}
