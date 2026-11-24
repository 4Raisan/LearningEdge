#[path = "studio_connections.rs"]
mod connections;
pub use connections::*;
use connections::{hosted_endpoint,hosted_ref};
use crate::commands::AppState;
use crate::models::{NoteDepth, StageProviderConfig, StageProviderKind, ThinkingLevel};
use crate::providers::text::ConceptTextProvider;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{path::PathBuf, process::Command};
use tauri::State;

#[derive(Deserialize)]
pub struct Choice {
    pub provider: StageProviderKind,
    pub model: String,
    pub thinking: ThinkingLevel,
    pub endpoint: Option<String>,
}

impl Choice {
    pub fn config(self) -> Result<StageProviderConfig, String> {
        if !matches!(
            self.provider,
            StageProviderKind::Ollama | StageProviderKind::CodexCli | StageProviderKind::OpenAi
        ) || self.model.is_empty()
            || !self
                .model
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"-_.:/".contains(&c))
        {
            return Err("Select a connected desktop model.".into());
        }
        let endpoint = if self.provider == StageProviderKind::OpenAi {Some(hosted_endpoint(self.endpoint.as_deref().ok_or("Enter an API endpoint")?)?)} else {None};
        Ok(StageProviderConfig {
            provider: self.provider,
            model: self.model,
            thinking: self.thinking,
            credential_ref: endpoint.as_deref().map(hosted_ref),
            base_url: endpoint,
        })
    }
}

fn default_graph() -> bool { true }

#[derive(Deserialize)]
pub struct LectureSettings {
    #[serde(default)] pub portrait: bool,
    #[serde(default)] pub video_theme: String,
    #[serde(default = "default_graph")]
    pub auto_graph: bool,
    pub notes: Choice,
    pub video: Choice,
    pub depth: NoteDepth,
}

#[tauri::command]
pub async fn studio_models() -> Result<Value, String> {
    let home = PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default());
    let codex_home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));
    let cache: Value = serde_json::from_slice(
        &tokio::fs::read(codex_home.join("models_cache.json"))
            .await
            .unwrap_or_default(),
    )
    .unwrap_or(Value::Null);
    let signed_in = tokio::task::spawn_blocking(|| {
        let mut cmd=Command::new("cmd.exe");
        #[cfg(windows)] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
        cmd.args(["/d", "/c", "codex login status"])
            .output()
            .ok()
            .is_some_and(|o| {
                o.status.success()
                    && [o.stdout, o.stderr]
                        .concat()
                        .windows(7)
                        .any(|w| w.eq_ignore_ascii_case(b"ChatGPT"))
            })
    })
    .await
    .unwrap_or(false);
    let mut models = Vec::new();
    if signed_in {
        models.push(json!({"provider":"codex_cli","model":"codex-default","levels":["low","medium","high"]}));
        for m in cache["models"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|m| m["visibility"] == "list")
        {
            let levels: Vec<_> = m["supported_reasoning_levels"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|l| l["effort"].as_str())
                .filter(|l| matches!(*l, "low" | "medium" | "high"))
                .collect();
            if !levels.is_empty() {
                models.push(json!({"provider":"codex_cli","model":m["slug"],"levels":levels}));
            }
        }
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    if let Ok(response) = client.get("http://127.0.0.1:11434/api/tags").send().await {
        if let Ok(tags) = response.json::<Value>().await {
            for m in tags["models"].as_array().into_iter().flatten() {
                let mut levels = vec!["off"];
                if let Ok(r) = client
                    .post("http://127.0.0.1:11434/api/show")
                    .json(&json!({"model":m["name"]}))
                    .send()
                    .await
                {
                    if let Ok(info) = r.json::<Value>().await {
                        if info["capabilities"]
                            .as_array()
                            .is_some_and(|a| a.iter().any(|c| c == "thinking"))
                        {
                            levels.push("medium");
                        }
                    }
                }
                models.push(json!({"provider":"ollama","model":m["name"],"levels":levels}));
            }
        }
    }
    Ok(json!(models))
}

#[tauri::command]
pub fn studio_connect(provider: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd.exe");
        let line = match provider {
            "codex_cli" => "codex login",
            "ollama" => "ollama list",
            "antigravity" => return crate::commands::open_provider_usage("antigravity"),
            _ => return Err("Unknown provider".into()),
        };
        cmd.creation_flags(0x10)
            .args(["/d", "/k", line])
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    Err(format!("Open {provider} in your terminal to connect."))
}

