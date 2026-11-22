use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::PathBuf;
use tauri::State;

use crate::credentials;
use crate::db;
use crate::kg;
use crate::models::{
    DreamSuggestion, KnowledgeGraphSnapshot, ModelCapabilities, PipelineRunRecord, PresetConfig,
    RunArtifactsBundle, ScenePlan, SourceSearchHit,
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
