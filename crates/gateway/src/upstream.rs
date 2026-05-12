use crate::{config::Config, fanout::FanoutHub, hls_fallback::HlsFallback};
use anyhow::{Context, Result};
use bytes::Bytes;
use serde::Serialize;
use std::{fs, process::Stdio, sync::Arc};
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

        let (ws_child, ws_pid) = if config.ws_upstream {
            let mut ws_cmd = Command::new("ffmpeg");
            add_common_input_args(&mut ws_cmd, &input_url);
            ws_cmd
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

            let mut child = ws_cmd.spawn().context("spawn websocket ffmpeg")?;
            let pid = child.id();
            info!(stream_id, ?pid, "started websocket upstream");

            if let Some(stdout) = child.stdout.take() {
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
                        warn!(stream_id = stream_for_task, ffmpeg = %msg.trim(), "websocket upstream stderr");
                    }
                });
            }

            (Some(child), pid)
        } else {
            (None, None)
        };

        let stream_dir = hls.stream_dir(&stream_id);
        let _ = fs::remove_dir_all(&stream_dir);
        fs::create_dir_all(&stream_dir).context("create hls stream directory")?;
        let manifest_path = hls.manifest_path(&stream_id);
        let segment_pattern = hls.segment_pattern(&stream_id);
        let mut hls_cmd = Command::new("ffmpeg");
        add_common_input_args(&mut hls_cmd, &input_url);
        hls_cmd
            .arg("-map")
            .arg("0:v:0")
            .arg("-an")
            .arg("-vf")
            .arg("scale=-2:720:in_range=pc:out_range=tv,format=yuv420p")
            .arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("veryfast")
            .arg("-tune")
            .arg("zerolatency")
            .arg("-pix_fmt")
            .arg("yuv420p")
            .arg("-profile:v")
            .arg("main")
            .arg("-g")
            .arg("25")
            .arg("-keyint_min")
            .arg("25")
            .arg("-sc_threshold")
            .arg("0")
            .arg("-force_key_frames")
            .arg("expr:gte(t,n_forced*1)")
            .arg("-f")
            .arg("hls")
            .arg("-hls_time")
            .arg("1")
            .arg("-hls_list_size")
            .arg("6")
            .arg("-hls_flags")
            .arg("delete_segments+omit_endlist+independent_segments")
            .arg("-hls_segment_type")
            .arg("mpegts")
            .arg("-hls_segment_filename")
            .arg(segment_pattern)
            .arg(manifest_path)
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
            ws_child: Mutex::new(ws_child),
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
        let ws_running = child_is_running(&mut ws_child);
        drop(ws_child);

        let mut hls_child = self.hls_child.lock().await;
        let hls_running = child_is_running(&mut hls_child);

        if self.ws_pid.is_some() && self.hls_pid.is_some() {
            ws_running || hls_running
        } else {
            ws_running || hls_running
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

fn add_common_input_args(cmd: &mut Command, input_url: &str) {
    cmd.arg("-hide_banner").arg("-loglevel").arg("warning");

    if input_url.starts_with("http://") || input_url.starts_with("https://") {
        cmd.arg("-reconnect")
            .arg("1")
            .arg("-reconnect_streamed")
            .arg("1")
            .arg("-reconnect_on_network_error")
            .arg("1")
            .arg("-reconnect_on_http_error")
            .arg("4xx,5xx")
            .arg("-reconnect_delay_max")
            .arg("2");
    }

    if input_url.starts_with("rtsp://") {
        cmd.arg("-rtsp_transport").arg("tcp");
    }

    cmd.arg("-analyzeduration")
        .arg("10000000")
        .arg("-probesize")
        .arg("10000000")
        .arg("-fflags")
        .arg("+genpts+discardcorrupt")
        .arg("-err_detect")
        .arg("ignore_err")
        .arg("-i")
        .arg(input_url);
}

fn child_is_running(slot: &mut Option<Child>) -> bool {
    match slot.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(Some(_status)) => {
                *slot = None;
                false
            }
            Ok(None) => true,
            Err(_) => false,
        },
        None => false,
    }
}
