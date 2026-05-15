use crate::{config::Config, fanout::FanoutHub, hls_fallback::HlsFallback};
use anyhow::{Context, Result};
use bytes::Bytes;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{fs, process::Stdio, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, BufReader},
    process::{Child, Command},
    sync::{Mutex, RwLock},
    time,
};
use tracing::{error, info, warn};
use url::Url;

#[derive(Debug, Serialize)]
struct ControlEvent<'a> {
    event: &'a str,
    codec: &'a str,
    container: &'a str,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct FfmpegProgressSnapshot {
    pub fps: Option<f64>,
    pub bitrate_kbps: Option<f64>,
    pub speed: Option<f64>,
    pub frame: Option<u64>,
    pub total_size_bytes: Option<u64>,
    pub out_time_ms: Option<u64>,
    pub dup_frames: Option<u64>,
    pub drop_frames: Option<u64>,
    pub last_progress_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Default)]
pub struct FfmpegProgress {
    snapshot: RwLock<FfmpegProgressSnapshot>,
}

impl FfmpegProgress {
    pub async fn snapshot(&self) -> FfmpegProgressSnapshot {
        self.snapshot.read().await.clone()
    }

    async fn apply_line(&self, line: &str) -> bool {
        let Some((key, value)) = line.split_once('=') else {
            return false;
        };

        let mut snapshot = self.snapshot.write().await;
        let mut handled = true;
        match key {
            "fps" => snapshot.fps = parse_f64(value),
            "bitrate" => snapshot.bitrate_kbps = parse_bitrate_kbps(value),
            "speed" => snapshot.speed = parse_speed(value),
            "frame" => snapshot.frame = value.parse().ok(),
            "total_size" => snapshot.total_size_bytes = value.parse().ok(),
            "out_time_ms" | "out_time_us" => {
                snapshot.out_time_ms = value.parse::<u64>().ok().map(|value| value / 1000)
            }
            "dup_frames" => snapshot.dup_frames = value.parse().ok(),
            "drop_frames" => snapshot.drop_frames = value.parse().ok(),
            "progress" => {}
            _ => handled = false,
        }

        if handled {
            snapshot.last_progress_at = Some(Utc::now());
        }
        handled
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HlsStrategy {
    Copy,
    Transcode,
}

impl HlsStrategy {
    pub fn as_str(self) -> &'static str {
        match self {
            HlsStrategy::Copy => "copy",
            HlsStrategy::Transcode => "transcode",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SourceProbe {
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub strategy: HlsStrategy,
    pub reason: String,
}

impl SourceProbe {
    fn fallback(reason: impl Into<String>) -> Self {
        Self {
            video_codec: None,
            audio_codec: None,
            width: None,
            height: None,
            strategy: HlsStrategy::Transcode,
            reason: reason.into(),
        }
    }

    pub fn is_hevc(&self) -> bool {
        self.video_codec
            .as_deref()
            .map(normalize_codec_name)
            .is_some_and(|codec| codec == "hevc")
    }
}

#[derive(Debug)]
pub struct UpstreamSession {
    ws_child: Mutex<Option<Child>>,
    raw_child: Mutex<Option<Child>>,
    hls_child: Mutex<Option<Child>>,
    ws_pid: Option<u32>,
    raw_pid: Option<u32>,
    hls_pid: RwLock<Option<u32>>,
    probe: SourceProbe,
    raw_direct: bool,
    hls_enabled: RwLock<bool>,
}

impl UpstreamSession {
    pub async fn start(
        stream_id: String,
        input_url: String,
        config: Config,
        hls: HlsFallback,
        fanout: Arc<FanoutHub>,
        progress: Arc<FfmpegProgress>,
    ) -> Result<Self> {
        if !config.spawn_processes {
            fanout.send_control(&ControlEvent {
                event: "ready",
                codec: "h264",
                container: "mpegts",
            });
            return Ok(Self {
                ws_child: Mutex::new(None),
                raw_child: Mutex::new(None),
                hls_child: Mutex::new(None),
                ws_pid: None,
                raw_pid: None,
                hls_pid: RwLock::new(None),
                probe: SourceProbe {
                    video_codec: Some("h264".to_string()),
                    audio_codec: None,
                    width: None,
                    height: None,
                    strategy: HlsStrategy::Copy,
                    reason: "process spawning disabled".to_string(),
                },
                raw_direct: false,
                hls_enabled: RwLock::new(true),
            });
        }

        let probe = probe_source(&input_url).await;
        info!(
            stream_id,
            strategy = probe.strategy.as_str(),
            video_codec = probe.video_codec.as_deref().unwrap_or("unknown"),
            audio_codec = probe.audio_codec.as_deref().unwrap_or("none"),
            reason = %probe.reason,
            "selected hls strategy"
        );

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
                    watch_ffmpeg_stderr(stream_for_task, "websocket upstream", stderr, None).await;
                });
            }

            (Some(child), pid)
        } else {
            (None, None)
        };

        let browser_direct_http_flv = is_http_flv_source(&input_url);
        let raw_direct = config.h265_direct && probe.is_hevc();
        let (raw_child, raw_pid) = if raw_direct {
            info!(
                stream_id,
                browser_direct_http_flv, "raw h265 is served by on-demand /raw-flv; skip zlm push"
            );
            (None, None)
        } else {
            (None, None)
        };

        // H265 direct mode keeps the expensive H264 transcode off until the
        // browser proves it needs the compatibility path.
        let hls_enabled = !raw_direct;
        let (hls_child, hls_pid) = if hls_enabled {
            start_hls_process(
                &stream_id,
                &input_url,
                &hls,
                probe.strategy,
                progress.clone(),
            )
            .await
        } else {
            (None, None)
        };

        Ok(Self {
            ws_child: Mutex::new(ws_child),
            raw_child: Mutex::new(raw_child),
            hls_child: Mutex::new(hls_child),
            ws_pid,
            raw_pid,
            hls_pid: RwLock::new(hls_pid),
            probe,
            raw_direct,
            hls_enabled: RwLock::new(hls_enabled),
        })
    }

    pub async fn pid(&self) -> Option<u32> {
        self.ws_pid.or(self.raw_pid).or(*self.hls_pid.read().await)
    }

    pub fn probe(&self) -> &SourceProbe {
        &self.probe
    }

    pub fn raw_direct(&self) -> bool {
        self.raw_direct
    }

    pub async fn hls_enabled(&self) -> bool {
        *self.hls_enabled.read().await
    }

    pub async fn raw_running(&self) -> bool {
        if self.raw_pid.is_none() {
            return false;
        }
        let mut raw_child = self.raw_child.lock().await;
        child_is_running(&mut raw_child)
    }

    pub async fn hls_running(&self) -> bool {
        if self.hls_pid.read().await.is_none() {
            return false;
        }
        let mut hls_child = self.hls_child.lock().await;
        let running = child_is_running(&mut hls_child);
        if !running {
            *self.hls_pid.write().await = None;
            *self.hls_enabled.write().await = false;
        }
        running
    }

    pub async fn hls_transcoding(&self) -> bool {
        self.probe.strategy == HlsStrategy::Transcode
            && *self.hls_enabled.read().await
            && self.hls_running().await
    }

    pub fn hls_transcode_profile_allocated(&self) -> bool {
        self.probe.strategy == HlsStrategy::Transcode
            && self.hls_enabled.try_read().is_ok_and(|enabled| *enabled)
            && self.hls_pid.try_read().is_ok_and(|pid| pid.is_some())
    }

    pub async fn ensure_hls_fallback(
        &self,
        stream_id: &str,
        input_url: &str,
        hls: &HlsFallback,
        progress: Arc<FfmpegProgress>,
    ) -> Result<()> {
        if self.hls_running().await {
            *self.hls_enabled.write().await = true;
            return Ok(());
        }

        let (child, pid) =
            start_hls_process(stream_id, input_url, hls, HlsStrategy::Transcode, progress).await;
        if let Some(child) = child {
            *self.hls_child.lock().await = Some(child);
            *self.hls_pid.write().await = pid;
            *self.hls_enabled.write().await = true;
            Ok(())
        } else {
            anyhow::bail!("failed to start h264 fallback process")
        }
    }

    pub async fn is_running(&self) -> bool {
        if self.ws_pid.is_none() && self.raw_pid.is_none() && self.hls_pid.read().await.is_none() {
            return true;
        }

        let mut ws_child = self.ws_child.lock().await;
        let ws_running = child_is_running(&mut ws_child);
        drop(ws_child);

        let mut hls_child = self.hls_child.lock().await;
        let hls_running = child_is_running(&mut hls_child);
        drop(hls_child);

        let mut raw_child = self.raw_child.lock().await;
        let raw_running = child_is_running(&mut raw_child);

        ws_running || raw_running || hls_running
    }

    pub async fn stop(&self) {
        if let Some(mut child) = self.ws_child.lock().await.take() {
            let _ = child.kill().await;
        }
        if let Some(mut child) = self.raw_child.lock().await.take() {
            let _ = child.kill().await;
        }
        if let Some(mut child) = self.hls_child.lock().await.take() {
            let _ = child.kill().await;
        }
    }
}

async fn start_hls_process(
    stream_id: &str,
    input_url: &str,
    hls: &HlsFallback,
    strategy: HlsStrategy,
    progress: Arc<FfmpegProgress>,
) -> (Option<Child>, Option<u32>) {
    let stream_dir = hls.stream_dir(stream_id);
    let _ = fs::remove_dir_all(&stream_dir);
    if let Err(err) = fs::create_dir_all(&stream_dir) {
        warn!(stream_id, error = %err, "failed to create hls stream directory");
        return (None, None);
    }

    let manifest_path = hls.manifest_path(stream_id);
    let segment_pattern = hls.segment_pattern(stream_id);
    let mut cmd = Command::new("ffmpeg");
    add_common_input_args(&mut cmd, input_url);
    cmd.arg("-nostats")
        .arg("-stats_period")
        .arg("1")
        .arg("-progress")
        .arg("pipe:2")
        .arg("-map")
        .arg("0:v:0")
        .arg("-an");

    add_hls_strategy_args(&mut cmd, strategy, hls.transcode_height());

    cmd.arg("-f")
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

    match cmd.spawn() {
        Ok(mut child) => {
            let pid = child.id();
            info!(
                stream_id,
                ?pid,
                strategy = strategy.as_str(),
                "started hls process"
            );
            if let Some(stderr) = child.stderr.take() {
                let stream_for_task = stream_id.to_string();
                let progress_for_task = progress.clone();
                tokio::spawn(async move {
                    watch_ffmpeg_stderr(
                        stream_for_task,
                        "hls fallback",
                        stderr,
                        Some(progress_for_task),
                    )
                    .await;
                });
            }
            (Some(child), pid)
        }
        Err(err) => {
            warn!(stream_id, error = %err, "failed to start hls fallback process");
            (None, None)
        }
    }
}

fn add_hls_strategy_args(cmd: &mut Command, strategy: HlsStrategy, transcode_height: u32) {
    match strategy {
        HlsStrategy::Copy => {
            cmd.arg("-c:v").arg("copy");
        }
        HlsStrategy::Transcode => {
            let height = transcode_height.clamp(360, 1080);
            cmd.arg("-vf")
                .arg(format!(
                    "scale=-2:{height}:in_range=pc:out_range=tv,format=yuv420p"
                ))
                .arg("-c:v")
                .arg("libx264")
                .arg("-preset")
                .arg("ultrafast")
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
                .arg("expr:gte(t,n_forced*1)");
        }
    }
}

async fn probe_source(input_url: &str) -> SourceProbe {
    let output = time::timeout(Duration::from_secs(5), run_ffprobe(input_url)).await;
    match output {
        Ok(Ok(probe)) => choose_hls_strategy(probe),
        Ok(Err(err)) => {
            warn!(input_url, error = %err, "ffprobe failed, using transcode fallback");
            SourceProbe::fallback(format!("ffprobe failed: {err}"))
        }
        Err(_) => {
            warn!(input_url, "ffprobe timed out, using transcode fallback");
            SourceProbe::fallback("ffprobe timed out")
        }
    }
}

async fn run_ffprobe(input_url: &str) -> Result<FfprobeOutput> {
    let mut cmd = Command::new("ffprobe");
    add_common_probe_args(&mut cmd, input_url);
    cmd.kill_on_drop(true);
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    let output = cmd.output().await.context("run ffprobe")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("ffprobe exited with {}: {}", output.status, stderr.trim());
    }

    serde_json::from_slice(&output.stdout).context("parse ffprobe json")
}

fn choose_hls_strategy(output: FfprobeOutput) -> SourceProbe {
    let video = output
        .streams
        .iter()
        .find(|stream| stream.codec_type.as_deref() == Some("video"));
    let audio = output
        .streams
        .iter()
        .find(|stream| stream.codec_type.as_deref() == Some("audio"));
    let video_codec = video.and_then(|stream| stream.codec_name.clone());
    let audio_codec = audio.and_then(|stream| stream.codec_name.clone());
    let normalized_video = video_codec.as_deref().map(normalize_codec_name);

    match normalized_video.as_deref() {
        Some("h264") => SourceProbe {
            video_codec,
            audio_codec,
            width: video.and_then(|stream| stream.width),
            height: video.and_then(|stream| stream.height),
            strategy: HlsStrategy::Copy,
            reason: "source video is H264, remux without transcoding".to_string(),
        },
        Some(codec) => SourceProbe {
            video_codec,
            audio_codec,
            width: video.and_then(|stream| stream.width),
            height: video.and_then(|stream| stream.height),
            strategy: HlsStrategy::Transcode,
            reason: format!("source video is {codec}, transcode to H264 for browser playback"),
        },
        None => SourceProbe {
            video_codec,
            audio_codec,
            width: video.and_then(|stream| stream.width),
            height: video.and_then(|stream| stream.height),
            strategy: HlsStrategy::Transcode,
            reason: "video codec not detected, use safe transcode fallback".to_string(),
        },
    }
}

fn normalize_codec_name(codec: &str) -> String {
    match codec.to_ascii_lowercase().as_str() {
        "avc" | "h264" => "h264".to_string(),
        "hevc" | "h265" => "hevc".to_string(),
        other => other.to_string(),
    }
}

fn add_common_probe_args(cmd: &mut Command, input_url: &str) {
    cmd.arg("-hide_banner").arg("-loglevel").arg("error");

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
        .arg("5000000")
        .arg("-probesize")
        .arg("5000000")
        .arg("-show_entries")
        .arg("stream=index,codec_type,codec_name,width,height")
        .arg("-of")
        .arg("json")
        .arg(input_url);
}

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    #[serde(default)]
    streams: Vec<FfprobeStream>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

async fn watch_ffmpeg_stderr<R>(
    stream_id: String,
    label: &'static str,
    stderr: R,
    progress: Option<Arc<FfmpegProgress>>,
) where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(progress) = progress.as_ref() {
            if progress.apply_line(trimmed).await {
                continue;
            }
        }
        warn!(stream_id, ffmpeg = %trimmed, "{label} stderr");
    }
}

fn parse_f64(value: &str) -> Option<f64> {
    let parsed = value.trim().parse::<f64>().ok()?;
    parsed.is_finite().then_some(parsed)
}

fn parse_speed(value: &str) -> Option<f64> {
    parse_f64(value.trim().trim_end_matches('x'))
}

fn parse_bitrate_kbps(value: &str) -> Option<f64> {
    let value = value.trim();
    if value == "N/A" {
        return None;
    }

    let number = value
        .trim_end_matches("kbits/s")
        .trim_end_matches("Kbits/s")
        .trim();
    parse_f64(number)
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

fn is_http_flv_source(input_url: &str) -> bool {
    Url::parse(input_url).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.path().to_ascii_lowercase().ends_with(".flv")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe_with_video(codec_name: &str) -> FfprobeOutput {
        FfprobeOutput {
            streams: vec![FfprobeStream {
                codec_type: Some("video".to_string()),
                codec_name: Some(codec_name.to_string()),
                width: Some(1920),
                height: Some(1080),
            }],
        }
    }

    #[test]
    fn h264_sources_use_copy_strategy() {
        let probe = choose_hls_strategy(probe_with_video("h264"));

        assert_eq!(probe.strategy, HlsStrategy::Copy);
        assert_eq!(probe.video_codec.as_deref(), Some("h264"));
    }

    #[test]
    fn hevc_sources_use_transcode_strategy() {
        let probe = choose_hls_strategy(probe_with_video("hevc"));

        assert_eq!(probe.strategy, HlsStrategy::Transcode);
        assert_eq!(probe.video_codec.as_deref(), Some("hevc"));
    }

    #[test]
    fn unknown_sources_use_transcode_strategy() {
        let probe = choose_hls_strategy(FfprobeOutput { streams: vec![] });

        assert_eq!(probe.strategy, HlsStrategy::Transcode);
        assert!(probe.video_codec.is_none());
    }
}
