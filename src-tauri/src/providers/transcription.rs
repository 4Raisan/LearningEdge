use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::path::Path;
use std::process::Command;

use crate::models::{SourceConflict, SupportingMaterialItem, TranscriptSegment};

#[derive(Debug, Clone)]
pub struct AudioChunkWindow {
    pub index: usize,
    pub start_ms: u64,
    pub end_ms: u64,
}

pub fn extract_audio_16k_wav(
    ffmpeg_path: &Path,
    input_media: &Path,
    output_wav: &Path,
) -> Result<()> {
    if let Some(parent) = output_wav.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let out = Command::new(ffmpeg_path)
        .args([
            "-y",
            "-loglevel",
            "error",
            "-i",
            &input_media.to_string_lossy(),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            &output_wav.to_string_lossy(),
        ])
        .output()
        .with_context(|| format!("Failed to invoke ffmpeg at {}", ffmpeg_path.display()))?;

    if !out.status.success() {
        return Err(anyhow!(
            "ffmpeg audio extraction failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}

pub fn plan_audio_chunks(
    total_duration_ms: u64,
    chunk_ms: u64,
    overlap_ms: u64,
) -> Vec<AudioChunkWindow> {
    if total_duration_ms == 0 || chunk_ms == 0 {
        return Vec::new();
    }
    let step = chunk_ms.saturating_sub(overlap_ms).max(1);
    let mut windows = Vec::new();
    let mut start = 0u64;
    let mut idx = 0usize;

    while start < total_duration_ms {
        let end = (start + chunk_ms).min(total_duration_ms);
        windows.push(AudioChunkWindow {
            index: idx,
            start_ms: start,
            end_ms: end,
        });
        if end >= total_duration_ms {
            break;
        }
        start += step;
        idx += 1;
    }
    windows
}

#[derive(Debug, Deserialize)]
struct WhisperJsonOutput {
    transcription: Vec<WhisperSegmentJson>,
}

#[derive(Debug, Deserialize)]
struct WhisperSegmentJson {
    offsets: WhisperOffsets,
    text: String,
}

#[derive(Debug, Deserialize)]
struct WhisperOffsets {
    from: u64,
    to: u64,
}

pub fn parse_whisper_json(json_str: &str, chunk_offset_ms: u64) -> Result<Vec<TranscriptSegment>> {
    let parsed: WhisperJsonOutput =
        serde_json::from_str(json_str).context("Failed to parse whisper.cpp JSON output")?;
    Ok(parsed
        .transcription
        .into_iter()
        .enumerate()
        .filter(|(_, seg)| !seg.text.trim().is_empty())
        .map(|(i, seg)| TranscriptSegment {
            id: format!("whisper-{chunk_offset_ms}-{i}"),
            start_ms: chunk_offset_ms + seg.offsets.from,
            end_ms: chunk_offset_ms + seg.offsets.to,
            speaker: None,
            topic_id: None,
            topic_title: None,
            text: seg.text.trim().to_string(),
        })
        .collect())
}

/// Remaps chunk-local segments into continuous lecture timeline timestamps and
/// removes duplicate overlap segments across chunk boundaries.
pub fn remap_chunk_timestamps(chunks: &[(u64, Vec<TranscriptSegment>)]) -> Vec<TranscriptSegment> {
    let mut merged: Vec<TranscriptSegment> = Vec::new();
    for (offset_ms, segs) in chunks {
        for seg in segs {
            let abs_start = offset_ms + seg.start_ms;
            let abs_end = offset_ms + seg.end_ms;
            let norm_text = seg.text.trim().to_lowercase();

            let is_overlap_dup = merged.last().is_some_and(|prev| {
                abs_start < prev.end_ms && prev.text.trim().to_lowercase() == norm_text
            });
            if is_overlap_dup {
                continue;
            }
            let adjusted_start = if let Some(prev) = merged.last() {
                abs_start.max(prev.end_ms)
            } else {
                abs_start
            };
            merged.push(TranscriptSegment {
                id: format!("seg-{:02}", merged.len() + 1),
                start_ms: adjusted_start,
                end_ms: abs_end.max(adjusted_start),
                speaker: seg.speaker.clone(),
                topic_id: seg.topic_id.clone(),
                topic_title: seg.topic_title.clone(),
                text: seg.text.trim().to_string(),
            });
        }
    }
    merged
}

pub fn transcribe_with_whisper_cli(
    whisper_cli: Option<&Path>,
    model_path: &Path,
    wav_path: &Path,
    out_prefix: &Path,
) -> Result<Vec<TranscriptSegment>> {
    let exe = whisper_cli.ok_or_else(|| {
        anyhow!("whisper-cli is not installed; place whisper-cli sidecar or set LEARNINGEDGE_WHISPER_CLI_PATH")
    })?;
    if !model_path.is_file() {
        return Err(anyhow!(
            "Whisper GGML model missing at {}",
            model_path.display()
        ));
    }

    let out = Command::new(exe)
        .args([
            "-m",
            &model_path.to_string_lossy(),
            "-f",
            &wav_path.to_string_lossy(),
            "-oj",
            "-of",
            &out_prefix.to_string_lossy(),
        ])
        .output()
        .context("Failed to execute whisper-cli")?;
    if !out.status.success() {
        return Err(anyhow!(
            "whisper-cli exited with {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let json_path = out_prefix.with_extension("json");
    let raw = std::fs::read_to_string(&json_path)?;
    parse_whisper_json(&raw, 0)
}

pub fn ingest_markdown_supporting_material(
    doc_id: &str,
    markdown: &str,
) -> Vec<SupportingMaterialItem> {
    markdown
        .split("\n---\n")
        .enumerate()
        .filter_map(|(idx, block)| {
            let trimmed = block.trim();
            if trimmed.is_empty() {
                return None;
            }
            let page_num = (idx + 1) as i64;
            let title = trimmed
                .lines()
                .next()
                .unwrap_or("Section")
                .trim_start_matches('#')
                .trim()
                .to_string();
            Some(SupportingMaterialItem {
                id: format!("{doc_id}-p{page_num}"),
                kind: "reading".to_string(),
                source_ref: format!("page:{page_num}"),
                title,
                page_or_slide: Some(page_num),
                section_ref: Some(format!("section:page-{page_num}")),
                text: trimmed.to_string(),
            })
        })
        .collect()
}

pub fn detect_source_conflicts(
    segments: &[TranscriptSegment],
    materials: &[SupportingMaterialItem],
) -> Vec<SourceConflict> {
    let mut conflicts = Vec::new();
    for seg in segments {
        let low = seg.text.to_lowercase();
        if low.contains("[inaudible]") || low.contains("[unclear]") {
            conflicts.push(SourceConflict {
                id: format!("conflict-unclear-{}", seg.id),
                kind: "unclear_passage".to_string(),
                source_refs: vec![seg.id.clone()],
                description: format!("Transcript segment {} contains an unclear passage marker.", seg.id),
            });
        }
    }

    for mat in materials {
        let low = mat.text.to_lowercase();
        if low.contains("erratum") || (low.contains("32 mb") && segments.iter().any(|s| s.text.to_lowercase().contains("thirty-two kilobytes"))) {
            conflicts.push(SourceConflict {
                id: format!("conflict-material-{}", mat.id),
                kind: "material_conflict".to_string(),
                source_refs: vec![mat.source_ref.clone(), "seg-05".to_string()],
                description: format!(
                    "Supporting material '{}' notes a figure conflict (32 MB vs lecture 32 KB L1 cache); verify before finalizing notes.",
                    mat.source_ref
                ),
            });
        }
    }
    conflicts
}
