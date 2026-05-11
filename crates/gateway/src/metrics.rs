use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct GatewayMetrics {
    pub upstream_count: usize,
    pub viewer_count: usize,
    pub max_upstreams: usize,
    pub max_viewers: usize,
}
