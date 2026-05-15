use serde::{Deserialize, Serialize};
use std::env;

pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_PORT: u16 = 5177;
pub const DEFAULT_ZLM_HTTP_ORIGIN: &str = "http://127.0.0.1:8080";
pub const DEFAULT_ZLM_RTMP_ORIGIN: &str = "rtmp://127.0.0.1:1935/live";
pub const DEFAULT_RTSP_PUSH_ORIGIN: &str = "rtsp://127.0.0.1:8554/live";
pub const DEFAULT_MAX_UPSTREAMS: usize = 50;
pub const DEFAULT_MAX_VIEWERS: usize = 500;
pub const DEFAULT_MAX_TRANSCODE_STREAMS: usize = 2;
pub const DEFAULT_CLEANUP_AFTER_SECS: u64 = 120;
pub const DEFAULT_VIEWER_BUFFER_BYTES: usize = 256 * 1024;
pub const DEFAULT_SPAWN_PROCESSES: bool = true;
pub const DEFAULT_HLS_ROOT: &str = "/tmp/streamflow-hls";
pub const DEFAULT_WS_UPSTREAM: bool = false;
pub const DEFAULT_H265_DIRECT: bool = true;
pub const DEFAULT_H264_FALLBACK: bool = true;
pub const DEFAULT_SEGMENT_FRESH_SECS: u64 = 6;
pub const DEFAULT_SEGMENT_STALE_SECS: u64 = 15;
pub const DEFAULT_RESTART_COOLDOWN_SECS: u64 = 10;
pub const DEFAULT_MAX_RESTART_ATTEMPTS: u64 = 3;
pub const DEFAULT_TRANSCODE_HEIGHT: u32 = 540;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub zlm_http_origin: String,
    pub zlm_rtmp_origin: String,
    pub rtsp_push_origin: String,
    pub max_upstreams: usize,
    pub max_viewers: usize,
    pub max_transcode_streams: usize,
    pub cleanup_after_secs: u64,
    pub viewer_buffer: usize,
    pub spawn_processes: bool,
    pub hls_root: String,
    pub ws_upstream: bool,
    pub h265_direct: bool,
    pub h264_fallback: bool,
    pub segment_fresh_secs: u64,
    pub segment_stale_secs: u64,
    pub restart_cooldown_secs: u64,
    pub max_restart_attempts: u64,
    pub transcode_height: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            host: DEFAULT_HOST.to_string(),
            port: DEFAULT_PORT,
            zlm_http_origin: DEFAULT_ZLM_HTTP_ORIGIN.to_string(),
            zlm_rtmp_origin: DEFAULT_ZLM_RTMP_ORIGIN.to_string(),
            rtsp_push_origin: DEFAULT_RTSP_PUSH_ORIGIN.to_string(),
            max_upstreams: DEFAULT_MAX_UPSTREAMS,
            max_viewers: DEFAULT_MAX_VIEWERS,
            max_transcode_streams: DEFAULT_MAX_TRANSCODE_STREAMS,
            cleanup_after_secs: DEFAULT_CLEANUP_AFTER_SECS,
            viewer_buffer: DEFAULT_VIEWER_BUFFER_BYTES,
            spawn_processes: DEFAULT_SPAWN_PROCESSES,
            hls_root: DEFAULT_HLS_ROOT.to_string(),
            ws_upstream: DEFAULT_WS_UPSTREAM,
            h265_direct: DEFAULT_H265_DIRECT,
            h264_fallback: DEFAULT_H264_FALLBACK,
            segment_fresh_secs: DEFAULT_SEGMENT_FRESH_SECS,
            segment_stale_secs: DEFAULT_SEGMENT_STALE_SECS,
            restart_cooldown_secs: DEFAULT_RESTART_COOLDOWN_SECS,
            max_restart_attempts: DEFAULT_MAX_RESTART_ATTEMPTS,
            transcode_height: DEFAULT_TRANSCODE_HEIGHT,
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
            zlm_rtmp_origin: env_string("ZLM_RTMP_ORIGIN", default.zlm_rtmp_origin),
            rtsp_push_origin: env_string("RTSP_PUSH_ORIGIN", default.rtsp_push_origin),
            max_upstreams: env_parse("MAX_UPSTREAMS", default.max_upstreams),
            max_viewers: env_parse("MAX_VIEWERS", default.max_viewers),
            max_transcode_streams: env_parse(
                "MAX_TRANSCODE_STREAMS",
                default.max_transcode_streams,
            ),
            cleanup_after_secs: env_parse("CLEANUP_AFTER_SECS", default.cleanup_after_secs),
            viewer_buffer: env_parse("VIEWER_BUFFER_BYTES", default.viewer_buffer),
            spawn_processes: env_bool("STREAMFLOW_SPAWN_PROCESSES", default.spawn_processes),
            hls_root: env_string("HLS_ROOT", default.hls_root),
            ws_upstream: env_bool("STREAMFLOW_WS_UPSTREAM", default.ws_upstream),
            h265_direct: env_bool("STREAMFLOW_H265_DIRECT", default.h265_direct),
            h264_fallback: env_bool("STREAMFLOW_H264_FALLBACK", default.h264_fallback),
            segment_fresh_secs: env_parse("SEGMENT_FRESH_SECS", default.segment_fresh_secs),
            segment_stale_secs: env_parse("SEGMENT_STALE_SECS", default.segment_stale_secs),
            restart_cooldown_secs: env_parse(
                "RESTART_COOLDOWN_SECS",
                default.restart_cooldown_secs,
            ),
            max_restart_attempts: env_parse("MAX_RESTART_ATTEMPTS", default.max_restart_attempts),
            transcode_height: env_parse("TRANSCODE_HEIGHT", default.transcode_height),
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
