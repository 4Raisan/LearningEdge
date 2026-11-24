use std::time::Duration;

use learningedge_lib::{commands, db, pipeline::orchestrator::load_run_artifacts_bundle, sidecars, worker};

#[tokio::test]
#[ignore = "requires ChatGPT CLI sign-in, Windows narration, and rendering tools"]
async fn signed_in_codex_lecture_exports_a_video() {
    let temp = tempfile::tempdir().unwrap();
    let pool = db::init_db(&temp.path().join("test.db")).await.unwrap();
    let handle = worker::spawn_pipeline_worker(pool.clone(), sidecars::resolve_tools(None).unwrap());
    let stage = serde_json::json!({"provider":"codex_cli","model":"codex-default","thinking":"low"});
    let settings = serde_json::from_value(serde_json::json!({"notes":stage,"video":stage,"depth":"brief","auto_graph":false})).unwrap();
    let id = commands::enqueue_configured(&pool, temp.path(),
        "A checksum summarizes a file. Comparing the computed checksum against a trusted original can reveal corruption because changing the file usually changes its checksum.", false, Some(settings)).await.unwrap();
    let result = worker::wait_for_run_terminal(&pool, &id, Duration::from_secs(300)).await.unwrap();
    assert_eq!(result.status, "completed", "{:?} {:?}", result.error_message, result.held_reason);
    tokio::time::sleep(Duration::from_millis(250)).await;
    assert!(learningedge_lib::kg::get_knowledge_graph(&pool).await.unwrap().concepts.is_empty());
    handle.abort();

    let run = load_run_artifacts_bundle(&pool, &id).await.unwrap();
    assert!(run.coverage_report.unwrap().passed);
    assert!(!run.video_manifest.unwrap().trace_index.is_empty());
}
