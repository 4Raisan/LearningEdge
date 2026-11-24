use anyhow::{anyhow, Result};
use sqlx::SqlitePool;
use std::path::Path;
use std::time::Instant;

use crate::db;
use crate::models::{
    BenchmarkMetrics, PipelineRunRecord, PreparedSources, PresetConfig, RunArtifactsBundle,
    ScenePlan, StageTimingMetric, VerifiedNotes,
};
use crate::pipeline::coverage::verify_scene_plan_coverage;
use crate::pipeline::ingest::{prepare_sources_from_files, sha256_hex};
use crate::pipeline::render::render_scene_plan_to_video;
use crate::providers::narration::WindowsSapiProvider;
use crate::providers::text::build_text_provider;
use crate::sidecars::ToolPaths;

#[cfg(windows)]
fn query_peak_working_set_bytes() -> u64 {
    // Lightweight self-process memory query using standard Win32 FFI without extra crate overhead
    #[repr(C)]
    #[allow(non_snake_case)]
    struct ProcessMemoryCounters {
        cb: u32,
        PageFaultCount: u32,
        PeakWorkingSetSize: usize,
        WorkingSetSize: usize,
        QuotaPeakPagedPoolUsage: usize,
        QuotaPagedPoolUsage: usize,
        QuotaPeakNonPagedPoolUsage: usize,
        QuotaNonPagedPoolUsage: usize,
        PagefileUsage: usize,
        PeakPagefileUsage: usize,
    }
    extern "system" {
        fn GetCurrentProcess() -> isize;
        fn K32GetProcessMemoryInfo(
            process: isize,
            ppsmem_counters: *mut ProcessMemoryCounters,
            cb: u32,
        ) -> i32;
    }
    unsafe {
        let mut pmc = std::mem::zeroed::<ProcessMemoryCounters>();
        pmc.cb = std::mem::size_of::<ProcessMemoryCounters>() as u32;
        if K32GetProcessMemoryInfo(GetCurrentProcess(), &mut pmc, pmc.cb) != 0 {
            pmc.PeakWorkingSetSize as u64
        } else {
            0
        }
    }
}

#[cfg(not(windows))]
fn query_peak_working_set_bytes() -> u64 {
    0
}

pub async fn create_pipeline_run(
    pool: &SqlitePool,
    lecture_id: &str,
    preset: &PresetConfig,
    output_dir: &Path,
    override_scene_plan: Option<&ScenePlan>,
) -> Result<String> {
    let run_id = format!("run-{}", uuid::Uuid::new_v4());
    let preset_json = serde_json::to_string(preset)?;
    let settings_hash = sha256_hex(preset_json.as_bytes());
    let override_json = override_scene_plan
        .map(serde_json::to_string)
        .transpose()?;
    let now = db::now_rfc3339();

    let rec = PipelineRunRecord {
        id: run_id.clone(),
        lecture_id: lecture_id.to_string(),
        preset_id: preset.id.clone(),
        preset_snapshot_json: preset_json,
        status: "queued".to_string(),
        current_stage: Some("queued".to_string()),
        held_reason: None,
        error_message: None,
        output_dir: output_dir.to_string_lossy().to_string(),
        source_hash: String::new(),
        settings_hash,
        override_scene_plan_json: override_json,
        metrics_json: None,
        created_at: now.clone(),
        updated_at: now,
    };
    db::insert_pipeline_run(pool, &rec).await?;
    Ok(run_id)
}

async fn load_cached_json<T: serde::de::DeserializeOwned>(
    pool: &SqlitePool,
    run_id: &str,
    stage_name: &str,
    expected_hash: &str,
) -> Result<Option<T>> {
    if let Some((saved_hash, path_str, _)) = db::get_stage_artifact(pool, run_id, stage_name).await?
    {
        if saved_hash == expected_hash && Path::new(&path_str).is_file() {
            let raw = tokio::fs::read_to_string(&path_str).await?;
            let parsed: T = serde_json::from_str(&raw)?;
            return Ok(Some(parsed));
        }
    }
    Ok(None)
}

pub async fn execute_pipeline_run(
    pool: &SqlitePool,
    tools: &ToolPaths,
    run_id: &str,
    transcript_path: &Path,
    slides_path: Option<&Path>,
) -> Result<PipelineRunRecord> {
    let run = db::get_pipeline_run(pool, run_id)
        .await?
        .ok_or_else(|| anyhow!("Pipeline run '{run_id}' not found"))?;
    let preset: PresetConfig = serde_json::from_str(&run.preset_snapshot_json)?;
    let out_dir = Path::new(&run.output_dir);
    tokio::fs::create_dir_all(out_dir).await?;

    let overall_start = Instant::now();
    let mut stage_metrics = Vec::new();

    // Stage 1: Ingest sources
    db::update_run_status(pool, run_id, "running", Some("ingest"), None, None, None).await?;
    let t0 = Instant::now();
    let prepared: PreparedSources = prepare_sources_from_files(pool, transcript_path, slides_path).await?;
    let ingest_path = out_dir.join("prepared_sources.json");
    tokio::fs::write(&ingest_path, serde_json::to_string_pretty(&prepared)?).await?;
    db::upsert_stage_artifact(
        pool,
        run_id,
        "ingest",
        &prepared.source_hash,
        &ingest_path.to_string_lossy(),
        "{}",
    )
    .await?;
    stage_metrics.push(StageTimingMetric {
        stage: "ingest".to_string(),
        duration_ms: t0.elapsed().as_millis() as u64,
        reused: false,
    });

    // Stage 2: Generate notes (reusable by source_hash + notes_stage settings + note_depth)
    db::update_run_status(pool, run_id, "running", Some("notes"), None, None, None).await?;
    let t1 = Instant::now();
    let notes_input_hash = sha256_hex(
        serde_json::to_string(&serde_json::json!({
            "source_hash": &prepared.source_hash,
            "depth": &preset.note_depth,
            "structure": &preset.structure_preference,
            "emphasis": &preset.emphasis,
            "stage": &preset.notes_stage,
            "offline_only": preset.offline_only
        }))?
        .as_bytes(),
    );
    let (notes_draft, notes_reused) =
        if let Some(cached) = load_cached_json::<VerifiedNotes>(pool, run_id, "notes", &notes_input_hash).await? {
            (cached, true)
        } else {
            let provider = build_text_provider(preset.offline_only, &preset.notes_stage)?;
            let generated = provider
                .generate_notes(
                    &prepared,
                    &preset.note_depth,
                    &preset.structure_preference,
                    &preset.emphasis,
                )
                .await?;
            let path = out_dir.join("notes_draft.json");
            tokio::fs::write(&path, serde_json::to_string_pretty(&generated)?).await?;
            db::upsert_stage_artifact(
                pool,
                run_id,
                "notes",
                &notes_input_hash,
                &path.to_string_lossy(),
                "{}",
            )
            .await?;
            (generated, false)
        };
    stage_metrics.push(StageTimingMetric {
        stage: "notes".to_string(),
        duration_ms: t1.elapsed().as_millis() as u64,
        reused: notes_reused,
    });

    // Stage 3: Verify notes against sources
    db::update_run_status(pool, run_id, "running", Some("verify_notes"), None, None, None).await?;
    let t2 = Instant::now();
    let verify_input_hash = sha256_hex(
        serde_json::to_string(&serde_json::json!({
            "notes_hash": &notes_input_hash,
            "stage": &preset.verify_stage,
            "offline_only": preset.offline_only
        }))?
        .as_bytes(),
    );
    let (verified_notes, verify_reused) = if let Some(cached) =
        load_cached_json::<VerifiedNotes>(pool, run_id, "verify_notes", &verify_input_hash).await?
    {
        (cached, true)
    } else {
        let provider = build_text_provider(preset.offline_only, &preset.verify_stage)?;
        let verified = provider.verify_notes(&prepared, &notes_draft).await?;
        let path = out_dir.join("verified_notes.json");
        tokio::fs::write(&path, serde_json::to_string_pretty(&verified)?).await?;
        db::upsert_stage_artifact(
            pool,
            run_id,
            "verify_notes",
            &verify_input_hash,
            &path.to_string_lossy(),
            "{}",
        )
        .await?;
        (verified, false)
    };
    stage_metrics.push(StageTimingMetric {
        stage: "verify_notes".to_string(),
        duration_ms: t2.elapsed().as_millis() as u64,
        reused: verify_reused,
    });

    if !verified_notes.verification_passed {
        let reason = verified_notes.flags.first()
            .map(|flag| format!("Notes need review. {}", flag.message))
            .unwrap_or_else(|| "Notes need review before rendering.".into());
        db::update_run_status(
            pool,
            run_id,
            "held_for_review",
            Some("verify_notes"),
            Some(&reason),
            None,
            None,
        )
        .await?;
        return Ok(db::get_pipeline_run(pool, run_id).await?.unwrap());
    }

    tokio::fs::write(out_dir.join("verified_notes.md"), crate::studio::markdown(&verified_notes)).await?;
    // Stage 4: Scene plan (or override plan)
    db::update_run_status(pool, run_id, "running", Some("scene_plan"), None, None, None).await?;
    let t3 = Instant::now();
    let (scene_plan, plan_reused) = if let Some(ref override_json) = run.override_scene_plan_json {
        let plan: ScenePlan = serde_json::from_str(override_json)?;
        let path = out_dir.join("scene_plan.json");
        tokio::fs::write(&path, serde_json::to_string_pretty(&plan)?).await?;
        (plan, false)
    } else {
        let plan_input_hash = sha256_hex(
            serde_json::to_string(&serde_json::json!({
                "verify_hash": &verify_input_hash,
                "stage": &preset.scene_plan_stage,
                "offline_only": preset.offline_only
            }))?
            .as_bytes(),
        );
        if let Some(cached) =
            load_cached_json::<ScenePlan>(pool, run_id, "scene_plan", &plan_input_hash).await?
        {
            (cached, true)
        } else {
            let provider = build_text_provider(preset.offline_only, &preset.scene_plan_stage)?;
            let plan = provider.generate_scene_plan(&verified_notes).await?;
            let path = out_dir.join("scene_plan.json");
            tokio::fs::write(&path, serde_json::to_string_pretty(&plan)?).await?;
            db::upsert_stage_artifact(
                pool,
                run_id,
                "scene_plan",
                &plan_input_hash,
                &path.to_string_lossy(),
                "{}",
            )
            .await?;
            (plan, false)
        }
    };
    stage_metrics.push(StageTimingMetric {
        stage: "scene_plan".to_string(),
        duration_ms: t3.elapsed().as_millis() as u64,
        reused: plan_reused,
    });

    // Stage 5: Two-phase Coverage Check
    db::update_run_status(pool, run_id, "running", Some("coverage_check"), None, None, None).await?;
    let t4 = Instant::now();
    let coverage_provider = build_text_provider(preset.offline_only, &preset.coverage_stage)?;
    let coverage_report =
        verify_scene_plan_coverage(&verified_notes, &scene_plan, Some(coverage_provider.as_ref()))
            .await?;
    let coverage_path = out_dir.join("coverage_report.json");
    tokio::fs::write(&coverage_path, serde_json::to_string_pretty(&coverage_report)?).await?;
    let cov_hash = sha256_hex(serde_json::to_string(&coverage_report)?.as_bytes());
    db::upsert_stage_artifact(
        pool,
        run_id,
        "coverage_check",
        &cov_hash,
        &coverage_path.to_string_lossy(),
        "{}",
    )
    .await?;
    stage_metrics.push(StageTimingMetric {
        stage: "coverage_check".to_string(),
        duration_ms: t4.elapsed().as_millis() as u64,
        reused: false,
    });

    if !coverage_report.passed {
        let held_reason = coverage_report
            .issues
            .iter()
            .map(|i| i.message.as_str())
            .collect::<Vec<_>>()
            .join(" | ");
        let metrics = BenchmarkMetrics {
            total_duration_ms: overall_start.elapsed().as_millis() as u64,
            peak_working_set_bytes: query_peak_working_set_bytes(),
            stages: stage_metrics,
            reused_audio_count: 0,
            reused_clip_count: 0,
        };
        let metrics_json = serde_json::to_string_pretty(&metrics)?;
        tokio::fs::write(out_dir.join("benchmark_metrics.json"), &metrics_json).await?;
        db::update_run_status(
            pool,
            run_id,
            "held_for_review",
            Some("coverage_check"),
            Some(&held_reason),
            None,
            Some(&metrics_json),
        )
        .await?;
        return Ok(db::get_pipeline_run(pool, run_id).await?.unwrap());
    }

    // Stage 6: Narration-first + Konva scene rendering + FFmpeg assembly
    db::update_run_status(
        pool,
        run_id,
        "running",
        Some("narration_and_render"),
        None,
        None,
        None,
    )
    .await?;
    let t5 = Instant::now();
    let narration = WindowsSapiProvider;
    let render_stats = render_scene_plan_to_video(
        pool,
        tools,
        &narration,
        run_id,
        &verified_notes,
        &scene_plan,
        &preset,
        out_dir,
    )
    .await?;
    stage_metrics.push(StageTimingMetric {
        stage: "narration_and_render".to_string(),
        duration_ms: t5.elapsed().as_millis() as u64,
        reused: false,
    });


    let metrics = BenchmarkMetrics {
        total_duration_ms: overall_start.elapsed().as_millis() as u64,
        peak_working_set_bytes: query_peak_working_set_bytes(),
        stages: stage_metrics,
        reused_audio_count: render_stats.reused_audio_count,
        reused_clip_count: render_stats.reused_clip_count,
    };
    let metrics_json = serde_json::to_string_pretty(&metrics)?;
    tokio::fs::write(out_dir.join("benchmark_metrics.json"), &metrics_json).await?;

    db::update_run_status(
        pool,
        run_id,
        "completed",
        Some("completed"),
        None,
        None,
        Some(&metrics_json),
    )
    .await?;

    Ok(db::get_pipeline_run(pool, run_id).await?.unwrap())
}

pub async fn load_run_artifacts_bundle(
    pool: &SqlitePool,
    run_id: &str,
) -> Result<RunArtifactsBundle> {
    let run = db::get_pipeline_run(pool, run_id)
        .await?
        .ok_or_else(|| anyhow!("Run '{run_id}' not found"))?;
    let out_dir = std::path::PathBuf::from(&run.output_dir);

    async fn read_opt<T: serde::de::DeserializeOwned>(p: std::path::PathBuf) -> Option<T> {
        if let Ok(raw) = tokio::fs::read_to_string(p).await {
            serde_json::from_str(&raw).ok()
        } else {
            None
        }
    }

    Ok(RunArtifactsBundle {
        run,
        prepared_sources: read_opt(out_dir.join("prepared_sources.json")).await,
        verified_notes: read_opt(out_dir.join("verified_notes.json")).await,
        scene_plan: read_opt(out_dir.join("paginated_scene_plan.json"))
            .await
            .or(read_opt(out_dir.join("scene_plan.json")).await),
        coverage_report: read_opt(out_dir.join("coverage_report.json")).await,
        video_manifest: read_opt(out_dir.join("video_manifest.json")).await,
        benchmark_metrics: read_opt(out_dir.join("benchmark_metrics.json")).await,
    })
}
