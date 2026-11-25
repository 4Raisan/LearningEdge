use learningedge_lib::{
    credentials, db, kg,
    models::{
        CoverageIssueKind, NoteDepth, NotePoint, PresetConfig, SceneItem, ScenePlan, SceneSpec,
        SceneTemplate, StageProviderConfig, StageProviderKind, ThinkingLevel, TranscriptSegment,
        VerifiedNotes,
    },
    pipeline::{
        coverage::verify_scene_plan_coverage,
        ingest::prepare_sources_from_files,
        orchestrator::{create_pipeline_run, execute_pipeline_run, load_run_artifacts_bundle},
        render::{ffprobe_media_json, render_scene_plan_to_video},
    },
    providers::{
        narration::{parse_wav_metadata, WindowsSapiProvider},
        retry_with_backoff,
        text::build_text_provider,
        transcription::{
            detect_source_conflicts, extract_audio_16k_wav, ingest_markdown_supporting_material,
            parse_whisper_json, plan_audio_chunks, remap_chunk_timestamps,
        },
        ProviderError,
    },
    sidecars,
    worker::{enqueue_pipeline_job, spawn_pipeline_worker, wait_for_run_terminal, PipelineJob},
};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

fn fixture_paths() -> (sidecars::ToolPaths, PathBuf, PathBuf, PathBuf) {
    let tools = sidecars::resolve_tools(None).expect("tools should resolve");
    let transcript = tools
        .project_root
        .join("fixtures")
        .join("cpu_caching_lecture.json");
    let slides = tools
        .project_root
        .join("fixtures")
        .join("cpu_caching_slides.json");
    let dense = tools
        .project_root
        .join("fixtures")
        .join("dense_overflow_scenes.json");
    (tools, transcript, slides, dense)
}

#[tokio::test]
async fn test_milestone1_e2e_fixture_apalis_export() {
    let (tools, transcript, slides, _) = fixture_paths();
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("learningedge.db");
    let pool = db::init_db(&db_path).await.unwrap();
    let worker = spawn_pipeline_worker(pool.clone(), tools.clone());

    let preset = PresetConfig::default();
    let out_dir = tmp.path().join("run1");
    let run_id = create_pipeline_run(&pool, "lec-cpu-caching-01", &preset, &out_dir, None)
        .await
        .unwrap();

    enqueue_pipeline_job(
        &pool,
        PipelineJob {
            run_id: run_id.clone(),
            transcript_path: transcript.to_string_lossy().to_string(),
            slides_path: Some(slides.to_string_lossy().to_string()),
        },
    )
    .await
    .unwrap();

    let rec = wait_for_run_terminal(&pool, &run_id, Duration::from_secs(180))
        .await
        .unwrap();
    assert_eq!(rec.status, "completed", "held={:?} err={:?}", rec.held_reason, rec.error_message);

    let bundle = load_run_artifacts_bundle(&pool, &run_id).await.unwrap();
    let sources = bundle.prepared_sources.expect("prepared_sources present");
    assert!(!sources.conflicts.is_empty(), "expected slide erratum conflict flag");

    let notes = bundle.verified_notes.expect("verified_notes present");
    assert!(notes.verification_passed);
    assert_eq!(notes.points.len(), 8);

    let coverage = bundle.coverage_report.expect("coverage_report present");
    assert!(coverage.passed);
    assert_eq!(coverage.checked_points, 8);

    let manifest = bundle.video_manifest.expect("video_manifest present");
    assert!(PathBuf::from(&manifest.video_path).is_file());
    assert!(PathBuf::from(&manifest.captions_path).is_file());

    let srt = std::fs::read_to_string(&manifest.captions_path).unwrap();
    assert!(srt.contains("-->"));

    // Verify ffprobe streams & narration-driven duration invariant
    let probe = ffprobe_media_json(&tools, &PathBuf::from(&manifest.video_path)).unwrap();
    let streams = probe["streams"].as_array().unwrap();
    assert!(streams.iter().any(|s| s["codec_type"] == "video"));
    assert!(streams.iter().any(|s| s["codec_type"] == "audio"));
    assert!(streams.iter().any(|s| s["codec_type"] == "subtitle"));

    let probe_dur_ms = (probe["format"]["duration"]
        .as_str()
        .unwrap()
        .parse::<f64>()
        .unwrap()
        * 1000.0)
        .round() as i64;
    let diff = (probe_dur_ms - manifest.total_duration_ms as i64).abs();
    assert!(
        diff <= 200,
        "Expected video duration ({probe_dur_ms}ms) to match narration total ({}ms), diff={diff}",
        manifest.total_duration_ms
    );

    // Every required note point resolves source -> note -> video segment
    assert_eq!(manifest.trace_index.len(), 8);
    for t in &manifest.trace_index {
        assert!(!t.source_refs.is_empty());
        assert!(!t.video_segments.is_empty());
        assert!(t.video_segments[0].end_ms > t.video_segments[0].start_ms);
    }

    worker.abort();
}

#[tokio::test]
async fn test_coverage_three_versions_and_cache_reuse() {
    let (tools, transcript, slides, _) = fixture_paths();
    let tmp = tempfile::tempdir().unwrap();
    let pool = db::init_db(&tmp.path().join("cov.db")).await.unwrap();
    let preset = PresetConfig::default();

    let sources = prepare_sources_from_files(&pool, &transcript, Some(&slides))
        .await
        .unwrap();
    let provider = build_text_provider(true, &preset.notes_stage).unwrap();
    let notes = provider
        .generate_notes(&sources, &preset.note_depth, "", "")
        .await
        .unwrap();
    let plan_v_complete = provider.generate_scene_plan(&notes).await.unwrap();

    // Version A: complete explanation -> passes coverage check
    let report_a = verify_scene_plan_coverage(&notes, &plan_v_complete, Some(provider.as_ref()))
        .await
        .unwrap();
    assert!(report_a.passed, "Version A should pass: {:?}", report_a.issues);

    // Version B: remove required point np-06 -> holds rendering
    let mut plan_v_missing = plan_v_complete.clone();
    plan_v_missing
        .scenes
        .retain(|s| !s.note_point_ids.contains(&"np-06".to_string()));
    let run_id = create_pipeline_run(
        &pool,
        "lec-cpu-caching-01",
        &preset,
        &tmp.path().join("cov_run"),
        Some(&plan_v_missing),
    )
    .await
    .unwrap();
    let rec_b = execute_pipeline_run(&pool, &tools, &run_id, &transcript, Some(&slides))
        .await
        .unwrap();
    assert_eq!(rec_b.status, "held_for_review");
    let bundle_b = load_run_artifacts_bundle(&pool, &run_id).await.unwrap();
    assert!(bundle_b
        .coverage_report
        .unwrap()
        .issues
        .iter()
        .any(|i| i.note_point_id == "np-06" && i.kind == CoverageIssueKind::MissingRequiredPoint));
    assert!(!tmp.path().join("cov_run").join("explainer.mp4").exists());

    // Version C: np-06 ID is present, but narration only mentions it superficially -> holds rendering
    let mut plan_v_shallow = plan_v_complete.clone();
    for s in &mut plan_v_shallow.scenes {
        if s.note_point_ids.contains(&"np-06".to_string()) {
            s.narration_sentences = vec!["We briefly mention write policies here.".to_string()];
            s.items = vec![SceneItem {
                id: "shallow-1".to_string(),
                badge: None,
                icon: None,
                stat: None,
                label: "Write Policies".to_string(),
                detail: "See topic.".to_string(),
                cue_index: Some(0),
            }];
        }
    }
    db::set_run_scene_plan_override(
        &pool,
        &run_id,
        Some(&serde_json::to_string(&plan_v_shallow).unwrap()),
        "queued",
    )
    .await
    .unwrap();
    let rec_c = execute_pipeline_run(&pool, &tools, &run_id, &transcript, Some(&slides))
        .await
        .unwrap();
    assert_eq!(rec_c.status, "held_for_review");
    let bundle_c = load_run_artifacts_bundle(&pool, &run_id).await.unwrap();
    assert!(bundle_c
        .coverage_report
        .unwrap()
        .issues
        .iter()
        .any(|i| i.note_point_id == "np-06"
            && i.kind == CoverageIssueKind::ShallowMentionWithoutExplanation));

    // Fix the failed scene back to complete Version A and retry -> completes & reuses stage caches
    db::set_run_scene_plan_override(
        &pool,
        &run_id,
        Some(&serde_json::to_string(&plan_v_complete).unwrap()),
        "queued",
    )
    .await
    .unwrap();
    let rec_fixed = execute_pipeline_run(&pool, &tools, &run_id, &transcript, Some(&slides))
        .await
        .unwrap();
    assert_eq!(rec_fixed.status, "completed");
    let metrics1 = load_run_artifacts_bundle(&pool, &run_id)
        .await
        .unwrap()
        .benchmark_metrics
        .unwrap();
    assert!(
        metrics1.stages.iter().any(|s| s.stage == "notes" && s.reused),
        "Expected notes stage to be reused from cache on retry"
    );

    // Edit only 1 scene and re-run -> remaining 7 scenes reuse cached audio + clips
    let mut plan_v_edited = plan_v_complete.clone();
    for s in &mut plan_v_edited.scenes {
        if s.note_point_ids.contains(&"np-06".to_string()) {
            s.subtitle = Some("Edited Write Policy Explanation".to_string());
        }
    }
    db::set_run_scene_plan_override(
        &pool,
        &run_id,
        Some(&serde_json::to_string(&plan_v_edited).unwrap()),
        "queued",
    )
    .await
    .unwrap();
    let rec_edited = execute_pipeline_run(&pool, &tools, &run_id, &transcript, Some(&slides))
        .await
        .unwrap();
    assert_eq!(rec_edited.status, "completed");
    let metrics2 = load_run_artifacts_bundle(&pool, &run_id)
        .await
        .unwrap()
        .benchmark_metrics
        .unwrap();
    assert_eq!(metrics2.reused_audio_count, 8);
    assert_eq!(metrics2.reused_clip_count, 7);
}

#[tokio::test]
async fn test_dense_overflow_render_and_readability() {
    let (tools, _, _, dense_path) = fixture_paths();
    let tmp = tempfile::tempdir().unwrap();
    let pool = db::init_db(&tmp.path().join("dense.db")).await.unwrap();
    let preset = PresetConfig::default();

    #[derive(serde::Deserialize)]
    struct DenseFile {
        scenes: Vec<SceneSpec>,
    }
    let raw = std::fs::read_to_string(&dense_path).unwrap();
    let parsed: DenseFile = serde_json::from_str(&raw).unwrap();
    let plan = ScenePlan {
        lecture_id: "lec-dense-01".to_string(),
        title: "Dense Overflow Stress Test".to_string(),
        scenes: parsed.scenes,
    };
    let notes = VerifiedNotes {
        lecture_id: "lec-dense-01".to_string(),
        title: "Dense Overflow Stress Test".to_string(),
        depth: NoteDepth::Standard,
        points: vec![NotePoint {
            id: "np-05".to_string(),
            title: "Coherence".to_string(),
            definition: "Coherence keeps caches consistent.".to_string(),
            reasoning: "Cores track ownership states.".to_string(),
            qualification: None,
            example: None,
            key_terms: vec!["coherence".to_string()],
            source_refs: vec!["seg-05".to_string()],
            required: true,
            preferred_template: Some(SceneTemplate::ConceptReveal),
        }],
        verification_passed: true,
        flags: vec![],
    };

    let stats = render_scene_plan_to_video(
        &pool,
        &tools,
        &WindowsSapiProvider,
        "run-dense",
        &notes,
        &plan,
        &preset,
        &tmp.path().join("dense_out"),
    )
    .await
    .unwrap();

    assert!(
        stats.manifest.scenes.len() >= 6,
        "Expected 3 dense templates to paginate into >= 6 readable continuation scenes, got {}",
        stats.manifest.scenes.len()
    );
    for entry in &stats.manifest.scenes {
        assert!(entry.layout_metrics.min_font_size >= 18.0);
        assert_eq!(entry.layout_metrics.max_overlap_count, 0);
        assert_eq!(entry.layout_metrics.out_of_bounds_count, 0);
    }
    assert!(PathBuf::from(&stats.manifest.video_path).is_file());
}

#[tokio::test]
async fn test_milestone2_ffmpeg_extract_chunking_whisper_and_materials() {
    let (tools, _, _, _) = fixture_paths();
    let tmp = tempfile::tempdir().unwrap();
    let synth_mp4 = tmp.path().join("sample_lecture.mp4");
    let wav_16k = tmp.path().join("extracted_16k.wav");

    let out = Command::new(&tools.ffmpeg)
        .args([
            "-y",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=320x240:d=2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=2",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            &synth_mp4.to_string_lossy(),
        ])
        .output()
        .unwrap();
    assert!(out.status.success());

    extract_audio_16k_wav(&tools.ffmpeg, &synth_mp4, &wav_16k).unwrap();
    let meta = parse_wav_metadata(&std::fs::read(&wav_16k).unwrap()).unwrap();
    assert_eq!(meta.sample_rate, 16000);
    assert_eq!(meta.channels, 1);
    assert!(meta.duration_ms >= 1900);

    // Chunk planning & boundary timestamp remapping
    let windows = plan_audio_chunks(125_000, 60_000, 5_000);
    assert_eq!(windows.len(), 3);
    assert_eq!(windows[1].start_ms, 55_000);

    let chunk0 = parse_whisper_json(
        r#"{"transcription":[{"offsets":{"from":0,"to":3000},"text":"Cache locality speeds up reads."}]}"#,
        0,
    )
    .unwrap();
    let chunk1 = parse_whisper_json(
        r#"{"transcription":[
            {"offsets":{"from":0,"to":3000},"text":"Cache locality speeds up reads."},
            {"offsets":{"from":3100,"to":7200},"text":"Sequential scans use spatial locality."}
        ]}"#,
        0,
    )
    .unwrap();
    let remapped = remap_chunk_timestamps(&[(0, chunk0), (1_500, chunk1)]);
    assert_eq!(remapped.len(), 2);
    assert_eq!(remapped[1].start_ms, 4_600);
    assert_eq!(remapped[1].end_ms, 8_700);

    // Markdown materials & conflict detection
    let mats = ingest_markdown_supporting_material("notes", "# Intro\nL1 is 32 MB per core.\n---\n# Summary\nCache lines are 64 bytes.");
    assert_eq!(mats.len(), 2);
    assert_eq!(mats[0].source_ref, "page:1");
    let segs = vec![TranscriptSegment {
        id: "seg-05".to_string(),
        start_ms: 0,
        end_ms: 5000,
        speaker: None,
        topic_id: None,
        topic_title: None,
        text: "Level one stays around thirty-two kilobytes per core. [inaudible]".to_string(),
    }];
    let conflicts = detect_source_conflicts(&segs, &mats);
    assert_eq!(conflicts.len(), 2);
}

#[tokio::test]
async fn test_milestone3_providers_offline_guard_retry_and_credentials() {
    // 1. Offline guard blocks cloud provider
    let cloud_cfg = StageProviderConfig {
        provider: StageProviderKind::OpenAi,
        model: "gpt-4.1-mini".to_string(),
        thinking: ThinkingLevel::Off,
        credential_ref: Some("openai-default".to_string()),
        base_url: None,
    };
    let blocked = build_text_provider(true, &cloud_cfg);
    assert!(matches!(blocked, Err(ProviderError::OfflinePolicyViolation(_))));

    // 2. Retry helper retries transient failures and stops on auth failure
    let counter = Arc::new(AtomicUsize::new(0));
    let c2 = counter.clone();
    let ok_val = retry_with_backoff(3, 10, move |_| {
        let c = c2.clone();
        async move {
            let n = c.fetch_add(1, Ordering::SeqCst);
            if n < 2 {
                Err(ProviderError::Transient {
                    status: Some(503),
                    message: "busy".to_string(),
                })
            } else {
                Ok("recovered")
            }
        }
    })
    .await
    .unwrap();
    assert_eq!(ok_val, "recovered");
    assert_eq!(counter.load(Ordering::SeqCst), 3);

    // 3. Preset stores only credential_ref, never raw secret
    let tmp = tempfile::tempdir().unwrap();
    let pool = db::init_db(&tmp.path().join("presets.db")).await.unwrap();
    let mut preset = PresetConfig::default();
    preset.id = "preset-cloud-ref-test".to_string();
    preset.offline_only = false;
    preset.notes_stage = cloud_cfg;
    db::upsert_preset(&pool, &preset, false).await.unwrap();
    let loaded = db::get_preset(&pool, "preset-cloud-ref-test")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        loaded.notes_stage.credential_ref.as_deref(),
        Some("openai-default")
    );

    // 4. OS Credential Manager round-trip (Windows Credential Store)
    let test_ref = format!("learningedge-test-{}", uuid::Uuid::new_v4());
    credentials::store_secret(&test_ref, "sk-test-secret-value-123").unwrap();
    assert!(credentials::has_secret(&test_ref));
    assert_eq!(
        credentials::get_secret(&test_ref).unwrap(),
        "sk-test-secret-value-123"
    );
    credentials::delete_secret(&test_ref).unwrap();
    assert!(!credentials::has_secret(&test_ref));
}

#[tokio::test]
async fn test_milestone4_kg_fts5_merge_and_dreaming() {
    let (_, transcript, slides, _) = fixture_paths();
    let tmp = tempfile::tempdir().unwrap();
    let pool = db::init_db(&tmp.path().join("kg.db")).await.unwrap();
    let sources = prepare_sources_from_files(&pool, &transcript, Some(&slides))
        .await
        .unwrap();

    // FTS5 search
    let hits = db::search_source_segments_fts(&pool, "locality", 10)
        .await
        .unwrap();
    assert!(!hits.is_empty());

    let provider = build_text_provider(true, &PresetConfig::default().notes_stage).unwrap();
    let notes = provider
        .generate_notes(&sources, &NoteDepth::Standard, "", "")
        .await
        .unwrap();
    kg::populate_kg_from_run(&pool, &notes, None).await.unwrap();

    // Merge duplicate concept
    kg::upsert_concept(
        &pool,
        "concept-dup-temporal",
        "Temporal Locality Duplicate",
        "Duplicate node for merge test.",
    )
    .await
    .unwrap();
    kg::merge_duplicate_concepts(&pool, "concept-np-02", "concept-dup-temporal")
        .await
        .unwrap();
    let snap_after_merge = kg::get_knowledge_graph(&pool).await.unwrap();
    assert!(!snap_after_merge
        .concepts
        .iter()
        .any(|c| c.id == "concept-dup-temporal"));
    let kept = snap_after_merge
        .concepts
        .iter()
        .find(|c| c.id == "concept-np-02")
        .unwrap();
    assert!(kept.aliases.contains(&"Temporal Locality Duplicate".to_string()));

    // Dreaming keeps pending suggestions distinct from accepted graph edges
    let suggestions = kg::run_dreaming(&pool).await.unwrap();
    assert!(!suggestions.is_empty());
    let edges_before = snap_after_merge.edges.len();
    let snap_pending = kg::get_knowledge_graph(&pool).await.unwrap();
    assert_eq!(snap_pending.edges.len(), edges_before);

    let first_id = suggestions[0].id.clone();
    kg::review_dream_suggestion(&pool, &first_id, true)
        .await
        .unwrap();
    if suggestions.len() > 1 {
        kg::review_dream_suggestion(&pool, &suggestions[1].id, false)
            .await
            .unwrap();
    }

    let snap_reviewed = kg::get_knowledge_graph(&pool).await.unwrap();
    assert!(snap_reviewed.edges.len() > edges_before);
    let reviewed_first = snap_reviewed
        .dream_suggestions
        .iter()
        .find(|s| s.id == first_id)
        .unwrap();
    assert_eq!(reviewed_first.status, "accepted");
}
