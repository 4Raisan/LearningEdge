use anyhow::{anyhow, Result};
use learningedge_lib::{
    db, kg,
    models::PresetConfig,
    pipeline::{
        orchestrator::{create_pipeline_run, load_run_artifacts_bundle},
        render::ffprobe_media_json,
    },
    sidecars,
    worker::{enqueue_pipeline_job, spawn_pipeline_worker, wait_for_run_terminal, PipelineJob},
};
use std::path::PathBuf;
use std::time::Duration;

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
    let mut fixture = tools.project_root.join("fixtures").join("cpu_caching_lecture.json");
    let mut slides = Some(tools.project_root.join("fixtures").join("cpu_caching_slides.json"));
    let mut out_root = tools.project_root.join("artifacts").join("cli-run");

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
            other => {
                return Err(anyhow!("Unknown CLI argument: {other}"));
            }
        }
    }

    tokio::fs::create_dir_all(&out_root).await?;
    let db_path = out_root.join("learningedge.db");
    let pool = db::init_db(&db_path).await?;
    let worker_handle = spawn_pipeline_worker(pool.clone(), tools.clone());

    let preset = PresetConfig::default();
    let run_dir = out_root.join("latest");
    let run_id = create_pipeline_run(&pool, "lec-cpu-caching-01", &preset, &run_dir, None).await?;

    enqueue_pipeline_job(
        &pool,
        PipelineJob {
            run_id: run_id.clone(),
            transcript_path: fixture.to_string_lossy().to_string(),
            slides_path: slides.as_ref().map(|p| p.to_string_lossy().to_string()),
        },
    )
    .await?;

    let final_rec = wait_for_run_terminal(&pool, &run_id, Duration::from_secs(180)).await?;
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
