use std::time::Duration;

use learningedge_lib::{commands, db, pipeline::orchestrator::load_run_artifacts_bundle, sidecars, worker};

#[tokio::test]
#[ignore = "requires ChatGPT CLI sign-in, Windows narration, and rendering tools"]
async fn signed_in_codex_lecture_exports_a_video() {
    let temp = tempfile::tempdir().unwrap();
    let pool = db::init_db(&temp.path().join("test.db")).await.unwrap();
    let handle = worker::spawn_pipeline_worker(pool.clone(), sidecars::resolve_tools(None).unwrap());
    let id = commands::enqueue_lecture_text(&pool, temp.path(),
        "A checksum summarizes a file. Comparing the computed checksum against a trusted original can reveal corruption because changing the file usually changes its checksum.", true).await.unwrap();
    let result = worker::wait_for_run_terminal(&pool, &id, Duration::from_secs(300)).await.unwrap();
    handle.abort();
    assert_eq!(result.status, "completed", "{:?} {:?}", result.error_message, result.held_reason);
    let run = load_run_artifacts_bundle(&pool, &id).await.unwrap();
    assert!(run.coverage_report.unwrap().passed);
    assert!(!run.video_manifest.unwrap().trace_index.is_empty());
}
