use serde::{Deserialize, Serialize};
use std::env;

pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_PORT: u16 = 5177;
pub const DEFAULT_ZLM_HTTP_ORIGIN: &str = "http://127.0.0.1:8080";
pub const DEFAULT_RTSP_PUSH_ORIGIN: &str = "rtsp://127.0.0.1:8554/live";
pub const DEFAULT_MAX_UPSTREAMS: usize = 50;
pub const DEFAULT_MAX_VIEWERS: usize = 500;
pub const DEFAULT_CLEANUP_AFTER_SECS: u64 = 120;
pub const DEFAULT_VIEWER_BUFFER_BYTES: usize = 256 * 1024;
pub const DEFAULT_SPAWN_PROCESSES: bool = true;

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
            host: DEFAULT_HOST.to_string(),
            port: DEFAULT_PORT,
            zlm_http_origin: DEFAULT_ZLM_HTTP_ORIGIN.to_string(),
            rtsp_push_origin: DEFAULT_RTSP_PUSH_ORIGIN.to_string(),
            max_upstreams: DEFAULT_MAX_UPSTREAMS,
            max_viewers: DEFAULT_MAX_VIEWERS,
            cleanup_after_secs: DEFAULT_CLEANUP_AFTER_SECS,
            viewer_buffer: DEFAULT_VIEWER_BUFFER_BYTES,
            spawn_processes: DEFAULT_SPAWN_PROCESSES,
        }
    }
}

impl Config {
    pub fn from_env() -> Self {
        let default = Self::default();
        Self {
            host: env_string("GATEWAY_HOST", default.host),
            port: env_parse("GATEWAY_PORT", default.port),
            zlm_http_origin: env_string("ZLM_HTTP_ORIGIN", default.zlm_http_origin),
            rtsp_push_origin: env_string("RTSP_PUSH_ORIGIN", default.rtsp_push_origin),
            max_upstreams: env_parse("MAX_UPSTREAMS", default.max_upstreams),
            max_viewers: env_parse("MAX_VIEWERS", default.max_viewers),
            cleanup_after_secs: env_parse("CLEANUP_AFTER_SECS", default.cleanup_after_secs),
            viewer_buffer: env_parse("VIEWER_BUFFER_BYTES", default.viewer_buffer),
            spawn_processes: env_bool("STREAMFLOW_SPAWN_PROCESSES", default.spawn_processes),
        }
    }
}

fn env_string(key: &str, default: String) -> String {
    env::var(key).unwrap_or(default)
}

fn env_parse<T>(key: &str, default: T) -> T
where
    T: std::str::FromStr,
{
    env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_bool(key: &str, default: bool) -> bool {
    env::var(key)
        .map(|value| !matches!(value.as_str(), "0" | "false" | "FALSE" | "off" | "OFF"))
        .unwrap_or(default)
}
