use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::db;
use crate::models::{
    LayoutMetrics, NoteVideoTrace, PresetConfig, ScenePlan, SceneSpec, SentenceCue, TimeRangeMs,
    VerifiedNotes, VideoManifest, VideoSceneEntry,
};
use crate::pipeline::ingest::sha256_hex;
use crate::providers::narration::{concat_wav_files, pad_wav_to_duration, NarrationProvider};
use crate::providers::sfx::mix_scene_sfx;
use crate::sidecars::ToolPaths;

#[derive(Debug, Deserialize)]
struct PaginateScriptOut {
    scenes: Vec<SceneSpec>,
    audits: Vec<PaginateAuditItem>,
}

#[derive(Debug, Deserialize)]
struct PaginateAuditItem {
    scene_id: String,
    metrics: LayoutMetrics,
}

#[derive(Debug, Serialize)]
struct RenderSceneJob<'a> {
    scene: &'a SceneSpec,
    cues: &'a [SentenceCue],
    fps: u32,
    frame_count: u32,
    width: u32,
    height: u32,
    theme: &'a str,
    scene_index: usize,
    scene_total: usize,
    output_mp4: String,
    ffmpeg_path: String,
    show_captions: bool,
    snapshot_dir: Option<String>,
}

pub fn paginate_scenes_with_konva(
    tools: &ToolPaths,
    scenes: &[SceneSpec],
    width: u32,
    height: u32,
    work_dir: &Path,
) -> Result<(Vec<SceneSpec>, HashMap<String, LayoutMetrics>)> {
    std::fs::create_dir_all(work_dir)?;
    let in_path = work_dir.join("paginate_in.json");
    let out_path = work_dir.join("paginate_out.json");
    let payload = serde_json::json!({
        "scenes": scenes,
        "width": width,
        "height": height
    });
    std::fs::write(&in_path, serde_json::to_string_pretty(&payload)?)?;

    let script_path = tools.project_root.join("scripts").join("render-scene.ts");
    let output = Command::new(&tools.node)
        .current_dir(&tools.project_root)
        .arg(&tools.tsx_cli)
        .arg(&script_path)
        .arg("--mode")
        .arg("paginate")
        .arg("--input")
        .arg(&in_path)
        .arg("--output")
        .arg(&out_path)
        .output()
        .context("Failed to execute Konva paginate script")?;

    if !output.status.success() {
        return Err(anyhow!(
            "Konva pagination failed: {}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let raw = std::fs::read_to_string(&out_path)?;
    let parsed: PaginateScriptOut = serde_json::from_str(&raw)?;
    let audits = parsed
        .audits
        .into_iter()
        .map(|a| (a.scene_id, a.metrics))
        .collect();
    Ok((parsed.scenes, audits))
}

fn format_srt_time(ms: u64) -> String {
    let total_secs = ms / 1000;
    let millis = ms % 1000;
    let secs = total_secs % 60;
    let mins = (total_secs / 60) % 60;
    let hours = total_secs / 3600;
    format!("{hours:02}:{mins:02}:{secs:02},{millis:03}")
}

fn build_srt_content(entries: &[VideoSceneEntry]) -> String {
    let mut srt = String::new();
    let mut idx = 1usize;
    for entry in entries {
        for cue in &entry.cues {
            let abs_start = entry.start_ms + cue.start_ms;
            let abs_end = (entry.start_ms + cue.end_ms).max(abs_start + 150);
            srt.push_str(&format!(
                "{idx}\n{} --> {}\n{}\n\n",
                format_srt_time(abs_start),
                format_srt_time(abs_end),
                cue.text.trim()
            ));
            idx += 1;
        }
    }
    srt
}

pub fn ffprobe_media_json(tools: &ToolPaths, media_path: &Path) -> Result<serde_json::Value> {
    let out = Command::new(&tools.ffprobe)
        .args([
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            &media_path.to_string_lossy(),
        ])
        .output()
        .with_context(|| format!("Failed to invoke ffprobe on {}", media_path.display()))?;

    if !out.status.success() {
        return Err(anyhow!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(serde_json::from_slice(&out.stdout)?)
}

pub struct RenderRunStats {
    pub manifest: VideoManifest,
    pub reused_audio_count: usize,
    pub reused_clip_count: usize,
}

pub async fn render_scene_plan_to_video(
    pool: &SqlitePool,
    tools: &ToolPaths,
    narration: &dyn NarrationProvider,
    run_id: &str,
    notes: &VerifiedNotes,
    plan: &ScenePlan,
    preset: &PresetConfig,
    output_dir: &Path,
) -> Result<RenderRunStats> {
    tokio::fs::create_dir_all(output_dir).await?;
    let audio_dir = output_dir.join("audio");
    let clips_dir = output_dir.join("clips");
    tokio::fs::create_dir_all(&audio_dir).await?;
    tokio::fs::create_dir_all(&clips_dir).await?;

    let tools_clone = tools.clone();
    let scenes_clone = plan.scenes.clone();
    let work_dir = output_dir.to_path_buf();
    let width = preset.width;
    let height = preset.height;
    let fps = preset.fps.max(1);

    let (paginated_scenes, audits) = tokio::task::spawn_blocking(move || {
        paginate_scenes_with_konva(&tools_clone, &scenes_clone, width, height, &work_dir)
    })
    .await??;

    // Persist paginated scene plan for UI inspection
    tokio::fs::write(
        output_dir.join("paginated_scene_plan.json"),
        serde_json::to_string_pretty(&ScenePlan {
            lecture_id: plan.lecture_id.clone(),
            title: plan.title.clone(),
            scenes: paginated_scenes.clone(),
        })?,
    )
    .await?;

    struct PreparedScene<'a> {
        scene_idx: usize,
        scene: &'a SceneSpec,
        wav_path: PathBuf,
        frame_count: u32,
        clip_duration_ms: u64,
        cues: Vec<SentenceCue>,
        reused_audio: bool,
        clip_cache_key: String,
        target_clip: PathBuf,
        reused_clip: bool,
    }

    let mut entries = Vec::with_capacity(paginated_scenes.len());
    let mut padded_wavs = Vec::with_capacity(paginated_scenes.len());
    let mut clip_paths = Vec::with_capacity(paginated_scenes.len());
    let mut cursor_ms = 0u64;
    let mut reused_audio_count = 0usize;
    let mut reused_clip_count = 0usize;

    let scene_total = paginated_scenes.len().max(1);
    let mut prepared = Vec::with_capacity(paginated_scenes.len());

    // Phase A: Narration first & audio/clip cache lookup
    for (scene_idx, scene) in paginated_scenes.iter().enumerate() {
        let nar_input = serde_json::json!({
            "scene_id": &scene.scene_id,
            "scene_index": scene_idx,
            "scene_total": scene_total,
            "title": &scene.title,
            "sentences": &scene.narration_sentences,
            "voice": &preset.narration_voice,
            "rate": preset.narration_rate,
            "narration_provider": &preset.narration_provider,
            "sfx_enabled": preset.sfx_enabled,
            "narration_engine": "edge-tts-sfx-v1",
            "model_config": &preset.scene_plan_stage,
            "fps": fps,
        });
        let nar_hash = sha256_hex(serde_json::to_string(&nar_input)?.as_bytes());
        let audio_cache_key = format!("audio:{nar_hash}");

        let cached_audio = match db::get_scene_artifact(pool, &audio_cache_key).await? {
            Some((cached_path, dur_ms, fc, cues_json)) if Path::new(&cached_path).is_file() => {
                let parsed_cues: Vec<SentenceCue> = serde_json::from_str(&cues_json)?;
                reused_audio_count += 1;
                Some((PathBuf::from(cached_path), dur_ms, fc, parsed_cues, true))
            }
            _ => None,
        };

        let (wav_path, raw_duration_ms, frame_count, cues, reused_audio) =
            if let Some(hit) = cached_audio {
                hit
            } else {
                let target_wav = audio_dir.join(format!("{}_{}.wav", scene.scene_id, &nar_hash[..8]));
                let synth = narration
                    .synthesize_scene_with_context(
                        &scene.scene_id,
                        scene_idx,
                        &scene.narration_sentences,
                        &target_wav,
                        &preset.narration_voice,
                        preset.narration_rate,
                    )
                    .await?;
                let fc = (((synth.duration_ms as f64 / 1000.0) * fps as f64).ceil() as u32).max(1);
                let target_ms = (((fc as f64) / (fps as f64)) * 1000.0).round() as u64;
                let padded_ms = pad_wav_to_duration(&target_wav, target_ms)?;
                if preset.sfx_enabled {
                    mix_scene_sfx(
                        &target_wav,
                        scene_idx,
                        scene_total,
                        &synth.cues,
                        &scene.scene_id,
                        &scene.title,
                    )?;
                }
                db::upsert_scene_artifact(
                    pool,
                    &audio_cache_key,
                    run_id,
                    &scene.scene_id,
                    "audio",
                    &target_wav.to_string_lossy(),
                    padded_ms,
                    fc,
                    &serde_json::to_string(&synth.cues)?,
                )
                .await?;
                (target_wav, padded_ms, fc, synth.cues, false)
            };

        let clip_duration_ms = (((frame_count as f64) / (fps as f64)) * 1000.0).round() as u64;
        let _ = raw_duration_ms;

        let clip_input = serde_json::json!({
            "scene": scene,
            "cues": &cues,
            "frame_count": frame_count,
            "fps": fps,
            "width": width,
            "height": height,
            "theme": preset.video_theme,
            "scene_index": scene_idx,
            "scene_total": scene_total,
            "renderer_version": "konva-motion-engine-v6"
        });
        let clip_hash = sha256_hex(serde_json::to_string(&clip_input)?.as_bytes());
        let clip_cache_key = format!("clip:{clip_hash}");

        let (target_clip, reused_clip) = match db::get_scene_artifact(pool, &clip_cache_key).await? {
            Some((path, _, _, _)) if Path::new(&path).is_file() => {
                reused_clip_count += 1;
                (PathBuf::from(path), true)
            }
            _ => (
                clips_dir.join(format!("{}_{}.mp4", scene.scene_id, &clip_hash[..8])),
                false,
            ),
        };

        prepared.push(PreparedScene {
            scene_idx,
            scene,
            wav_path,
            frame_count,
            clip_duration_ms,
            cues,
            reused_audio,
            clip_cache_key,
            target_clip,
            reused_clip,
        });
    }

    // Phase B: Render uncached Konva motion graphics clips in bounded parallel batches
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(3));
    let mut join_set: tokio::task::JoinSet<Result<usize>> = tokio::task::JoinSet::new();
    for p in &prepared {
        if p.reused_clip {
            continue;
        }
        let sem_c = sem.clone();
        let tools_c = tools.clone();
        let scene_c = p.scene.clone();
        let cues_c = p.cues.clone();
        let theme_c = preset.video_theme.clone();
        let target_clip_c = p.target_clip.clone();
        let scene_idx = p.scene_idx;
        let frame_count = p.frame_count;
        join_set.spawn(async move {
            let _permit = sem_c.acquire_owned().await?;
            run_konva_scene_export(
                &tools_c,
                &scene_c,
                &cues_c,
                fps,
                frame_count,
                width,
                height,
                &theme_c,
                scene_idx,
                scene_total,
                &target_clip_c,
            )
            .await?;
            Ok(scene_idx)
        });
    }
    while let Some(res) = join_set.join_next().await {
        res??;
    }

    // Phase C: Persist newly rendered clips & assemble ordered entries
    for p in prepared {
        if !p.reused_clip {
            db::upsert_scene_artifact(
                pool,
                &p.clip_cache_key,
                run_id,
                &p.scene.scene_id,
                "clip",
                &p.target_clip.to_string_lossy(),
                p.clip_duration_ms,
                p.frame_count,
                &serde_json::to_string(&p.cues)?,
            )
            .await?;
        }

        let metrics = audits.get(&p.scene.scene_id).cloned().unwrap_or(LayoutMetrics {
            min_font_size: 18.0,
            max_overlap_count: 0,
            out_of_bounds_count: 0,
        });

        let start_ms = cursor_ms;
        let end_ms = cursor_ms + p.clip_duration_ms;
        cursor_ms = end_ms;

        padded_wavs.push(p.wav_path);
        clip_paths.push(p.target_clip.clone());

        entries.push(VideoSceneEntry {
            scene_id: p.scene.scene_id.clone(),
            base_scene_id: p.scene.base_scene_id.clone(),
            part_index: p.scene.part_index,
            part_total: p.scene.part_total,
            template: p.scene.template.clone(),
            note_point_ids: p.scene.note_point_ids.clone(),
            source_refs: p.scene.source_refs.clone(),
            audio_duration_ms: p.clip_duration_ms,
            frame_count: p.frame_count,
            start_ms,
            end_ms,
            cues: p.cues,
            clip_path: p.target_clip.to_string_lossy().to_string(),
            reused_audio: p.reused_audio,
            reused_clip: p.reused_clip,
            layout_metrics: metrics,
        });
    }

    // 3. Stream-copy concat clips + concatenate WAVs + generate SRT + mux final MP4
    let clips_txt = output_dir.join("clips.txt");
    let concat_lines: Vec<String> = clip_paths
        .iter()
        .map(|p| {
            let rel_or_abs = p.strip_prefix(output_dir).unwrap_or(p.as_path());
            let norm = rel_or_abs.to_string_lossy().replace('\\', "/").replace('\'', "'\\''");
            format!("file '{norm}'")
        })
        .collect();
    tokio::fs::write(&clips_txt, concat_lines.join("\n")).await?;

    let combined_video = output_dir.join("combined_video.mp4");
    let combined_audio = output_dir.join("combined_audio.wav");
    let captions_srt = output_dir.join("explainer.srt");
    let final_mp4 = output_dir.join("explainer.mp4");

    let srt_content = build_srt_content(&entries);
    tokio::fs::write(&captions_srt, srt_content).await?;

    let wavs_clone = padded_wavs.clone();
    let combined_audio_clone = combined_audio.clone();
    tokio::task::spawn_blocking(move || concat_wav_files(&wavs_clone, &combined_audio_clone))
        .await??;

    let ffmpeg = tools.ffmpeg.clone();
    let clips_txt_c = clips_txt.clone();
    let combined_video_c = combined_video.clone();
    let combined_audio_c = combined_audio.clone();
    let captions_srt_c = captions_srt.clone();
    let final_mp4_c = final_mp4.clone();

    tokio::task::spawn_blocking(move || -> Result<()> {
        let concat_out = Command::new(&ffmpeg)
            .args([
                "-y",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                &clips_txt_c.to_string_lossy(),
                "-c:v",
                "copy",
                &combined_video_c.to_string_lossy(),
            ])
            .output()?;
        if !concat_out.status.success() {
            return Err(anyhow!(
                "ffmpeg stream-copy concat failed: {}",
                String::from_utf8_lossy(&concat_out.stderr)
            ));
        }

        let mux_out = Command::new(&ffmpeg)
            .args([
                "-y",
                "-loglevel",
                "error",
                "-i",
                &combined_video_c.to_string_lossy(),
                "-i",
                &combined_audio_c.to_string_lossy(),
                "-i",
                &captions_srt_c.to_string_lossy(),
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-map",
                "2:s:0",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-c:s",
                "mov_text",
                "-metadata:s:s:0",
                "language=eng",
                "-movflags",
                "+faststart",
                &final_mp4_c.to_string_lossy(),
            ])
            .output()?;
        if !mux_out.status.success() {
            return Err(anyhow!(
                "ffmpeg final mux failed: {}",
                String::from_utf8_lossy(&mux_out.stderr)
            ));
        }
        Ok(())
    })
    .await??;

    // 4. Verify exported video streams using ffprobe
    let tools_probe = tools.clone();
    let final_mp4_probe = final_mp4.clone();
    let probe = tokio::task::spawn_blocking(move || ffprobe_media_json(&tools_probe, &final_mp4_probe))
        .await??;
    let streams = probe["streams"]
        .as_array()
        .ok_or_else(|| anyhow!("ffprobe returned no streams for {}", final_mp4.display()))?;
    let has_video = streams.iter().any(|s| s["codec_type"] == "video");
    let has_audio = streams.iter().any(|s| s["codec_type"] == "audio");
    let has_sub = streams.iter().any(|s| s["codec_type"] == "subtitle");
    if !has_video || !has_audio || !has_sub {
        return Err(anyhow!(
            "Exported video missing required streams (video={has_video}, audio={has_audio}, subtitle={has_sub})"
        ));
    }

    // 5. Build end-to-end source -> note -> video timestamp traceability index
    let media = final_mp4.clone();
    let ffmpeg = tools.ffmpeg.clone();
    let exported = tokio::task::spawn_blocking(move || Command::new(ffmpeg)
        .arg("-v").arg("error").arg("-i").arg(media)
        .args(["-map", "0:s:0", "-f", "srt", "pipe:1"]).output()).await??;
    if !exported.status.success() { return Err(anyhow!("Could not read the exported caption track.")); }
    let subtitles = String::from_utf8(exported.stdout)?.replace("\r\n", "\n");
    let actual: Vec<_> = subtitles.trim().split("\n\n")
        .flat_map(|cue| cue.lines().skip(2)).flat_map(str::split_whitespace).collect();
    let expected: Vec<_> = entries.iter().flat_map(|scene| &scene.cues)
        .flat_map(|cue| cue.text.split_whitespace()).collect();
    if actual != expected { return Err(anyhow!("Exported captions differ from the timed narration script.")); }
    let mut trace_index = Vec::with_capacity(notes.points.len());
    for pt in &notes.points {
        let matching: Vec<&VideoSceneEntry> = entries
            .iter()
            .filter(|e| e.note_point_ids.contains(&pt.id))
            .collect();
        if pt.required && !matching.iter().any(|scene| scene.end_ms > scene.start_ms) {
            return Err(anyhow!("Required concept '{}' has no timed segment in the export.", pt.title));
        }
        let scene_ids = matching.iter().map(|e| e.scene_id.clone()).collect();
        let video_segments = matching
            .iter()
            .map(|e| TimeRangeMs {
                scene_id: e.scene_id.clone(),
                start_ms: e.start_ms,
                end_ms: e.end_ms,
            })
            .collect();

        trace_index.push(NoteVideoTrace {
            note_point_id: pt.id.clone(),
            note_title: pt.title.clone(),
            source_refs: pt.source_refs.clone(),
            scene_ids,
            video_segments,
        });
    }

    let manifest = VideoManifest {
        run_id: run_id.to_string(),
        lecture_id: notes.lecture_id.clone(),
        video_path: final_mp4.to_string_lossy().to_string(),
        captions_path: captions_srt.to_string_lossy().to_string(),
        fps,
        width,
        height,
        total_duration_ms: cursor_ms,
        scenes: entries,
        trace_index,
    };

    tokio::fs::write(
        output_dir.join("video_manifest.json"),
        serde_json::to_string_pretty(&manifest)?,
    )
    .await?;

    Ok(RenderRunStats {
        manifest,
        reused_audio_count,
        reused_clip_count,
    })
}

async fn run_konva_scene_export(
    tools: &ToolPaths,
    scene: &SceneSpec,
    cues: &[SentenceCue],
    fps: u32,
    frame_count: u32,
    width: u32,
    height: u32,
    theme: &str,
    scene_index: usize,
    scene_total: usize,
    output_mp4: &Path,
) -> Result<()> {
    let job_path = output_mp4.with_extension("render_job.json");
    let job = RenderSceneJob {
        scene,
        cues,
        fps,
        frame_count,
        width,
        height,
        theme,
        scene_index,
        scene_total,
        output_mp4: output_mp4.to_string_lossy().to_string(),
        ffmpeg_path: tools.ffmpeg.to_string_lossy().to_string(),
        show_captions: false,
        snapshot_dir: Some(output_mp4.with_extension("review").to_string_lossy().into_owned()),
    };
    tokio::fs::write(&job_path, serde_json::to_string_pretty(&job)?).await?;

    let tools_c = tools.clone();
    let job_path_c = job_path.clone();
    let out = tokio::task::spawn_blocking(move || {
        let script = tools_c.project_root.join("scripts").join("render-scene.ts");
        Command::new(&tools_c.node)
            .current_dir(&tools_c.project_root)
            .arg("--expose-gc")
            .arg(&tools_c.tsx_cli)
            .arg(&script)
            .arg("--mode")
            .arg("render")
            .arg("--input")
            .arg(&job_path_c)
            .output()
    })
    .await??;

    let _ = tokio::fs::remove_file(&job_path).await;

    if !out.status.success() {
        return Err(anyhow!(
            "Konva clip export failed for '{}': {}\n{}",
            scene.scene_id,
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(())
}
