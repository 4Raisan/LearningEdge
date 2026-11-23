pub mod narration;
pub mod text;
pub mod transcription;

use std::future::Future;
use std::time::Duration;
use thiserror::Error;

use crate::models::{ModelCapabilities, StageProviderConfig, StageProviderKind, ThinkingLevel};

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("Offline policy violation: stage requested cloud provider '{0}' while offline-only mode is enabled")]
    OfflinePolicyViolation(String),

    #[error("Authentication or missing credential error for '{0}': {1}")]
    AuthError(String, String),

    #[error("Transient provider failure (status {status:?}): {message}")]
    Transient {
        status: Option<u16>,
        message: String,
    },

    #[error("Provider request failed: {0}")]
    Fatal(String),
}

impl ProviderError {
    pub fn is_retryable(&self) -> bool {
        matches!(self, ProviderError::Transient { .. })
    }
}

pub fn ensure_provider_allowed(
    offline_only: bool,
    cfg: &StageProviderConfig,
) -> Result<(), ProviderError> {
    if offline_only
        && matches!(
            cfg.provider,
            StageProviderKind::OpenAi | StageProviderKind::Gemini | StageProviderKind::CodexCli
        )
    {
        return Err(ProviderError::OfflinePolicyViolation(format!(
            "{:?}",
            cfg.provider
        )));
    }
    Ok(())
}

pub async fn retry_with_backoff<T, F, Fut>(
    max_attempts: usize,
    base_delay_ms: u64,
    mut op: F,
) -> Result<T, ProviderError>
where
    F: FnMut(usize) -> Fut,
    Fut: Future<Output = Result<T, ProviderError>>,
{
    let attempts = max_attempts.max(1);
    let mut last_err = None;
    for attempt in 1..=attempts {
        match op(attempt).await {
            Ok(v) => return Ok(v),
            Err(e) => {
                let retryable = e.is_retryable();
                last_err = Some(e);
                if !retryable || attempt == attempts {
                    break;
                }
                let delay = base_delay_ms.saturating_mul(1_u64 << (attempt - 1).min(5));
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
        }
    }
    Err(last_err.unwrap_or_else(|| ProviderError::Fatal("Unknown retry failure".to_string())))
}

pub fn known_model_capabilities() -> Vec<ModelCapabilities> {
    vec![
        ModelCapabilities {
            provider: StageProviderKind::LocalOffline,
            model: "local-deterministic-v1".to_string(),
            label: "Local Deterministic Pipeline (Offline)".to_string(),
            supports_thinking: false,
            allowed_thinking_levels: vec![ThinkingLevel::Off],
            requires_credential: false,
            local_only: true,
        },
        ModelCapabilities {
            provider: StageProviderKind::Ollama,
            model: "qwen3:8b".to_string(),
            label: "Ollama qwen3:8b (Loopback)".to_string(),
            supports_thinking: true,
            allowed_thinking_levels: vec![ThinkingLevel::Off, ThinkingLevel::Medium, ThinkingLevel::High],
            requires_credential: false,
            local_only: true,
        },
        ModelCapabilities {
            provider: StageProviderKind::Ollama,
            model: "llama3.2:3b".to_string(),
            label: "Ollama llama3.2:3b (Loopback)".to_string(),
            supports_thinking: false,
            allowed_thinking_levels: vec![ThinkingLevel::Off],
            requires_credential: false,
            local_only: true,
        },
        ModelCapabilities {
            provider: StageProviderKind::OpenAi,
            model: "gpt-4.1-mini".to_string(),
            label: "OpenAI GPT-4.1 mini".to_string(),
            supports_thinking: false,
            allowed_thinking_levels: vec![ThinkingLevel::Off],
            requires_credential: true,
            local_only: false,
        },
        ModelCapabilities {
            provider: StageProviderKind::OpenAi,
            model: "o4-mini".to_string(),
            label: "OpenAI o4-mini (Reasoning)".to_string(),
            supports_thinking: true,
            allowed_thinking_levels: vec![ThinkingLevel::Low, ThinkingLevel::Medium, ThinkingLevel::High],
            requires_credential: true,
            local_only: false,
        },
        ModelCapabilities {
            provider: StageProviderKind::Gemini,
            model: "gemini-2.5-flash".to_string(),
            label: "Gemini 2.5 Flash".to_string(),
            supports_thinking: true,
            allowed_thinking_levels: vec![
                ThinkingLevel::Off,
                ThinkingLevel::Low,
                ThinkingLevel::Medium,
                ThinkingLevel::High,
            ],
            requires_credential: true,
            local_only: false,
        },
    ]
}
