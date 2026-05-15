use crate::{
    config::Config,
    errors::AppError,
    fanout::{FanoutHub, FanoutStats},
    hls_fallback::HlsFallback,
    metrics::GatewayMetrics,
    upstream::{FfmpegProgress, FfmpegProgressSnapshot, HlsStrategy, SourceProbe, UpstreamSession},
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
use tokio::{
    sync::{Mutex, RwLock},
    time,
};
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
    pub input_url: String,
    pub play_mode: String,
    pub ws_url: String,
    pub hls_url: String,
    pub raw_flv_url: Option<String>,
    pub source_video_codec: Option<String>,
    pub recommended_profile: String,
    pub profiles: Vec<StreamProfile>,
    pub codec: String,
    pub reused: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamProfile {
    pub profile: &'static str,
    pub label: &'static str,
    pub codec: &'static str,
    pub transport: &'static str,
    pub url: String,
    pub strategy: &'static str,
    pub cpu_cost: &'static str,
    pub ready: bool,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StreamHealthState {
    Warming,
    Playing,
    Recovering,
    Restarting,
    Unavailable,
    Idle,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamStatus {
    pub stream_id: String,
    pub input_url: String,
    pub codec: String,
    pub hls_strategy: HlsStrategy,
    pub source_video_codec: Option<String>,
    pub source_audio_codec: Option<String>,
    pub source_width: Option<u32>,
    pub source_height: Option<u32>,
    pub strategy_reason: Option<String>,
    pub running: bool,
    pub viewer_count: usize,
    pub upstream_pid: Option<u32>,
    pub started_at: DateTime<Utc>,
    pub idle_since: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub restart_count: u64,
    pub health_state: StreamHealthState,
    pub health_label: &'static str,
    pub segment_fresh: bool,
    pub last_segment_at: Option<DateTime<Utc>>,
    pub last_restart_at: Option<DateTime<Utc>>,
    pub consecutive_failures: u64,
    pub recovering: bool,
    pub dropped_frames: u64,
    pub hls_url: String,
    pub ws_url: String,
    pub raw_flv_url: Option<String>,
    pub recommended_profile: String,
    pub profiles: Vec<StreamProfile>,
    pub diagnostics: StreamDiagnostics,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamDiagnostics {
    pub fps: Option<f64>,
    pub bitrate_kbps: Option<f64>,
    pub speed: Option<f64>,
    pub frame: Option<u64>,
    pub output_time_ms: Option<u64>,
    pub total_size_bytes: Option<u64>,
    pub dup_frames: Option<u64>,
    pub drop_frames: Option<u64>,
    pub progress_updated_at: Option<DateTime<Utc>>,
    pub segment_fresh: bool,
    pub last_segment_at: Option<DateTime<Utc>>,
    pub viewer_count: usize,
    pub dropped_frames: u64,
    pub restart_count: u64,
    pub consecutive_failures: u64,
    pub running: bool,
    pub health_state: StreamHealthState,
    pub health_label: &'static str,
    pub hls_strategy: HlsStrategy,
    pub source_video_codec: Option<String>,
    pub source_audio_codec: Option<String>,
    pub strategy_reason: Option<String>,
}

#[derive(Debug)]
pub struct StreamHandle {
    pub id: String,
    pub input_url: String,
    pub normalized_url: String,
    pub codec: String,
    pub hls_url: String,
    pub ws_url: String,
    pub raw_flv_url: String,
    pub started_at: DateTime<Utc>,
    pub fanout: Arc<FanoutHub>,
    pub progress: Arc<FfmpegProgress>,
    pub source_probe: RwLock<Option<SourceProbe>>,
    pub upstream: RwLock<Option<UpstreamSession>>,
    pub idle_since: RwLock<Option<DateTime<Utc>>>,
    pub last_hls_access_at: RwLock<Option<DateTime<Utc>>>,
    pub health_state: RwLock<StreamHealthState>,
    pub last_segment_at: RwLock<Option<DateTime<Utc>>>,
    pub last_restart_at: RwLock<Option<DateTime<Utc>>>,
    pub last_error: RwLock<Option<String>>,
    pub restart_count: AtomicU64,
    pub consecutive_failures: AtomicU64,
}

impl StreamHandle {
    pub async fn status(&self, config: &Config) -> StreamStatus {
        let stats: FanoutStats = self.fanout.stats();
        let upstream = self.upstream.read().await;
        let running = match upstream.as_ref() {
            Some(session) => session.is_running().await,
            None => false,
        };
        let upstream_pid = match upstream.as_ref() {
            Some(session) => session.pid().await,
            None => None,
        };
        let raw_ready = match upstream.as_ref() {
            Some(session) => session.raw_running().await,
            None => false,
        };
        let hls_ready = match upstream.as_ref() {
            Some(session) => session.hls_running().await,
            None => false,
        };
        let health_state = *self.health_state.read().await;
        let last_segment_at = *self.last_segment_at.read().await;
        let segment_fresh = last_segment_at
            .and_then(|time| (Utc::now() - time).to_std().ok())
            .is_some_and(|age| age <= Duration::from_secs(config.segment_fresh_secs));
        let restart_count = self.restart_count.load(Ordering::Relaxed);
        let consecutive_failures = self.consecutive_failures.load(Ordering::Relaxed);
        let progress = self.progress.snapshot().await;
        let source_probe = self.source_probe.read().await.clone();
        let hls_strategy = source_probe
            .as_ref()
            .map(|probe| probe.strategy)
            .unwrap_or(HlsStrategy::Transcode);
        let profiles = profiles_for(
            &self.hls_url,
            &self.raw_flv_url,
            source_probe.as_ref(),
            raw_ready,
            hls_ready,
        );
        let recommended_profile = recommended_profile(source_probe.as_ref(), raw_ready).to_string();
        let diagnostics = diagnostics_for(
            progress,
            segment_fresh,
            last_segment_at,
            stats.viewer_count,
            stats.dropped_frames,
            restart_count,
            consecutive_failures,
            running,
            health_state,
            hls_strategy,
            source_probe.as_ref(),
        );
        StreamStatus {
            stream_id: self.id.clone(),
            input_url: self.input_url.clone(),
            codec: self.codec.clone(),
            hls_strategy,
            source_video_codec: source_probe
                .as_ref()
                .and_then(|probe| probe.video_codec.clone()),
            source_audio_codec: source_probe
                .as_ref()
                .and_then(|probe| probe.audio_codec.clone()),
            source_width: source_probe.as_ref().and_then(|probe| probe.width),
            source_height: source_probe.as_ref().and_then(|probe| probe.height),
            strategy_reason: source_probe.as_ref().map(|probe| probe.reason.clone()),
            running,
            viewer_count: stats.viewer_count,
            upstream_pid,
            started_at: self.started_at,
            idle_since: *self.idle_since.read().await,
            last_error: self.last_error.read().await.clone(),
            restart_count,
            health_state,
            health_label: health_label(health_state),
            segment_fresh,
            last_segment_at,
            last_restart_at: *self.last_restart_at.read().await,
            consecutive_failures,
            recovering: health_state == StreamHealthState::Recovering
                || health_state == StreamHealthState::Restarting,
            dropped_frames: stats.dropped_frames,
            hls_url: self.hls_url.clone(),
            ws_url: self.ws_url.clone(),
            raw_flv_url: h265_direct_url(source_probe.as_ref(), &self.raw_flv_url),
            recommended_profile,
            profiles,
            diagnostics,
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
        *self.last_hls_access_at.write().await = Some(Utc::now());
        if self.fanout.stats().viewer_count == 0 {
            *self.idle_since.write().await = Some(Utc::now());
        }
    }

    async fn has_recent_hls_access(&self, ttl: Duration) -> bool {
        self.last_hls_access_at
            .read()
            .await
            .and_then(|time| (Utc::now() - time).to_std().ok())
            .is_some_and(|age| age <= ttl)
    }
}

#[derive(Debug)]
pub struct StreamManager {
    config: Config,
    hls: HlsFallback,
    streams_by_id: DashMap<String, Arc<StreamHandle>>,
    streams_by_url: DashMap<String, String>,
    viewer_slots: AtomicUsize,
    fallback_start_lock: Mutex<()>,
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
            fallback_start_lock: Mutex::new(()),
        }
    }

    pub async fn create_or_reuse(
        &self,
        req: CreateStreamRequest,
    ) -> Result<StreamResponse, AppError> {
        let normalized_url = normalize_stream_url(&req.url)?;
        let existing_handle = self
            .streams_by_url
            .get(&normalized_url)
            .and_then(|existing| {
                self.streams_by_id
                    .get(existing.value())
                    .map(|handle| handle.value().clone())
            });

        if let Some(handle) = existing_handle {
            if !is_browser_direct_h265_handle(&handle).await {
                self.ensure_upstream_running(handle.clone()).await?;
            }
            handle.mark_viewer_joined().await;
            return Ok(response_for(&handle, &req.mode, true));
        }

        if self.streams_by_id.len() >= self.config.max_upstreams {
            return Err(AppError::UpstreamLimit);
        }

        let stream_id = Uuid::new_v4().to_string();
        let hls_url = self.hls.hls_url(&stream_id);
        let raw_flv_url = self.hls.raw_flv_url(&stream_id);
        let ws_url = format!("/ws/streams/{stream_id}");
        let fanout = Arc::new(FanoutHub::new(viewer_channel_capacity(
            self.config.viewer_buffer,
        )));
        let progress = Arc::new(FfmpegProgress::default());
        let handle = Arc::new(StreamHandle {
            id: stream_id.clone(),
            input_url: req.url.trim().to_string(),
            normalized_url: normalized_url.clone(),
            codec: "h264".to_string(),
            hls_url,
            ws_url,
            raw_flv_url,
            started_at: Utc::now(),
            fanout: fanout.clone(),
            progress: progress.clone(),
            source_probe: RwLock::new(None),
            upstream: RwLock::new(None),
            idle_since: RwLock::new(Some(Utc::now())),
            last_hls_access_at: RwLock::new(None),
            health_state: RwLock::new(StreamHealthState::Warming),
            last_segment_at: RwLock::new(None),
            last_restart_at: RwLock::new(None),
            last_error: RwLock::new(None),
            restart_count: AtomicU64::new(0),
            consecutive_failures: AtomicU64::new(0),
        });

        if let Some(probe) = browser_direct_h265_probe(&req.url) {
            *handle.source_probe.write().await = Some(probe);
            *handle.health_state.write().await = StreamHealthState::Playing;
        } else if self.config.spawn_processes {
            if let Err(err) = self.start_upstream(handle.clone()).await {
                *handle.last_error.write().await = Some(err.to_string());
                *handle.health_state.write().await = StreamHealthState::Unavailable;
                handle.consecutive_failures.fetch_add(1, Ordering::Relaxed);
            }
        } else if let Ok(session) = UpstreamSession::start(
            stream_id.clone(),
            req.url.trim().to_string(),
            self.config.clone(),
            self.hls.clone(),
            fanout,
            progress,
        )
        .await
        {
            *handle.source_probe.write().await = Some(session.probe().clone());
            *handle.upstream.write().await = Some(session);
            *handle.health_state.write().await = StreamHealthState::Playing;
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
        Ok(handle.status(&self.config).await)
    }

    pub async fn start_h264_fallback(&self, stream_id: &str) -> Result<StreamStatus, AppError> {
        if !self.config.h264_fallback {
            return Err(AppError::Internal(
                "h264 fallback is disabled by configuration".to_string(),
            ));
        }

        let handle = self.get(stream_id).ok_or(AppError::NotFound)?;
        let _guard = self.fallback_start_lock.lock().await;
        if handle.upstream.read().await.is_none() {
            let session = UpstreamSession::start(
                handle.id.clone(),
                handle.input_url.clone(),
                self.config.clone(),
                self.hls.clone(),
                handle.fanout.clone(),
                handle.progress.clone(),
            )
            .await
            .map_err(|err| AppError::Internal(format!("upstream start failed: {err}")))?;
            *handle.source_probe.write().await = Some(session.probe().clone());
            *handle.upstream.write().await = Some(session);
        }
        let upstream = handle.upstream.read().await;
        let Some(session) = upstream.as_ref() else {
            return Err(AppError::Internal("upstream is not ready".to_string()));
        };

        if !session.hls_running().await
            && transcode_limit_reached(
                self.active_transcode_streams().await,
                self.config.max_transcode_streams,
            )
        {
            return Err(AppError::TranscodeLimit);
        }

        session
            .ensure_hls_fallback(
                &handle.id,
                &handle.input_url,
                &self.hls,
                handle.progress.clone(),
            )
            .await?;
        *handle.last_restart_at.write().await = Some(Utc::now());
        *handle.last_segment_at.write().await = None;
        *handle.health_state.write().await = StreamHealthState::Warming;
        Ok(handle.status(&self.config).await)
    }

    pub async fn list(&self) -> Vec<StreamStatus> {
        let handles: Vec<_> = self
            .streams_by_id
            .iter()
            .map(|entry| entry.value().clone())
            .collect();
        let mut statuses = Vec::with_capacity(handles.len());
        for handle in handles {
            statuses.push(handle.status(&self.config).await);
        }
        statuses
    }

    pub async fn release(&self, stream_id: &str) -> Result<StreamStatus, AppError> {
        let handle = self.get(stream_id).ok_or(AppError::NotFound)?;
        handle.mark_viewer_left_if_idle().await;
        Ok(handle.status(&self.config).await)
    }

    pub async fn mark_hls_access(&self, stream_id: &str) {
        if let Some(handle) = self.get(stream_id) {
            handle.mark_hls_access().await;
        }
    }

    pub async fn mark_raw_flv_access(&self, stream_id: &str) {
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
        *handle.health_state.write().await = StreamHealthState::Idle;
        Ok(handle.status(&self.config).await)
    }

    pub async fn reap_idle_once(&self) -> usize {
        let ttl = self.cleanup_after();
        let now = Utc::now();
        let handles: Vec<_> = self
            .streams_by_id
            .iter()
            .map(|entry| entry.value().clone())
            .collect();
        let mut candidates = Vec::new();

        for handle in handles {
            if handle.fanout.stats().viewer_count > 0 {
                continue;
            }

            let last_hls_access_at = *handle.last_hls_access_at.read().await;
            let idle_since = *handle.idle_since.read().await;
            let last_activity_at = last_hls_access_at.or(idle_since);
            let idle_for = last_activity_at
                .and_then(|time| (now - time).to_std().ok())
                .unwrap_or(ttl);

            if idle_for >= ttl {
                candidates.push(handle.id.clone());
            }
        }

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
            if !self.should_monitor_stream(&handle).await {
                *handle.health_state.write().await = StreamHealthState::Idle;
                continue;
            }

            let running = {
                let upstream = handle.upstream.read().await;
                match upstream.as_ref() {
                    Some(session) => session.is_running().await,
                    None => false,
                }
            };

            let raw_direct_only = {
                let upstream = handle.upstream.read().await;
                match upstream.as_ref() {
                    Some(session) => session.raw_direct() && !session.hls_enabled().await,
                    None => false,
                }
            };

            if running && raw_direct_only {
                *handle.health_state.write().await = StreamHealthState::Playing;
                *handle.last_error.write().await = None;
                handle.consecutive_failures.store(0, Ordering::Relaxed);
                continue;
            }

            let latest_segment_at = self.hls.latest_segment_modified(&handle.id);
            if let Some(segment_at) = latest_segment_at {
                *handle.last_segment_at.write().await = Some(segment_at);
            }

            let now = Utc::now();
            let segment_age = latest_segment_at.and_then(|time| (now - time).to_std().ok());
            let warm_since = (*handle.last_restart_at.read().await).unwrap_or(handle.started_at);
            let warm_for = (now - warm_since).to_std().unwrap_or_default();

            if running {
                match segment_age {
                    Some(age) if age <= Duration::from_secs(self.config.segment_fresh_secs) => {
                        *handle.health_state.write().await = StreamHealthState::Playing;
                        *handle.last_error.write().await = None;
                        handle.consecutive_failures.store(0, Ordering::Relaxed);
                    }
                    Some(age) if age <= Duration::from_secs(self.config.segment_stale_secs) => {
                        *handle.health_state.write().await = StreamHealthState::Recovering;
                    }
                    None if warm_for <= Duration::from_secs(self.config.segment_stale_secs) => {
                        *handle.health_state.write().await = StreamHealthState::Warming;
                    }
                    _ => {
                        if self
                            .restart_unhealthy_upstream(handle.clone(), "HLS 分片长时间没有更新")
                            .await
                        {
                            restarted += 1;
                        }
                    }
                }
            } else if self
                .restart_unhealthy_upstream(handle.clone(), "上游进程已退出")
                .await
            {
                restarted += 1;
            }
        }

        restarted
    }

    async fn should_monitor_stream(&self, handle: &StreamHandle) -> bool {
        handle.fanout.stats().viewer_count > 0
            || handle.has_recent_hls_access(self.cleanup_after()).await
    }

    async fn restart_unhealthy_upstream(
        &self,
        handle: Arc<StreamHandle>,
        reason: &'static str,
    ) -> bool {
        let now = Utc::now();
        if let Some(last_restart_at) = *handle.last_restart_at.read().await {
            let restart_age = (now - last_restart_at).to_std().unwrap_or_default();
            if restart_age < Duration::from_secs(self.config.restart_cooldown_secs) {
                *handle.health_state.write().await = StreamHealthState::Recovering;
                *handle.last_error.write().await = Some(format!("{reason}，正在等待自动恢复"));
                return false;
            }
        }

        let attempt = handle.consecutive_failures.fetch_add(1, Ordering::Relaxed) + 1;
        if attempt > self.config.max_restart_attempts {
            *handle.health_state.write().await = StreamHealthState::Unavailable;
            *handle.last_error.write().await =
                Some(format!("{reason}，已超过自动重启上限，请稍后重试"));
            warn!(
                stream_id = handle.id,
                attempts = attempt,
                reason,
                "stream marked unavailable"
            );
            return false;
        }

        *handle.health_state.write().await = StreamHealthState::Restarting;
        if let Some(upstream) = handle.upstream.write().await.take() {
            upstream.stop().await;
        }

        match self.start_upstream(handle.clone()).await {
            Ok(()) => {
                *handle.last_restart_at.write().await = Some(now);
                *handle.health_state.write().await = StreamHealthState::Warming;
                *handle.last_error.write().await = None;
                handle.restart_count.fetch_add(1, Ordering::Relaxed);
                info!(
                    stream_id = handle.id,
                    reason, "restarted unhealthy upstream"
                );
                true
            }
            Err(err) => {
                let message = err.to_string();
                *handle.health_state.write().await = StreamHealthState::Recovering;
                *handle.last_error.write().await = Some(message.clone());
                error!(
                    stream_id = handle.id,
                    error = %message,
                    reason,
                    "failed to restart unhealthy upstream"
                );
                false
            }
        }
    }

    pub async fn run_housekeeping(self: Arc<Self>) {
        let mut interval = time::interval(Duration::from_secs(2));
        loop {
            interval.tick().await;
            self.reap_idle_once().await;
            self.restart_failed_once().await;
        }
    }

    pub fn metrics(&self) -> GatewayMetrics {
        let viewer_count = self.viewer_slots.load(Ordering::Relaxed);
        let active_transcode_streams = self.active_transcode_streams_snapshot();
        let mut playing_count = 0;
        let mut recovering_count = 0;
        let mut unavailable_count = 0;
        let mut restart_total = 0;

        for entry in self.streams_by_id.iter() {
            let handle = entry.value();
            restart_total += handle.restart_count.load(Ordering::Relaxed);
            match handle.health_state.try_read().map(|state| *state).ok() {
                Some(StreamHealthState::Playing) => playing_count += 1,
                Some(StreamHealthState::Recovering | StreamHealthState::Restarting) => {
                    recovering_count += 1
                }
                Some(StreamHealthState::Unavailable) => unavailable_count += 1,
                _ => {}
            }
        }

        GatewayMetrics {
            upstream_count: self.streams_by_id.len(),
            viewer_count,
            active_transcode_streams,
            max_upstreams: self.config.max_upstreams,
            max_viewers: self.config.max_viewers,
            max_transcode_streams: self.config.max_transcode_streams,
            playing_count,
            recovering_count,
            unavailable_count,
            restart_total,
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
            handle.progress.clone(),
        )
        .await?;
        *handle.source_probe.write().await = Some(session.probe().clone());
        *handle.upstream.write().await = Some(session);
        Ok(())
    }

    async fn active_transcode_streams(&self) -> usize {
        let handles: Vec<_> = self
            .streams_by_id
            .iter()
            .map(|entry| entry.value().clone())
            .collect();
        let mut count = 0;
        for handle in handles {
            let upstream = handle.upstream.read().await;
            if let Some(session) = upstream.as_ref() {
                if session.hls_transcoding().await {
                    count += 1;
                }
            }
        }
        count
    }

    fn active_transcode_streams_snapshot(&self) -> usize {
        self.streams_by_id
            .iter()
            .filter(|entry| {
                entry.value().upstream.try_read().is_ok_and(|upstream| {
                    upstream
                        .as_ref()
                        .is_some_and(UpstreamSession::hls_transcode_profile_allocated)
                })
            })
            .count()
    }

    async fn ensure_upstream_running(&self, handle: Arc<StreamHandle>) -> Result<(), AppError> {
        if !self.config.spawn_processes {
            *handle.idle_since.write().await = None;
            return Ok(());
        }

        let running = {
            let upstream = handle.upstream.read().await;
            match upstream.as_ref() {
                Some(session) => session.is_running().await,
                None => false,
            }
        };

        if running {
            *handle.last_error.write().await = None;
            *handle.idle_since.write().await = None;
            return Ok(());
        }

        if let Some(upstream) = handle.upstream.write().await.take() {
            upstream.stop().await;
        }

        self.start_upstream(handle.clone()).await?;
        handle.restart_count.fetch_add(1, Ordering::Relaxed);
        handle.consecutive_failures.store(0, Ordering::Relaxed);
        *handle.last_error.write().await = None;
        *handle.idle_since.write().await = None;
        *handle.last_restart_at.write().await = Some(Utc::now());
        *handle.health_state.write().await = StreamHealthState::Warming;
        info!(
            stream_id = handle.id,
            "restarted inactive upstream before reusing stream"
        );
        Ok(())
    }
}

fn response_for(handle: &StreamHandle, mode: &str, reused: bool) -> StreamResponse {
    let webcodecs_ok = mode == "webcodecs";
    let source_probe = handle
        .source_probe
        .try_read()
        .ok()
        .and_then(|probe| probe.clone());
    let profiles = profiles_for(
        &handle.hls_url,
        &handle.raw_flv_url,
        source_probe.as_ref(),
        false,
        false,
    );
    StreamResponse {
        stream_id: handle.id.clone(),
        input_url: handle.input_url.clone(),
        play_mode: if webcodecs_ok { "webcodecs" } else { "hls" }.to_string(),
        ws_url: handle.ws_url.clone(),
        hls_url: handle.hls_url.clone(),
        raw_flv_url: h265_direct_url(source_probe.as_ref(), &handle.raw_flv_url),
        source_video_codec: source_probe
            .as_ref()
            .and_then(|probe| probe.video_codec.clone()),
        recommended_profile: recommended_profile(source_probe.as_ref(), false).to_string(),
        profiles,
        codec: handle.codec.clone(),
        reused,
    }
}

fn profiles_for(
    hls_url: &str,
    raw_flv_url: &str,
    source_probe: Option<&SourceProbe>,
    raw_ready: bool,
    hls_ready: bool,
) -> Vec<StreamProfile> {
    let mut profiles = Vec::new();
    if source_probe.is_some_and(SourceProbe::is_hevc) {
        profiles.push(StreamProfile {
            profile: "raw_h265",
            label: "原始直出",
            codec: "h265",
            transport: "http_flv",
            url: raw_flv_url.to_string(),
            strategy: "copy",
            cpu_cost: "low",
            ready: raw_ready,
        });
    }

    profiles.push(StreamProfile {
        profile: "fallback_h264",
        label: if source_probe.is_some_and(SourceProbe::is_hevc) {
            "兼容转码"
        } else {
            "稳定播放"
        },
        codec: "h264",
        transport: "hls",
        url: hls_url.to_string(),
        strategy: if source_probe.is_some_and(SourceProbe::is_hevc) {
            "transcode_on_demand"
        } else {
            "copy_or_transcode"
        },
        cpu_cost: if source_probe.is_some_and(SourceProbe::is_hevc) {
            "high"
        } else {
            "low"
        },
        ready: hls_ready,
    });

    profiles
}

fn recommended_profile(source_probe: Option<&SourceProbe>, raw_ready: bool) -> &'static str {
    if source_probe.is_some_and(SourceProbe::is_hevc) || raw_ready {
        "raw_h265"
    } else {
        "fallback_h264"
    }
}

fn h265_direct_url(source_probe: Option<&SourceProbe>, raw_flv_url: &str) -> Option<String> {
    source_probe
        .is_some_and(SourceProbe::is_hevc)
        .then(|| raw_flv_url.to_string())
}

fn browser_direct_h265_probe(input_url: &str) -> Option<SourceProbe> {
    is_browser_direct_h265_url(input_url).then(|| SourceProbe {
        video_codec: Some("hevc".to_string()),
        audio_codec: None,
        width: None,
        height: None,
        strategy: HlsStrategy::Transcode,
        reason: "HTTP-FLV URL declares H265; browser direct playback is preferred".to_string(),
    })
}

fn is_browser_direct_h265_url(input_url: &str) -> bool {
    let Ok(url) = Url::parse(input_url) else {
        return false;
    };
    if !matches!(url.scheme(), "http" | "https")
        || !url.path().to_ascii_lowercase().ends_with(".flv")
    {
        return false;
    }
    url.query_pairs().any(|(key, value)| {
        key.eq_ignore_ascii_case("codeType")
            && matches!(value.to_ascii_lowercase().as_str(), "h265" | "hevc")
    })
}

async fn is_browser_direct_h265_handle(handle: &StreamHandle) -> bool {
    is_browser_direct_h265_url(&handle.input_url)
        && handle
            .source_probe
            .read()
            .await
            .as_ref()
            .is_some_and(SourceProbe::is_hevc)
        && handle.upstream.read().await.is_none()
}

fn diagnostics_for(
    progress: FfmpegProgressSnapshot,
    segment_fresh: bool,
    last_segment_at: Option<DateTime<Utc>>,
    viewer_count: usize,
    dropped_frames: u64,
    restart_count: u64,
    consecutive_failures: u64,
    running: bool,
    health_state: StreamHealthState,
    hls_strategy: HlsStrategy,
    source_probe: Option<&SourceProbe>,
) -> StreamDiagnostics {
    StreamDiagnostics {
        fps: progress.fps,
        bitrate_kbps: progress.bitrate_kbps,
        speed: progress.speed,
        frame: progress.frame,
        output_time_ms: progress.out_time_ms,
        total_size_bytes: progress.total_size_bytes,
        dup_frames: progress.dup_frames,
        drop_frames: progress.drop_frames,
        progress_updated_at: progress.last_progress_at,
        segment_fresh,
        last_segment_at,
        viewer_count,
        dropped_frames,
        restart_count,
        consecutive_failures,
        running,
        health_state,
        health_label: health_label(health_state),
        hls_strategy,
        source_video_codec: source_probe.and_then(|probe| probe.video_codec.clone()),
        source_audio_codec: source_probe.and_then(|probe| probe.audio_codec.clone()),
        strategy_reason: source_probe.map(|probe| probe.reason.clone()),
    }
}

fn health_label(state: StreamHealthState) -> &'static str {
    match state {
        StreamHealthState::Warming => "预热中",
        StreamHealthState::Playing => "播放中",
        StreamHealthState::Recovering => "恢复中",
        StreamHealthState::Restarting => "重启中",
        StreamHealthState::Unavailable => "暂不可用",
        StreamHealthState::Idle => "空闲",
    }
}

fn viewer_channel_capacity(viewer_buffer_bytes: usize) -> usize {
    (viewer_buffer_bytes / (16 * 1024)).clamp(16, 4096)
}

fn transcode_limit_reached(active: usize, max: usize) -> bool {
    active >= max
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

    #[test]
    fn transcode_limit_is_strict_and_zero_disables_fallback() {
        assert!(transcode_limit_reached(0, 0));
        assert!(!transcode_limit_reached(1, 2));
        assert!(transcode_limit_reached(2, 2));
    }

    #[tokio::test]
    async fn create_or_reuse_reactivates_existing_stream() {
        let temp = tempfile::tempdir().unwrap();
        let config = Config {
            spawn_processes: false,
            hls_root: temp.path().to_string_lossy().to_string(),
            ..Config::default()
        };
        let hls = HlsFallback::new(&config);
        let manager = StreamManager::new(config, hls);

        let first = manager
            .create_or_reuse(CreateStreamRequest {
                url: "rtsp://example.test/live/cam".to_string(),
                mode: "auto".to_string(),
            })
            .await
            .unwrap();

        let handle = manager.get(&first.stream_id).unwrap();
        *handle.idle_since.write().await = Some(Utc::now());

        let second = manager
            .create_or_reuse(CreateStreamRequest {
                url: "rtsp://example.test/live/cam".to_string(),
                mode: "auto".to_string(),
            })
            .await
            .unwrap();

        assert!(second.reused);
        assert_eq!(first.stream_id, second.stream_id);
        assert!(manager
            .status(&second.stream_id)
            .await
            .unwrap()
            .idle_since
            .is_none());
    }

    #[tokio::test]
    async fn recent_hls_access_keeps_stream_alive_during_idle_reap() {
        let temp = tempfile::tempdir().unwrap();
        let config = Config {
            spawn_processes: false,
            cleanup_after_secs: 1,
            hls_root: temp.path().to_string_lossy().to_string(),
            ..Config::default()
        };
        let hls = HlsFallback::new(&config);
        let manager = StreamManager::new(config, hls);

        let stream = manager
            .create_or_reuse(CreateStreamRequest {
                url: "rtsp://example.test/live/hls-only".to_string(),
                mode: "auto".to_string(),
            })
            .await
            .unwrap();

        let handle = manager.get(&stream.stream_id).unwrap();
        *handle.idle_since.write().await = Some(Utc::now() - chrono::Duration::seconds(10));
        handle.mark_hls_access().await;

        assert_eq!(manager.reap_idle_once().await, 0);
        assert!(manager.get(&stream.stream_id).is_some());
    }
}
