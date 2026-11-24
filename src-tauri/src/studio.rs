use serde_json::{json,Value};
use std::{path::PathBuf,process::Command};
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

