use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use std::path::Path;

use crate::db;
use crate::models::{PreparedSources, SupportingMaterialsFile, TranscriptFixture};
use crate::providers::transcription::detect_source_conflicts;

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

pub async fn prepare_sources_from_files(
    pool: &SqlitePool,
    transcript_path: &Path,
    slides_path: Option<&Path>,
) -> Result<PreparedSources> {
    let transcript_raw = tokio::fs::read_to_string(transcript_path)
        .await
        .with_context(|| format!("Failed to read transcript fixture at {}", transcript_path.display()))?;
    let fixture: TranscriptFixture =
        serde_json::from_str(&transcript_raw).context("Invalid transcript JSON fixture")?;

    let mut materials = Vec::new();
    let mut slides_raw = String::new();
    if let Some(sp) = slides_path {
        if sp.is_file() {
            slides_raw = tokio::fs::read_to_string(sp)
                .await
                .with_context(|| format!("Failed to read slides file at {}", sp.display()))?;
            let mat_file: SupportingMaterialsFile =
                serde_json::from_str(&slides_raw).context("Invalid supporting materials JSON")?;
            materials = mat_file.materials;
        }
    }

    let conflicts = detect_source_conflicts(&fixture.segments, &materials);
    let source_hash = sha256_hex(format!("{transcript_raw}\n---\n{slides_raw}").as_bytes());

    db::upsert_lecture_and_segments(
        pool,
        &fixture.lecture_id,
        &fixture.title,
        fixture.course.as_deref(),
        &source_hash,
        &fixture.segments,
        &materials,
    )
    .await?;

    Ok(PreparedSources {
        lecture_id: fixture.lecture_id,
        title: fixture.title,
        course: fixture.course,
        transcript_segments: fixture.segments,
        supporting_materials: materials,
        conflicts,
        source_hash,
    })
}
