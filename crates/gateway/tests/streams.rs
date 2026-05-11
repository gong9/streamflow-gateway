use streamflow_gateway::{
    config::Config,
    hls_fallback::HlsFallback,
    stream_manager::{CreateStreamRequest, StreamManager},
};

fn test_manager() -> StreamManager {
    let config = Config {
        spawn_processes: false,
        max_upstreams: 2,
        cleanup_after_secs: 0,
        ..Default::default()
    };
    let hls = HlsFallback::new(&config);
    StreamManager::new(config, hls)
}

#[tokio::test]
async fn reuses_same_source_url() {
    let manager = test_manager();
    let first = manager
        .create_or_reuse(CreateStreamRequest {
            url: "rtsp://example.test/live/a".into(),
            mode: "auto".into(),
        })
        .await
        .unwrap();
    let second = manager
        .create_or_reuse(CreateStreamRequest {
            url: "rtsp://example.test/live/a".into(),
            mode: "auto".into(),
        })
        .await
        .unwrap();
    assert_eq!(first.stream_id, second.stream_id);
    assert!(!first.reused);
    assert!(second.reused);
}

#[tokio::test]
async fn isolates_different_source_urls() {
    let manager = test_manager();
    let first = manager
        .create_or_reuse(CreateStreamRequest {
            url: "rtsp://example.test/live/a".into(),
            mode: "auto".into(),
        })
        .await
        .unwrap();
    let second = manager
        .create_or_reuse(CreateStreamRequest {
            url: "rtsp://example.test/live/b".into(),
            mode: "auto".into(),
        })
        .await
        .unwrap();
    assert_ne!(first.stream_id, second.stream_id);
    assert_eq!(manager.list().await.len(), 2);
}

#[tokio::test]
async fn enforces_upstream_limit() {
    let manager = test_manager();
    manager
        .create_or_reuse(CreateStreamRequest {
            url: "rtsp://example.test/live/a".into(),
            mode: "auto".into(),
        })
        .await
        .unwrap();
    manager
        .create_or_reuse(CreateStreamRequest {
            url: "rtsp://example.test/live/b".into(),
            mode: "auto".into(),
        })
        .await
        .unwrap();
    let third = manager
        .create_or_reuse(CreateStreamRequest {
            url: "rtsp://example.test/live/c".into(),
            mode: "auto".into(),
        })
        .await;
    assert!(third.is_err());
}

#[tokio::test]
async fn delete_releases_stream() {
    let manager = test_manager();
    let first = manager
        .create_or_reuse(CreateStreamRequest {
            url: "rtsp://example.test/live/a".into(),
            mode: "auto".into(),
        })
        .await
        .unwrap();
    manager.release(&first.stream_id).await.unwrap();
    assert!(manager.status(&first.stream_id).await.is_ok());
    assert_eq!(manager.reap_idle_once().await, 1);
    assert!(manager.status(&first.stream_id).await.is_err());
}

#[tokio::test]
async fn enforces_viewer_limit() {
    let config = Config {
        spawn_processes: false,
        max_viewers: 1,
        ..Default::default()
    };
    let hls = HlsFallback::new(&config);
    let manager = std::sync::Arc::new(StreamManager::new(config, hls));

    let first = manager.try_acquire_viewer().unwrap();
    assert!(manager.try_acquire_viewer().is_err());
    assert_eq!(manager.metrics().viewer_count, 1);

    drop(first);
    assert_eq!(manager.metrics().viewer_count, 0);
}
