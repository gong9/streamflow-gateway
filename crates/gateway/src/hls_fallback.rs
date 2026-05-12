use crate::config::Config;
use std::path::{Component, PathBuf};

#[derive(Clone, Debug)]
pub struct HlsFallback {
    zlm_http_origin: String,
    root: PathBuf,
}

impl HlsFallback {
    pub fn new(config: &Config) -> Self {
        Self {
            zlm_http_origin: config.zlm_http_origin.clone(),
            root: PathBuf::from(&config.hls_root),
        }
    }

    pub fn hls_url(&self, stream_id: &str) -> String {
        format!("/hls/live/{stream_id}/hls.m3u8")
    }

    pub fn upstream_http_url(&self, path_and_query: &str) -> String {
        format!(
            "{}{}",
            self.zlm_http_origin.trim_end_matches('/'),
            path_and_query
        )
    }

    pub fn stream_dir(&self, stream_id: &str) -> PathBuf {
        self.root.join("live").join(stream_id)
    }

    pub fn manifest_path(&self, stream_id: &str) -> PathBuf {
        self.stream_dir(stream_id).join("hls.m3u8")
    }

    pub fn segment_pattern(&self, stream_id: &str) -> PathBuf {
        self.stream_dir(stream_id).join("segment_%05d.ts")
    }

    pub fn local_path_for_hls(&self, path: &str) -> Option<PathBuf> {
        let mut clean = PathBuf::new();
        for component in std::path::Path::new(path).components() {
            match component {
                Component::Normal(part) => clean.push(part),
                _ => return None,
            }
        }

        if !clean.starts_with("live") {
            return None;
        }

        Some(self.root.join(clean))
    }
}
