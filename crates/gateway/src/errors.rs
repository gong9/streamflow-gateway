use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("invalid stream url: {0}")]
    InvalidUrl(String),
    #[error("stream not found")]
    NotFound,
    #[error("upstream limit reached")]
    UpstreamLimit,
    #[error("viewer limit reached")]
    ViewerLimit,
    #[error("transcode limit reached")]
    TranscodeLimit,
    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    ok: bool,
    error: &'a str,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match self {
            AppError::InvalidUrl(_) => StatusCode::BAD_REQUEST,
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::UpstreamLimit | AppError::ViewerLimit | AppError::TranscodeLimit => {
                StatusCode::TOO_MANY_REQUESTS
            }
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let message = self.to_string();
        (
            status,
            Json(ErrorBody {
                ok: false,
                error: &message,
            }),
        )
            .into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(value: anyhow::Error) -> Self {
        Self::Internal(value.to_string())
    }
}
