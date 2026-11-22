use anyhow::Result;
use chrono::Utc;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    Row, SqlitePool,
};
use std::{path::Path, time::Duration};

use crate::models::{
    PipelineRunRecord, PresetConfig, SourceSearchHit, SupportingMaterialItem, TranscriptSegment,
};

pub fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}

pub async fn init_db(db_path: &Path) -> Result<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        if !parent.as_os_str().is_empty() {
            tokio::fs::create_dir_all(parent).await?;
        }
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Run Apalis SQLite migrations and LearningEdge schema migrations in one database,
    // allowing each migrator to ignore versions tracked by the other.
    let mut apalis_migrator = apalis_sqlite::SqliteStorage::<()>::migrations();
    apalis_migrator.set_ignore_missing(true);
    apalis_migrator.run(&pool).await?;

    let mut app_migrator = sqlx::migrate!("./migrations");
    app_migrator.set_ignore_missing(true);
    app_migrator.run(&pool).await?;

    ensure_default_preset(&pool).await?;
    Ok(pool)
}

async fn ensure_default_preset(pool: &SqlitePool) -> Result<()> {
    let default_preset = PresetConfig::default();
    let json = serde_json::to_string(&default_preset)?;
    sqlx::query(
        r#"
        INSERT INTO presets (id, name, config_json, is_default, updated_at)
        VALUES (?1, ?2, ?3, 1, ?4)
        ON CONFLICT(id) DO NOTHING
        "#,
    )
    .bind(&default_preset.id)
    .bind(&default_preset.name)
    .bind(&json)
    .bind(now_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn upsert_preset(pool: &SqlitePool, preset: &PresetConfig, is_default: bool) -> Result<()> {
    let json = serde_json::to_string(preset)?;
    if is_default {
        sqlx::query("UPDATE presets SET is_default = 0")
            .execute(pool)
            .await?;
    }
    sqlx::query(
        r#"
        INSERT INTO presets (id, name, config_json, is_default, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            config_json = excluded.config_json,
            is_default = excluded.is_default,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(&preset.id)
    .bind(&preset.name)
    .bind(&json)
    .bind(if is_default { 1_i64 } else { 0_i64 })
    .bind(now_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_presets(pool: &SqlitePool) -> Result<Vec<PresetConfig>> {
    let rows = sqlx::query("SELECT config_json FROM presets ORDER BY is_default DESC, name ASC")
        .fetch_all(pool)
        .await?;
    let mut presets = Vec::with_capacity(rows.len());
    for row in rows {
        let json: String = row.get("config_json");
        presets.push(serde_json::from_str(&json)?);
    }
    Ok(presets)
}

pub async fn get_preset(pool: &SqlitePool, preset_id: &str) -> Result<Option<PresetConfig>> {
    let row = sqlx::query("SELECT config_json FROM presets WHERE id = ?1")
        .bind(preset_id)
        .fetch_optional(pool)
        .await?;
    match row {
        Some(r) => {
            let json: String = r.get("config_json");
            Ok(Some(serde_json::from_str(&json)?))
        }
        None => Ok(None),
    }
}

pub async fn upsert_lecture_and_segments(
    pool: &SqlitePool,
    lecture_id: &str,
    title: &str,
    course: Option<&str>,
    source_hash: &str,
    segments: &[TranscriptSegment],
    materials: &[SupportingMaterialItem],
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        INSERT INTO lectures (id, title, course, source_hash, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            course = excluded.course,
            source_hash = excluded.source_hash
        "#,
    )
    .bind(lecture_id)
    .bind(title)
    .bind(course)
    .bind(source_hash)
    .bind(now_rfc3339())
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM source_segments WHERE lecture_id = ?1")
        .bind(lecture_id)
        .execute(&mut *tx)
        .await?;

    for seg in segments {
        let seg_pk = format!("{lecture_id}::{}", seg.id);
        sqlx::query(
            r#"
            INSERT INTO source_segments
                (id, lecture_id, kind, source_ref, start_ms, end_ms, page_or_slide, section_ref, topic_id, text)
            VALUES (?1, ?2, 'transcript', ?3, ?4, ?5, NULL, NULL, ?6, ?7)
            "#,
        )
        .bind(&seg_pk)
        .bind(lecture_id)
        .bind(&seg.id)
        .bind(seg.start_ms as i64)
        .bind(seg.end_ms as i64)
        .bind(seg.topic_id.as_deref())
        .bind(&seg.text)
        .execute(&mut *tx)
        .await?;
    }

    for mat in materials {
        let mat_pk = format!("{lecture_id}::{}", mat.id);
        sqlx::query(
            r#"
            INSERT INTO source_segments
                (id, lecture_id, kind, source_ref, start_ms, end_ms, page_or_slide, section_ref, topic_id, text)
            VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5, ?6, NULL, ?7)
            "#,
        )
        .bind(&mat_pk)
        .bind(lecture_id)
        .bind(&mat.kind)
        .bind(&mat.source_ref)
        .bind(mat.page_or_slide)
        .bind(mat.section_ref.as_deref())
        .bind(format!("{}: {}", mat.title, mat.text))
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn search_source_segments_fts(
    pool: &SqlitePool,
    query: &str,
    limit: i64,
) -> Result<Vec<SourceSearchHit>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let rows = sqlx::query(
        r#"
        SELECT id AS segment_id, lecture_id, source_ref, text
        FROM source_segments_fts
        WHERE source_segments_fts MATCH ?1
        ORDER BY rank
        LIMIT ?2
        "#,
    )
    .bind(trimmed)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| SourceSearchHit {
            segment_id: r.get("segment_id"),
            lecture_id: r.get("lecture_id"),
            source_ref: r.get("source_ref"),
            text: r.get("text"),
        })
        .collect())
}

pub async fn insert_pipeline_run(pool: &SqlitePool, run: &PipelineRunRecord) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO pipeline_runs
            (id, lecture_id, preset_id, preset_snapshot_json, status, current_stage,
             held_reason, error_message, output_dir, source_hash, settings_hash,
             override_scene_plan_json, metrics_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        "#,
    )
    .bind(&run.id)
    .bind(&run.lecture_id)
    .bind(&run.preset_id)
    .bind(&run.preset_snapshot_json)
    .bind(&run.status)
    .bind(&run.current_stage)
    .bind(&run.held_reason)
    .bind(&run.error_message)
    .bind(&run.output_dir)
    .bind(&run.source_hash)
    .bind(&run.settings_hash)
    .bind(&run.override_scene_plan_json)
    .bind(&run.metrics_json)
    .bind(&run.created_at)
    .bind(&run.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_run_status(
    pool: &SqlitePool,
    run_id: &str,
    status: &str,
    current_stage: Option<&str>,
    held_reason: Option<&str>,
    error_message: Option<&str>,
    metrics_json: Option<&str>,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE pipeline_runs SET
            status = ?2,
            current_stage = ?3,
            held_reason = ?4,
            error_message = ?5,
            metrics_json = COALESCE(?6, metrics_json),
            updated_at = ?7
        WHERE id = ?1
        "#,
    )
    .bind(run_id)
    .bind(status)
    .bind(current_stage)
    .bind(held_reason)
    .bind(error_message)
    .bind(metrics_json)
    .bind(now_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_run_scene_plan_override(
    pool: &SqlitePool,
    run_id: &str,
    scene_plan_json: Option<&str>,
    new_status: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE pipeline_runs SET
            override_scene_plan_json = ?2,
            status = ?3,
            held_reason = NULL,
            error_message = NULL,
            updated_at = ?4
        WHERE id = ?1
        "#,
    )
    .bind(run_id)
    .bind(scene_plan_json)
    .bind(new_status)
    .bind(now_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_pipeline_run(pool: &SqlitePool, run_id: &str) -> Result<Option<PipelineRunRecord>> {
    let row = sqlx::query(
        r#"
        SELECT id, lecture_id, preset_id, preset_snapshot_json, status, current_stage,
               held_reason, error_message, output_dir, source_hash, settings_hash,
               override_scene_plan_json, metrics_json, created_at, updated_at
        FROM pipeline_runs WHERE id = ?1
        "#,
    )
    .bind(run_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| PipelineRunRecord {
        id: r.get("id"),
        lecture_id: r.get("lecture_id"),
        preset_id: r.get("preset_id"),
        preset_snapshot_json: r.get("preset_snapshot_json"),
        status: r.get("status"),
        current_stage: r.get("current_stage"),
        held_reason: r.get("held_reason"),
        error_message: r.get("error_message"),
        output_dir: r.get("output_dir"),
        source_hash: r.get("source_hash"),
        settings_hash: r.get("settings_hash"),
        override_scene_plan_json: r.get("override_scene_plan_json"),
        metrics_json: r.get("metrics_json"),
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    }))
}

pub async fn list_pipeline_runs(pool: &SqlitePool) -> Result<Vec<PipelineRunRecord>> {
    let rows = sqlx::query(
        r#"
        SELECT id, lecture_id, preset_id, preset_snapshot_json, status, current_stage,
               held_reason, error_message, output_dir, source_hash, settings_hash,
               override_scene_plan_json, metrics_json, created_at, updated_at
        FROM pipeline_runs ORDER BY created_at DESC LIMIT 50
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| PipelineRunRecord {
            id: r.get("id"),
            lecture_id: r.get("lecture_id"),
            preset_id: r.get("preset_id"),
            preset_snapshot_json: r.get("preset_snapshot_json"),
            status: r.get("status"),
            current_stage: r.get("current_stage"),
            held_reason: r.get("held_reason"),
            error_message: r.get("error_message"),
            output_dir: r.get("output_dir"),
            source_hash: r.get("source_hash"),
            settings_hash: r.get("settings_hash"),
            override_scene_plan_json: r.get("override_scene_plan_json"),
            metrics_json: r.get("metrics_json"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        })
        .collect())
}

pub async fn get_stage_artifact(
    pool: &SqlitePool,
    run_id: &str,
    stage_name: &str,
) -> Result<Option<(String, String, String)>> {
    let row = sqlx::query(
        "SELECT input_hash, artifact_path, summary_json FROM stage_artifacts WHERE run_id = ?1 AND stage_name = ?2",
    )
    .bind(run_id)
    .bind(stage_name)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| {
        (
            r.get("input_hash"),
            r.get("artifact_path"),
            r.get("summary_json"),
        )
    }))
}

pub async fn upsert_stage_artifact(
    pool: &SqlitePool,
    run_id: &str,
    stage_name: &str,
    input_hash: &str,
    artifact_path: &str,
    summary_json: &str,
) -> Result<()> {
    let id = format!("{run_id}:{stage_name}");
    sqlx::query(
        r#"
        INSERT INTO stage_artifacts (id, run_id, stage_name, input_hash, artifact_path, summary_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(run_id, stage_name) DO UPDATE SET
            input_hash = excluded.input_hash,
            artifact_path = excluded.artifact_path,
            summary_json = excluded.summary_json,
            created_at = excluded.created_at
        "#,
    )
    .bind(id)
    .bind(run_id)
    .bind(stage_name)
    .bind(input_hash)
    .bind(artifact_path)
    .bind(summary_json)
    .bind(now_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn invalidate_stages(
    pool: &SqlitePool,
    run_id: &str,
    stage_names: &[&str],
) -> Result<()> {
    for stage in stage_names {
        sqlx::query("DELETE FROM stage_artifacts WHERE run_id = ?1 AND stage_name = ?2")
            .bind(run_id)
            .bind(stage)
            .execute(pool)
            .await?;
    }
    Ok(())
}

pub async fn get_scene_artifact(
    pool: &SqlitePool,
    cache_key: &str,
) -> Result<Option<(String, u64, u32, String)>> {
    let row = sqlx::query(
        "SELECT artifact_path, duration_ms, frame_count, cues_json FROM scene_artifacts WHERE cache_key = ?1",
    )
    .bind(cache_key)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| {
        (
            r.get("artifact_path"),
            r.get::<i64, _>("duration_ms") as u64,
            r.get::<i64, _>("frame_count") as u32,
            r.get("cues_json"),
        )
    }))
}

pub async fn upsert_scene_artifact(
    pool: &SqlitePool,
    cache_key: &str,
    run_id: &str,
    scene_id: &str,
    kind: &str,
    artifact_path: &str,
    duration_ms: u64,
    frame_count: u32,
    cues_json: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO scene_artifacts (cache_key, run_id, scene_id, kind, artifact_path, duration_ms, frame_count, cues_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(cache_key) DO UPDATE SET
            artifact_path = excluded.artifact_path,
            duration_ms = excluded.duration_ms,
            frame_count = excluded.frame_count,
            cues_json = excluded.cues_json,
            created_at = excluded.created_at
        "#,
    )
    .bind(cache_key)
    .bind(run_id)
    .bind(scene_id)
    .bind(kind)
    .bind(artifact_path)
    .bind(duration_ms as i64)
    .bind(frame_count as i64)
    .bind(cues_json)
    .bind(now_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}
