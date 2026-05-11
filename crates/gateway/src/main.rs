mod api;
mod config;
mod errors;
mod fanout;
mod hls_fallback;
mod metrics;
mod stream_manager;
mod upstream;

use api::{router, AppState};
use config::Config;
use hls_fallback::HlsFallback;
use std::{net::SocketAddr, sync::Arc};
use stream_manager::StreamManager;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "streamflow_gateway=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    let hls = HlsFallback::new(&config);
    let manager = Arc::new(StreamManager::new(config.clone(), hls.clone()));
    tokio::spawn(manager.clone().run_housekeeping());
    let state = AppState { manager, hls };
    let app = router(state);
    let addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!(%addr, "streamflow-gateway listening");
    axum::serve(listener, app).await?;
    Ok(())
}
