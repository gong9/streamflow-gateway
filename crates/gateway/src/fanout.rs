use bytes::Bytes;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use tokio::sync::broadcast;

#[derive(Clone, Debug)]
pub enum StreamPacket {
    Control(String),
    Binary(Bytes),
}

#[derive(Debug)]
pub struct FanoutHub {
    tx: broadcast::Sender<StreamPacket>,
    viewer_count: AtomicUsize,
    dropped_frames: AtomicU64,
}

#[derive(Clone, Debug, Serialize)]
pub struct FanoutStats {
    pub viewer_count: usize,
    pub receiver_count: usize,
    pub dropped_frames: u64,
}

impl FanoutHub {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity.max(16));
        Self {
            tx,
            viewer_count: AtomicUsize::new(0),
            dropped_frames: AtomicU64::new(0),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<StreamPacket> {
        self.viewer_count.fetch_add(1, Ordering::Relaxed);
        self.tx.subscribe()
    }

    pub fn unsubscribe(&self) {
        self.viewer_count.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn send_control<T: Serialize>(&self, event: &T) {
        if let Ok(payload) = serde_json::to_string(event) {
            let _ = self.tx.send(StreamPacket::Control(payload));
        }
    }

    pub fn send_binary(&self, data: Bytes) {
        if self.tx.send(StreamPacket::Binary(data)).is_err() {
            self.dropped_frames.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub fn mark_dropped(&self, count: u64) {
        self.dropped_frames.fetch_add(count, Ordering::Relaxed);
    }

    pub fn stats(&self) -> FanoutStats {
        FanoutStats {
            viewer_count: self.viewer_count.load(Ordering::Relaxed),
            receiver_count: self.tx.receiver_count(),
            dropped_frames: self.dropped_frames.load(Ordering::Relaxed),
        }
    }
}
