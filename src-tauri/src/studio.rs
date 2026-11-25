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
            StageProviderKind::Ollama
                | StageProviderKind::CodexCli
                | StageProviderKind::Antigravity
                | StageProviderKind::OpenAi
                | StageProviderKind::Gemini
        ) || self.model.is_empty()
            || !self
                .model
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"-_.:/".contains(&c))
        {
            return Err("Select a connected desktop model.".into());
        }
        let endpoint = match self.provider {
            StageProviderKind::OpenAi => Some(hosted_endpoint(
                self.endpoint.as_deref().ok_or("Enter an API endpoint")?,
            )?),
            StageProviderKind::Gemini => Some(hosted_endpoint(
                self.endpoint
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or("https://generativelanguage.googleapis.com/v1beta"),
            )?),
            _ => None,
        };
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
fn default_voice() -> String { "mixed".to_string() }

#[derive(Deserialize)]
pub struct LectureSettings {
    #[serde(default)] pub portrait: bool,
    #[serde(default)] pub video_theme: String,
    #[serde(default = "default_graph")]
    pub auto_graph: bool,
    #[serde(default = "default_voice")]
    pub voice: String,
    pub notes: Choice,
    pub video: Choice,
    pub depth: NoteDepth,
}

#[cfg(test)]
mod choice_tests {
    use super::*;

    #[test]
    fn choice_config_accepts_antigravity_and_gemini() {
        let agy = Choice {
            provider: StageProviderKind::Antigravity,
            model: "gemini-4-hydrogen".into(),
            thinking: ThinkingLevel::Xhigh,
            endpoint: None,
        };
        let cfg = agy.config().expect("antigravity config should succeed");
        assert_eq!(cfg.provider, StageProviderKind::Antigravity);
        assert_eq!(cfg.model, "gemini-4-hydrogen");
        assert_eq!(cfg.thinking, ThinkingLevel::Xhigh);
        assert!(cfg.credential_ref.is_none());

        let gem = Choice {
            provider: StageProviderKind::Gemini,
            model: "gemini-2.5-flash".into(),
            thinking: ThinkingLevel::Medium,
            endpoint: None,
        };
        let gcfg = gem.config().expect("gemini config should succeed");
        assert_eq!(gcfg.provider, StageProviderKind::Gemini);
        assert!(gcfg.base_url.is_some());
    }
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

#[tauri::command]
pub async fn graph_chat(
    state: State<'_, AppState>,
    choice: Choice,
    concept_id: String,
    question: String,
    history: Vec<String>,
) -> Result<String, String> {
    let graph = crate::kg::get_knowledge_graph(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    let node = graph
        .concepts
        .iter()
        .find(|c| c.id == concept_id)
        .ok_or("Select a saved concept.")?;
    let edges: Vec<_> = graph
        .edges
        .iter()
        .filter(|e| e.from_concept_id == node.id || e.to_concept_id == node.id)
        .collect();
    let neighbors: Vec<_> = graph
        .concepts
        .iter()
        .filter(|c| {
            edges
                .iter()
                .any(|e| e.from_concept_id == c.id || e.to_concept_id == c.id)
        })
        .collect();
    let reply = ConceptTextProvider::new(choice.config()?).chat_json(
        "Answer the learner about the selected concept using the supplied graph evidence. Cite the relevant concept names. Identify gaps in the evidence. Return JSON with one string field answer.",
        &json!({"concept":node,"relationships":edges,"related":neighbors,"conversation":history,"question":question}).to_string()
    ).await.map_err(|e|e.to_string())?;
    reply["answer"]
        .as_str()
        .map(str::to_owned)
        .ok_or("Model returned no answer.".into())
}
