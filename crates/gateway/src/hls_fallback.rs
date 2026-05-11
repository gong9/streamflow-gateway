use crate::config::Config;

#[derive(Clone, Debug)]
pub struct HlsFallback {
    zlm_http_origin: String,
    rtsp_push_origin: String,
}

impl HlsFallback {
    pub fn new(config: &Config) -> Self {
        Self {
            zlm_http_origin: config.zlm_http_origin.clone(),
            rtsp_push_origin: config.rtsp_push_origin.trim_end_matches('/').to_string(),
        }
    }

    pub fn hls_url(&self, stream_id: &str) -> String {
        format!("/hls/live/{stream_id}/hls.m3u8")
    }

    pub fn rtsp_push_url(&self, stream_id: &str) -> String {
        format!("{}/{}", self.rtsp_push_origin, stream_id)
    }

    pub fn upstream_http_url(&self, path_and_query: &str) -> String {
        format!(
            "{}{}",
            self.zlm_http_origin.trim_end_matches('/'),
            path_and_query
        )
    }
}
