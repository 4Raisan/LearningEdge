use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::PathBuf;
use tauri::State;

use crate::credentials;
use crate::db;
use crate::kg;
use crate::models::{
    DreamSuggestion, KnowledgeGraphSnapshot, ModelCapabilities, PipelineRunRecord, PresetConfig,
    RunArtifactsBundle, ScenePlan, SourceSearchHit, StageProviderKind, TranscriptFixture,
    TranscriptSegment,
};
use crate::pipeline::orchestrator::{create_pipeline_run, load_run_artifacts_bundle};
use crate::providers::known_model_capabilities;
use crate::providers::narration::list_windows_voices;
use crate::sidecars::ToolPaths;
use crate::worker::{enqueue_pipeline_job, PipelineJob};

pub struct AppState {
    pub pool: SqlitePool,
    pub tools: ToolPaths,
    pub data_dir: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnqueueFixtureResponse {
    pub run_id: String,
    pub status: String,
}

#[tauri::command]
pub async fn run_lecture_text(
    state: State<'_, AppState>,
    lecture_text: String,
    use_codex: Option<bool>,
    settings: Option<crate::studio::LectureSettings>,
) -> Result<EnqueueFixtureResponse, String> {
    let run_id = enqueue_configured(&state.pool, &state.data_dir, &lecture_text, use_codex.unwrap_or(false), settings)
        .await
        .map_err(|e| e.to_string())?;
    Ok(EnqueueFixtureResponse { run_id, status: "queued".into() })
}

pub async fn enqueue_lecture_text(
    pool: &SqlitePool,
    data_dir: &std::path::Path,
    lecture_text: &str,
    use_codex: bool,
) -> anyhow::Result<String> {
    enqueue_configured(pool, data_dir, lecture_text, use_codex, None).await
}

pub async fn enqueue_configured(pool: &SqlitePool, data_dir: &std::path::Path, lecture_text: &str,
    use_codex: bool, settings: Option<crate::studio::LectureSettings>) -> anyhow::Result<String> {
    let text = lecture_text.trim();
    anyhow::ensure!(!text.is_empty(), "Enter some lecture text first.");
    let lecture_id = format!("lecture-{}", uuid::Uuid::new_v4());
    let output_dir = data_dir.join("runs").join(&lecture_id);
    tokio::fs::create_dir_all(&output_dir).await?;
    let mut offset = 0;
    let segments = text.lines().map(str::trim).filter(|line| !line.is_empty())
        .enumerate().map(|(index, line)| {
            let start_ms = offset;
            offset += line.split_whitespace().count() as u64 * 400;
            TranscriptSegment {
                id: format!("{lecture_id}-text-{}", index + 1),
                start_ms,
                end_ms: offset,
                speaker: None,
                topic_id: None,
                topic_title: None,
                text: line.into(),
            }
        }).collect();
    let transcript = TranscriptFixture {
        lecture_id: lecture_id.clone(),
        title: text.chars().take_while(|ch| *ch != '\n').take(80).collect(),
        course: None,
        segments,
    };
    let source = output_dir.join("lecture-text.json");
    tokio::fs::write(&source, serde_json::to_vec(&transcript)?).await?;
    let mut preset = PresetConfig::default();
    let mut concept_stage = preset.notes_stage.clone();
    concept_stage.provider = StageProviderKind::Ollama;
    concept_stage.model = "qwen3:4b".into();
    if use_codex {
        preset.id = "lecture-codex-cli".into();
        preset.name = "Codex subscription".into();
        preset.offline_only = false;
        concept_stage.provider = StageProviderKind::CodexCli;
        concept_stage.model = "codex-default".into();
        concept_stage.thinking = crate::models::ThinkingLevel::Low;
    }
    preset.notes_stage = concept_stage.clone();
    preset.verify_stage = concept_stage.clone();
    preset.coverage_stage = concept_stage;
    if let Some(settings) = settings {
        let notes = settings.notes.config().map_err(anyhow::Error::msg)?;
        let video = settings.video.config().map_err(anyhow::Error::msg)?;
        preset.offline_only = notes.provider == StageProviderKind::Ollama && video.provider == StageProviderKind::Ollama;
        preset.note_depth = settings.depth;
        preset.auto_graph = settings.auto_graph;
        preset.sfx_enabled = settings.sfx_enabled;
        if settings.portrait { std::mem::swap(&mut preset.width, &mut preset.height); }
        preset.video_theme = settings.video_theme;
        if !settings.voice.trim().is_empty() {
            preset.narration_voice = settings.voice.trim().to_string();
        }
        preset.verify_stage = notes.clone();
        preset.notes_stage = notes;
        preset.scene_plan_stage = video.clone();
        preset.coverage_stage = video;
    }
    let run_id = create_pipeline_run(pool, &lecture_id, &preset, &output_dir, None).await?;
    let job = PipelineJob {
        run_id: run_id.clone(),
        transcript_path: source.to_string_lossy().into_owned(),
        slides_path: None,
    };
    if let Err(error) = enqueue_pipeline_job(pool, job).await {
        let _ = db::update_run_status(pool, &run_id, "failed", None, None, Some(&error.to_string()), None).await;
        return Err(error);
    }
    Ok(run_id)
}

#[tauri::command]
pub async fn run_fixture_pipeline(
    state: State<'_, AppState>,
    preset_id: Option<String>,
) -> Result<EnqueueFixtureResponse, String> {
    let pid = preset_id.unwrap_or_else(|| "preset-local-default".to_string());
    let preset = db::get_preset(&state.pool, &pid)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let transcript_path = state
        .tools
        .project_root
        .join("fixtures")
        .join("cpu_caching_lecture.json");
    let slides_path = state
        .tools
        .project_root
        .join("fixtures")
        .join("cpu_caching_slides.json");

    let run_id_dir = format!("run-{}", uuid::Uuid::new_v4());
    let output_dir = state.data_dir.join("runs").join(&run_id_dir);

    let run_id = create_pipeline_run(
        &state.pool,
        "lec-cpu-caching-01",
        &preset,
        &output_dir,
        None,
    )
    .await
    .map_err(|e| e.to_string())?;

    enqueue_pipeline_job(
        &state.pool,
        PipelineJob {
            run_id: run_id.clone(),
            transcript_path: transcript_path.to_string_lossy().to_string(),
            slides_path: Some(slides_path.to_string_lossy().to_string()),
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(EnqueueFixtureResponse {
        run_id,
        status: "queued".to_string(),
    })
}

#[tauri::command]
pub async fn retry_run_with_scene_plan(
    state: State<'_, AppState>,
    run_id: String,
    scene_plan: ScenePlan,
) -> Result<EnqueueFixtureResponse, String> {
    let run = db::get_pipeline_run(&state.pool, &run_id).await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Pipeline run not found".to_string())?;
    let text_path = PathBuf::from(&run.output_dir).join("lecture-text.json");
    let is_text_run = text_path.is_file();
    let json = serde_json::to_string(&scene_plan).map_err(|e| e.to_string())?;
    db::set_run_scene_plan_override(&state.pool, &run_id, Some(&json), "queued")
        .await
        .map_err(|e| e.to_string())?;

    let transcript_path = state
        .tools
        .project_root
        .join("fixtures")
        .join("cpu_caching_lecture.json");
    let slides_path = state
        .tools
        .project_root
        .join("fixtures")
        .join("cpu_caching_slides.json");

    enqueue_pipeline_job(
        &state.pool,
        PipelineJob {
            run_id: run_id.clone(),
            transcript_path: if is_text_run { text_path } else { transcript_path }.to_string_lossy().into_owned(),
            slides_path: (!is_text_run).then(|| slides_path.to_string_lossy().into_owned()),
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(EnqueueFixtureResponse {
        run_id,
        status: "queued".to_string(),
    })
}

#[tauri::command]
pub async fn get_run_artifacts(
    state: State<'_, AppState>,
    run_id: String,
) -> Result<RunArtifactsBundle, String> {
    load_run_artifacts_bundle(&state.pool, &run_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_runs(state: State<'_, AppState>) -> Result<Vec<PipelineRunRecord>, String> {
    db::list_pipeline_runs(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_presets(state: State<'_, AppState>) -> Result<Vec<PresetConfig>, String> {
    db::list_presets(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_preset(
    state: State<'_, AppState>,
    preset: PresetConfig,
    is_default: bool,
) -> Result<(), String> {
    db::upsert_preset(&state.pool, &preset, is_default)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_windows_voices() -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(list_windows_voices)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_provider_capabilities() -> Result<Vec<ModelCapabilities>, String> {
    Ok(known_model_capabilities())
}

#[tauri::command]
pub async fn store_provider_secret(
    credential_ref: String,
    secret: String,
) -> Result<(), String> {
    credentials::store_secret(&credential_ref, &secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_provider_secret(credential_ref: String) -> Result<bool, String> {
    Ok(credentials::has_secret(&credential_ref))
}

#[tauri::command]
pub async fn search_sources_fts(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SourceSearchHit>, String> {
    db::search_source_segments_fts(&state.pool, &query, 20)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_knowledge_graph(
    state: State<'_, AppState>,
) -> Result<KnowledgeGraphSnapshot, String> {
    kg::get_knowledge_graph(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn merge_kg_concepts(
    state: State<'_, AppState>,
    keep_id: String,
    merge_id: String,
) -> Result<(), String> {
    kg::merge_duplicate_concepts(&state.pool, &keep_id, &merge_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_dreaming(state: State<'_, AppState>) -> Result<Vec<DreamSuggestion>, String> {
    kg::run_dreaming(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn review_dream_suggestion(
    state: State<'_, AppState>,
    suggestion_id: String,
    accept: bool,
) -> Result<(), String> {
    kg::review_dream_suggestion(&state.pool, &suggestion_id, accept)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn open_provider_usage(provider: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::{env, os::windows::process::CommandExt, path::PathBuf, process::Command};
        let mut command = match provider {
            "antigravity" => {
                let exe = env::var_os("LOCALAPPDATA").map(PathBuf::from)
                    .map(|dir| dir.join("agy/bin/agy.exe"))
                    .filter(|file| file.is_file())
                    .or_else(|| env::split_paths(&env::var_os("PATH")?)
                        .map(|dir| dir.join("agy.exe")).find(|file| file.is_absolute() && file.is_file()))
                    .ok_or("Install Antigravity CLI to view its usage.")?;
                let mut cmd = Command::new(exe);
                cmd.creation_flags(0x00000010); // CREATE_NEW_CONSOLE for the interactive CLI
                cmd
            }
            "codex" => {
                let mut cmd = Command::new(PathBuf::from(env::var_os("SystemRoot").ok_or("Missing Windows directory")?).join("explorer.exe"));
                cmd.arg("https://chatgpt.com/codex/settings/usage");
                cmd
            }
            _ => return Err("Unknown usage provider".into()),
        };
        command.spawn().map(|_| ()).map_err(|e| format!("Could not open {provider} usage: {e}"))
    }
    #[cfg(not(windows))]
    Err(format!("Opening {provider} usage requires the Windows desktop app."))
}

