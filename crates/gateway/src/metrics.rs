use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct GatewayMetrics {
    pub upstream_count: usize,
    pub viewer_count: usize,
    pub active_transcode_streams: usize,
    pub max_upstreams: usize,
    pub max_viewers: usize,
    pub max_transcode_streams: usize,
    pub playing_count: usize,
    pub recovering_count: usize,
    pub unavailable_count: usize,
    pub restart_total: u64,
}
