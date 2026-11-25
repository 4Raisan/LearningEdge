use anyhow::{anyhow, ensure, Context, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{path::Path, time::Duration};

use super::narration::{concat_wav_files, parse_wav_metadata, NarrationProvider};
use crate::models::{SceneAudioResult, SentenceCue, StageProviderConfig, StageProviderKind};

pub struct ModelAudio {
    config: StageProviderConfig,
    url: String,
    local: bool,
    client: reqwest::Client,
}

impl ModelAudio {
    pub fn new(config: &StageProviderConfig, offline: bool) -> Result<Self> {
        ensure!(config.provider == StageProviderKind::OpenAi,
            "The {} connection for {} does not expose native audio in LearningEdge. Select an audio-output video model on an OpenAI-compatible endpoint.", serde_json::to_value(&config.provider)?, config.model);
        let base = config
            .base_url
            .as_deref()
            .unwrap_or("https://api.openai.com/v1");
        let url = reqwest::Url::parse(base)?;
        let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        ensure!(
            !offline || local,
            "Offline runs require a loopback model endpoint"
        );
        ensure!(
            url.scheme() == "https" || (local && url.scheme() == "http"),
            "Invalid model audio endpoint"
        );
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self {
            config: config.clone(),
            url: format!("{}/chat/completions", base.trim_end_matches('/')),
            local,
            client,
        })
    }

    async fn sentence(&self, text: &str) -> Result<Vec<u8>> {
        let mut req=self.client.post(&self.url).json(&json!({
            "model":self.config.model,"modalities":["text","audio"],"audio":{"voice":"alloy","format":"wav"},
            "messages":[{"role":"system","content":"Read the supplied sentence verbatim as an engaging lecturer. Use natural pauses and emphasis. Speak only the sentence."},{"role":"user","content":text}]
        }));
        let secret = self
            .config
            .credential_ref
            .as_deref()
            .map(crate::credentials::get_secret)
            .transpose();
        match secret {
            Ok(Some(key)) => req = req.bearer_auth(key),
            _ if self.local => {}
            _ => return Err(anyhow!("Missing credential for the selected video model")),
        }
        let response =
            req.send().await?.error_for_status().with_context(|| {
                format!("{} rejected the native audio request", self.config.model)
            })?;
        let body: Value = response.json().await?;
        let audio = &body["choices"][0]["message"]["audio"];
        let transcript = audio["transcript"]
            .as_str()
            .context("Model audio response has no transcript")?;
        let words = |s: &str| {
            s.split_whitespace()
                .map(|w| {
                    w.trim_matches(['.', ',', '!', '?', ':', ';', '"'])
                        .to_lowercase()
                })
                .filter(|w| !w.is_empty())
                .collect::<Vec<_>>()
        };
        ensure!(
            words(transcript) == words(text),
            "Returned audio transcript differs from the approved narration"
        );
        let bytes = STANDARD.decode(
            audio["data"]
                .as_str()
                .context("The selected model returned no native audio")?,
        )?;
        let meta = parse_wav_metadata(&bytes)?;
        ensure!(
            meta.duration_ms > 0 && meta.bits_per_sample == 16 && meta.channels > 0,
            "Expected nonempty 16-bit WAV audio"
        );
        Ok(bytes)
    }
}

#[async_trait]
impl NarrationProvider for ModelAudio {
    async fn synthesize_scene(
        &self,
        scene_id: &str,
        sentences: &[String],
        out: &Path,
        _voice: &str,
        _rate: i32,
    ) -> Result<SceneAudioResult> {
        let temp = tempfile::tempdir_in(out.parent().context("Missing output directory")?)?;
        let mut parts = Vec::new();
        let mut cues = Vec::new();
        let mut elapsed = 0;
        for (sentence_index, text) in sentences.iter().enumerate() {
            let bytes = self.sentence(text).await?;
            let end_ms = elapsed + parse_wav_metadata(&bytes)?.duration_ms;
            let file = temp.path().join(format!("{sentence_index}.wav"));
            std::fs::write(&file, bytes)?;
            parts.push(file);
            cues.push(SentenceCue {
                sentence_index,
                text: text.clone(),
                start_ms: elapsed,
                end_ms,
            });
            elapsed = end_ms;
        }
        let duration_ms = concat_wav_files(&parts, out)?;
        if let Some(last) = cues.last_mut() {
            last.end_ms = duration_ms
        }
        Ok(SceneAudioResult {
            scene_id: scene_id.into(),
            wav_path: out.to_string_lossy().into(),
            duration_ms,
            cues,
            cached: false,
        })
    }
}
