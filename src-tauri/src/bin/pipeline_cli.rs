use anyhow::{anyhow, Result};
use learningedge_lib::{
    db, kg,
    models::{PresetConfig, StageProviderKind, ThinkingLevel, TranscriptFixture},
    pipeline::{
        orchestrator::{create_pipeline_run, load_run_artifacts_bundle},
        render::ffprobe_media_json,
    },
    sidecars,
    worker::{enqueue_pipeline_job, spawn_pipeline_worker, wait_for_run_terminal, PipelineJob},
};
use std::path::PathBuf;
use std::time::Duration;

fn parse_provider(raw: &str) -> Result<StageProviderKind> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "local_offline" | "local" => Ok(StageProviderKind::LocalOffline),
        "ollama" => Ok(StageProviderKind::Ollama),
        "codex_cli" | "codex" => Ok(StageProviderKind::CodexCli),
        "antigravity" | "agy" => Ok(StageProviderKind::Antigravity),
        "open_ai" | "openai" => Ok(StageProviderKind::OpenAi),
        "gemini" => Ok(StageProviderKind::Gemini),
        other => Err(anyhow!("Unknown provider: {other}")),
    }
}

fn parse_thinking(raw: &str) -> Result<ThinkingLevel> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "off" => Ok(ThinkingLevel::Off),
        "low" => Ok(ThinkingLevel::Low),
        "medium" => Ok(ThinkingLevel::Medium),
        "high" => Ok(ThinkingLevel::High),
        "xhigh" => Ok(ThinkingLevel::Xhigh),
        other => Err(anyhow!("Unknown thinking level: {other}")),
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let args: Vec<String> = std::env::args().collect();
    let tools = sidecars::resolve_tools(None)?;
    let default_fixture = tools.project_root.join("fixtures").join("cpu_caching_lecture.json");
    let mut fixture = default_fixture.clone();
    let mut slides = None;
    let mut out_root = tools.project_root.join("artifacts").join("cli-run");
    let mut provider_arg: Option<StageProviderKind> = None;
    let mut model_arg: Option<String> = None;
    let mut thinking_arg: Option<ThinkingLevel> = None;
    let mut voice_arg: Option<String> = None;
    let mut theme_arg: Option<String> = None;
    let mut resume_run_id: Option<String> = None;
    let mut timeout_secs: u64 = 360;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--fixture" if i + 1 < args.len() => {
                fixture = PathBuf::from(&args[i + 1]);
                i += 2;
            }
            "--slides" if i + 1 < args.len() => {
                slides = Some(PathBuf::from(&args[i + 1]));
                i += 2;
            }
            "--out" if i + 1 < args.len() => {
                out_root = PathBuf::from(&args[i + 1]);
                i += 2;
            }
            "--provider" if i + 1 < args.len() => {
                provider_arg = Some(parse_provider(&args[i + 1])?);
                i += 2;
            }
            "--model" if i + 1 < args.len() => {
                model_arg = Some(args[i + 1].clone());
                i += 2;
            }
            "--thinking" if i + 1 < args.len() => {
                thinking_arg = Some(parse_thinking(&args[i + 1])?);
                i += 2;
            }
            "--voice" if i + 1 < args.len() => {
                voice_arg = Some(args[i + 1].clone());
                i += 2;
            }
            "--theme" if i + 1 < args.len() => {
                theme_arg = Some(args[i + 1].clone());
                i += 2;
            }
            "--resume-run" if i + 1 < args.len() => {
                resume_run_id = Some(args[i + 1].clone());
                i += 2;
            }
            "--timeout" if i + 1 < args.len() => {
                timeout_secs = args[i + 1].parse()?;
                i += 2;
            }
            other => {
                return Err(anyhow!("Unknown CLI argument: {other}"));
            }
        }
    }

    if out_root.is_relative() {
        out_root = std::env::current_dir()?.join(out_root);
    }

    if fixture == default_fixture && slides.is_none() {
        slides = Some(tools.project_root.join("fixtures").join("cpu_caching_slides.json"));
    }
    let source: TranscriptFixture = serde_json::from_slice(&tokio::fs::read(&fixture).await?)?;
    tokio::fs::create_dir_all(&out_root).await?;
    let db_path = out_root.join("learningedge.db");
    let pool = db::init_db(&db_path).await?;
    let worker_handle = spawn_pipeline_worker(pool.clone(), tools.clone());

    let mut preset = PresetConfig::default();
    if let Some(provider) = provider_arg {
        let model = model_arg.unwrap_or_else(|| "gemini-3.8-flash".to_string());
        let thinking = thinking_arg.unwrap_or(ThinkingLevel::High);
        preset.offline_only = matches!(
            provider,
            StageProviderKind::LocalOffline | StageProviderKind::Ollama
        );
        for stage in [
            &mut preset.notes_stage,
            &mut preset.verify_stage,
            &mut preset.scene_plan_stage,
            &mut preset.coverage_stage,
            &mut preset.dreaming_stage,
        ] {
            stage.provider = provider.clone();
            stage.model = model.clone();
            stage.thinking = thinking.clone();
        }
    }
    if let Some(voice) = voice_arg {
        preset.narration_voice = voice;
    }
    if let Some(theme) = theme_arg {
        preset.video_theme = theme;
    }

    let run_dir = out_root.join("latest");
    let run_id = if let Some(existing_id) = resume_run_id {
        db::update_run_status(&pool, &existing_id, "queued", None, None, None, None).await?;
        existing_id
    } else {
        create_pipeline_run(&pool, &source.lecture_id, &preset, &run_dir, None).await?
    };

    enqueue_pipeline_job(
        &pool,
        PipelineJob {
            run_id: run_id.clone(),
            transcript_path: fixture.to_string_lossy().to_string(),
            slides_path: slides.as_ref().map(|p| p.to_string_lossy().to_string()),
        },
    )
    .await?;

    let final_rec = wait_for_run_terminal(&pool, &run_id, Duration::from_secs(timeout_secs)).await?;
    let bundle = load_run_artifacts_bundle(&pool, &run_id).await?;

    if let Some(ref notes) = bundle.verified_notes {
        kg::populate_kg_from_run(&pool, notes, bundle.video_manifest.as_ref()).await?;
        let _ = kg::run_dreaming(&pool).await?;
    }

    println!("Run ID: {}", final_rec.id);
    println!("Status: {}", final_rec.status);
    if let Some(ref m) = bundle.benchmark_metrics {
        println!(
            "Total Duration: {} ms | Peak Working Set: {:.2} MB | Reused Audio: {} | Reused Clips: {}",
            m.total_duration_ms,
            m.peak_working_set_bytes as f64 / (1024.0 * 1024.0),
            m.reused_audio_count,
            m.reused_clip_count
        );
        for st in &m.stages {
            println!("  - Stage {:22}: {:5} ms (reused={})", st.stage, st.duration_ms, st.reused);
        }
    }

    if let Some(ref manifest) = bundle.video_manifest {
        let probe = ffprobe_media_json(&tools, &PathBuf::from(&manifest.video_path))?;
        let duration_s = probe["format"]["duration"].as_str().unwrap_or("?");
        println!(
            "Video: {} | Captions: {} | Manifest Duration: {} ms | ffprobe duration: {} s",
            manifest.video_path, manifest.captions_path, manifest.total_duration_ms, duration_s
        );
        println!("Traceable Required Note Points: {}", manifest.trace_index.len());
    }

    worker_handle.abort();
    Ok(())
}
