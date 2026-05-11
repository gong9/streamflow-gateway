use crate::{config::Config, fanout::FanoutHub, hls_fallback::HlsFallback};
use anyhow::{Context, Result};
use bytes::Bytes;
use serde::Serialize;
use std::{process::Stdio, sync::Arc};
use tokio::{
    io::{AsyncReadExt, BufReader},
    process::{Child, Command},
    sync::Mutex,
};
use tracing::{error, info, warn};

#[derive(Debug, Serialize)]
struct ControlEvent<'a> {
    event: &'a str,
    codec: &'a str,
    container: &'a str,
}

#[derive(Debug)]
pub struct UpstreamSession {
    ws_child: Mutex<Option<Child>>,
    hls_child: Mutex<Option<Child>>,
    ws_pid: Option<u32>,
    hls_pid: Option<u32>,
}

impl UpstreamSession {
    pub async fn start(
        stream_id: String,
        input_url: String,
        config: Config,
        hls: HlsFallback,
        fanout: Arc<FanoutHub>,
    ) -> Result<Self> {
        if !config.spawn_processes {
            fanout.send_control(&ControlEvent {
                event: "ready",
                codec: "h264",
                container: "mpegts",
            });
            return Ok(Self {
                ws_child: Mutex::new(None),
                hls_child: Mutex::new(None),
                ws_pid: None,
                hls_pid: None,
            });
        }

        let mut ws_cmd = Command::new("ffmpeg");
        ws_cmd
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("warning")
            .arg("-fflags")
            .arg("nobuffer")
            .arg("-flags")
            .arg("low_delay")
            .arg("-i")
            .arg(&input_url)
            .arg("-map")
            .arg("0:v:0")
            .arg("-an")
            .arg("-c:v")
            .arg("copy")
            .arg("-f")
            .arg("mpegts")
            .arg("pipe:1")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        let mut ws_child = ws_cmd.spawn().context("spawn websocket ffmpeg")?;
        let ws_pid = ws_child.id();
        info!(stream_id, ?ws_pid, "started websocket upstream");

        if let Some(stdout) = ws_child.stdout.take() {
            let fanout_clone = fanout.clone();
            let stream_for_task = stream_id.clone();
            tokio::spawn(async move {
                fanout_clone.send_control(&ControlEvent {
                    event: "ready",
                    codec: "h264",
                    container: "mpegts",
                });
                let mut reader = BufReader::new(stdout);
                let mut buf = vec![0_u8; 16 * 1024];
                loop {
                    match reader.read(&mut buf).await {
                        Ok(0) => {
                            warn!(
                                stream_id = stream_for_task,
                                "websocket upstream stdout closed"
                            );
                            break;
                        }
                        Ok(n) => fanout_clone.send_binary(Bytes::copy_from_slice(&buf[..n])),
                        Err(err) => {
                            error!(stream_id = stream_for_task, error = %err, "websocket upstream read error");
                            break;
                        }
                    }
                }
            });
        }

        if let Some(stderr) = ws_child.stderr.take() {
            let stream_for_task = stream_id.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr);
                let mut buf = vec![0_u8; 4096];
                while let Ok(n) = reader.read(&mut buf).await {
                    if n == 0 {
                        break;
                    }
                    let msg = String::from_utf8_lossy(&buf[..n]);
                    warn!(stream_id = stream_for_task, ffmpeg = %msg.trim(), "websocket upstream stderr");
                }
            });
        }

        let rtsp_push_url = hls.rtsp_push_url(&stream_id);
        let mut hls_cmd = Command::new("ffmpeg");
        hls_cmd
            .arg("-hide_banner")
            .arg("-loglevel")
            .arg("warning")
            .arg("-fflags")
            .arg("nobuffer")
            .arg("-flags")
            .arg("low_delay")
            .arg("-i")
            .arg(&input_url)
            .arg("-map")
            .arg("0:v:0")
            .arg("-an")
            .arg("-vf")
            .arg("scale=-2:720")
            .arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("veryfast")
            .arg("-tune")
            .arg("zerolatency")
            .arg("-pix_fmt")
            .arg("yuv420p")
            .arg("-g")
            .arg("50")
            .arg("-f")
            .arg("rtsp")
            .arg("-rtsp_transport")
            .arg("tcp")
            .arg(&rtsp_push_url)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .stdin(Stdio::null());

        let mut hls_child = match hls_cmd.spawn() {
            Ok(child) => Some(child),
            Err(err) => {
                warn!(stream_id, error = %err, "failed to start hls fallback process");
                None
            }
        };
        let hls_pid = hls_child.as_ref().and_then(|child| child.id());
        if let Some(child) = hls_child.as_mut() {
            if let Some(stderr) = child.stderr.take() {
                let stream_for_task = stream_id.clone();
                tokio::spawn(async move {
                    let mut reader = BufReader::new(stderr);
                    let mut buf = vec![0_u8; 4096];
                    while let Ok(n) = reader.read(&mut buf).await {
                        if n == 0 {
                            break;
                        }
                        let msg = String::from_utf8_lossy(&buf[..n]);
                        warn!(stream_id = stream_for_task, ffmpeg = %msg.trim(), "hls fallback stderr");
                    }
                });
            }
        }

        Ok(Self {
            ws_child: Mutex::new(Some(ws_child)),
            hls_child: Mutex::new(hls_child),
            ws_pid,
            hls_pid,
        })
    }

    pub fn pid(&self) -> Option<u32> {
        self.ws_pid.or(self.hls_pid)
    }

    pub async fn is_running(&self) -> bool {
        if self.ws_pid.is_none() && self.hls_pid.is_none() {
            return true;
        }

        let mut ws_child = self.ws_child.lock().await;
        match ws_child.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(Some(_status)) => {
                    *ws_child = None;
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            },
            None => false,
        }
    }

    pub async fn stop(&self) {
        if let Some(mut child) = self.ws_child.lock().await.take() {
            let _ = child.kill().await;
        }
        if let Some(mut child) = self.hls_child.lock().await.take() {
            let _ = child.kill().await;
        }
    }
}
