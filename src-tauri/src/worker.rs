use anyhow::{anyhow, Result};
use apalis::prelude::*;
use apalis_sqlite::SqliteStorage;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::time::Duration;
use tracing::{error, info};

use crate::db;
use crate::kg;
use crate::models::PipelineRunRecord;
use crate::pipeline::orchestrator::{execute_pipeline_run, load_run_artifacts_bundle};
use crate::sidecars::ToolPaths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineJob {
    pub run_id: String,
    pub transcript_path: String,
    pub slides_path: Option<String>,
}

#[derive(Clone)]
pub struct WorkerContextData {
    pub pool: SqlitePool,
    pub tools: ToolPaths,
}

async fn handle_pipeline_job(
    job: PipelineJob,
    data: Data<WorkerContextData>,
) -> Result<(), BoxDynError> {
    info!("Apalis worker starting pipeline run {}", job.run_id);
    let transcript = PathBuf::from(&job.transcript_path);
    let slides = job.slides_path.as_ref().map(PathBuf::from);

    match execute_pipeline_run(
        &data.pool,
        &data.tools,
        &job.run_id,
        &transcript,
        slides.as_deref(),
    )
    .await
    {
        Ok(rec) => {
            if rec.status == "completed" && serde_json::from_str::<crate::models::PresetConfig>(&rec.preset_snapshot_json)?.auto_graph {
                if let Ok(bundle) = load_run_artifacts_bundle(&data.pool, &job.run_id).await {
                    if let Some(notes) = bundle.verified_notes {
                        let _ = kg::populate_kg_from_run(
                            &data.pool,
                            &notes,
                            bundle.video_manifest.as_ref(),
                        )
                        .await;
                    }
                }
            }
            info!("Apalis run {} finished with status {}", job.run_id, rec.status);
            Ok(())
        }
        Err(err) => {
            error!("Apalis run {} failed: {err:#}", job.run_id);
            let _ = db::update_run_status(
                &data.pool,
                &job.run_id,
                "failed",
                Some("failed"),
                None,
                Some(&err.to_string()),
                None,
            )
            .await;
            Err(err.into())
        }
    }
}

pub fn create_storage(pool: &SqlitePool) -> SqliteStorage<PipelineJob> {
    SqliteStorage::new(pool)
}

pub async fn enqueue_pipeline_job(
    pool: &SqlitePool,
    job: PipelineJob,
) -> Result<()> {
    let mut storage = create_storage(pool);
    storage
        .push(job)
        .await
        .map_err(|e| anyhow!("Failed to enqueue Apalis pipeline job: {e}"))?;
    Ok(())
}

pub fn spawn_pipeline_worker(
    pool: SqlitePool,
    tools: ToolPaths,
) -> tokio::task::JoinHandle<()> {
    let backend = create_storage(&pool).poll_with_interval(Duration::from_millis(120));
    let ctx_data = WorkerContextData { pool, tools };
    let worker = WorkerBuilder::new("learningedge-pipeline-worker")
        .backend(backend)
        .data(ctx_data)
        .on_event(|_ctx, ev| {
            tracing::debug!("Apalis worker event: {:?}", ev);
        })
        .build(handle_pipeline_job);

    tokio::spawn(async move {
        if let Err(err) = worker.run().await {
            error!("Apalis pipeline worker stopped with error: {err}");
        }
    })
}

pub async fn wait_for_run_terminal(
    pool: &SqlitePool,
    run_id: &str,
    timeout: Duration,
) -> Result<PipelineRunRecord> {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if let Some(rec) = db::get_pipeline_run(pool, run_id).await? {
            if matches!(
                rec.status.as_str(),
                "completed" | "held_for_review" | "failed"
            ) {
                return Ok(rec);
            }
        }
        if tokio::time::Instant::now() >= deadline {
            let cur = db::get_pipeline_run(pool, run_id).await.ok().flatten();
            return Err(anyhow!(
                "Timed out waiting for pipeline run '{run_id}' to reach terminal state (last={:?})",
                cur.map(|r| (r.status, r.current_stage, r.error_message))
            ));
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}
