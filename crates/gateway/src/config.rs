use serde::{Deserialize, Serialize};
use std::env;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub zlm_http_origin: String,
    pub rtsp_push_origin: String,
    pub max_upstreams: usize,
    pub max_viewers: usize,
    pub cleanup_after_secs: u64,
    pub viewer_buffer: usize,
    pub spawn_processes: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 5177,
            zlm_http_origin: "http://127.0.0.1:8080".to_string(),
            rtsp_push_origin: "rtsp://127.0.0.1:8554/live".to_string(),
            max_upstreams: 50,
            max_viewers: 500,
            cleanup_after_secs: 120,
            viewer_buffer: 256 * 1024,
            spawn_processes: true,
        }
    }
}

impl Config {
    pub fn from_env() -> Self {
        let default = Self::default();
        Self {
            host: env::var("GATEWAY_HOST").unwrap_or(default.host),
            port: env::var("GATEWAY_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.port),
            zlm_http_origin: env::var("ZLM_HTTP_ORIGIN").unwrap_or(default.zlm_http_origin),
            rtsp_push_origin: env::var("RTSP_PUSH_ORIGIN").unwrap_or(default.rtsp_push_origin),
            max_upstreams: env::var("MAX_UPSTREAMS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.max_upstreams),
            max_viewers: env::var("MAX_VIEWERS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.max_viewers),
            cleanup_after_secs: env::var("CLEANUP_AFTER_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.cleanup_after_secs),
            viewer_buffer: env::var("VIEWER_BUFFER_BYTES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.viewer_buffer),
            spawn_processes: env::var("STREAMFLOW_SPAWN_PROCESSES")
                .map(|v| v != "0")
                .unwrap_or(default.spawn_processes),
        }
    }
}
