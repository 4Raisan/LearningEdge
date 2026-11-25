use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::narration::{concat_wav_files, pad_wav_to_duration, parse_wav_metadata, NarrationProvider};
use crate::models::{SceneAudioResult, SentenceCue};
use crate::sidecars;

const DEFAULT_EDGE_VOICE: &str = "en-US-AvaMultilingualNeural";

/// Neural TTS narration provider backed by Microsoft's Edge Read Aloud service via `edge-tts`,
/// normalized to 48 kHz mono 16-bit PCM WAV with FFmpeg `loudnorm`.
pub struct EdgeTtsProvider {
    ffmpeg: PathBuf,
}

impl EdgeTtsProvider {
    pub fn new(ffmpeg: PathBuf) -> Self {
        Self { ffmpeg }
    }
}

pub fn resolve_voice(voice: &str) -> &str {
    let trimmed = voice.trim();
    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("mixed")
        || trimmed.starts_with("Microsoft ")
    {
        DEFAULT_EDGE_VOICE
    } else {
        trimmed
    }
}

pub fn format_rate(rate: i32) -> String {
    let clamped = rate.clamp(-50, 50);
    format!("{clamped:+}%")
}

fn configure_command(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let _ = cmd;
}

#[async_trait]
impl NarrationProvider for EdgeTtsProvider {
    async fn synthesize_scene(
        &self,
        scene_id: &str,
        sentences: &[String],
        out_wav_path: &Path,
        voice: &str,
        rate: i32,
    ) -> Result<SceneAudioResult> {
        let parent = out_wav_path
            .parent()
            .context("Missing output directory for Edge TTS WAV")?;
        tokio::fs::create_dir_all(parent).await?;

        let (edge_cmd, prefix_args) = sidecars::find_edge_tts_cmd().ok_or_else(|| {
            anyhow!(
                "edge-tts not found. Install it with 'pip install edge-tts' or switch to offline narration."
            )
        })?;

        let sentences_owned: Vec<String> = if sentences.is_empty() {
            vec![format!("Scene {scene_id}.")]
        } else {
            sentences.to_vec()
        };

        let resolved_voice = resolve_voice(voice).to_string();
        let rate_flag = format!("--rate={}", format_rate(rate));
        let temp = tempfile::tempdir_in(parent)?;
        let mut parts = Vec::with_capacity(sentences_owned.len());
        let mut cues = Vec::with_capacity(sentences_owned.len());
        let mut elapsed_ms = 0u64;

        for (sentence_index, text) in sentences_owned.iter().enumerate() {
            let mp3_path = temp.path().join(format!("{sentence_index}.mp3"));
            let raw_wav_path = temp.path().join(format!("{sentence_index}.wav"));

            let cmd_exe = edge_cmd.clone();
            let args_prefix = prefix_args.clone();
            let v = resolved_voice.clone();
            let rf = rate_flag.clone();
            let sentence_text = text.clone();
            let mp3_c = mp3_path.clone();
            let ffmpeg_c = self.ffmpeg.clone();
            let raw_wav_c = raw_wav_path.clone();

            tokio::task::spawn_blocking(move || -> Result<()> {
                let mut last_err = None;
                for attempt in 1..=3 {
                    let mut tts_cmd = Command::new(&cmd_exe);
                    configure_command(&mut tts_cmd);
                    tts_cmd
                        .args(&args_prefix)
                        .arg("--voice")
                        .arg(&v)
                        .arg(&rf)
                        .arg("--text")
                        .arg(&sentence_text)
                        .arg("--write-media")
                        .arg(&mp3_c);
                    match tts_cmd.output() {
                        Ok(out) if out.status.success() => {
                            last_err = None;
                            break;
                        }
                        Ok(out) => {
                            last_err = Some(anyhow!(
                                "edge-tts synthesis failed: {}",
                                String::from_utf8_lossy(&out.stderr).trim()
                            ));
                        }
                        Err(e) => {
                            last_err = Some(anyhow!(
                                "Failed to execute {}: {e}",
                                cmd_exe.display()
                            ));
                        }
                    }
                    if attempt < 3 {
                        std::thread::sleep(std::time::Duration::from_millis(700 * attempt));
                    }
                }
                if let Some(err) = last_err {
                    return Err(err);
                }

                let mut dec_cmd = Command::new(&ffmpeg_c);
                configure_command(&mut dec_cmd);
                let dec_out = dec_cmd
                    .args([
                        "-y",
                        "-loglevel",
                        "error",
                        "-i",
                        &mp3_c.to_string_lossy(),
                        "-ar",
                        "48000",
                        "-ac",
                        "1",
                        "-sample_fmt",
                        "s16",
                        &raw_wav_c.to_string_lossy(),
                    ])
                    .output()
                    .context("Failed to execute ffmpeg to decode Edge TTS MP3")?;
                if !dec_out.status.success() {
                    return Err(anyhow!(
                        "ffmpeg decode failed for Edge TTS MP3: {}",
                        String::from_utf8_lossy(&dec_out.stderr).trim()
                    ));
                }
                Ok(())
            })
            .await??;

            let raw_bytes = tokio::fs::read(&raw_wav_path).await?;
            let meta = parse_wav_metadata(&raw_bytes)?;
            let dur_ms = meta.duration_ms.max(150);
            let start_ms = elapsed_ms;
            let end_ms = start_ms + dur_ms;

            cues.push(SentenceCue {
                sentence_index,
                text: text.clone(),
                start_ms,
                end_ms,
            });

            if sentence_index + 1 < sentences_owned.len() {
                let padded = pad_wav_to_duration(&raw_wav_path, dur_ms + 180)?;
                elapsed_ms += padded;
            } else {
                elapsed_ms += dur_ms;
            }
            parts.push(raw_wav_path);
        }

        let joined_wav = temp.path().join("joined.wav");
        concat_wav_files(&parts, &joined_wav)?;

        let ffmpeg_c = self.ffmpeg.clone();
        let joined_c = joined_wav.clone();
        let out_c = out_wav_path.to_path_buf();
        tokio::task::spawn_blocking(move || -> Result<()> {
            let mut norm_cmd = Command::new(&ffmpeg_c);
            configure_command(&mut norm_cmd);
            let norm_out = norm_cmd
                .args([
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    &joined_c.to_string_lossy(),
                    "-af",
                    "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ar",
                    "48000",
                    "-ac",
                    "1",
                    "-c:a",
                    "pcm_s16le",
                    &out_c.to_string_lossy(),
                ])
                .output()
                .context("Failed to execute ffmpeg loudnorm on Edge TTS narration")?;
            if !norm_out.status.success() {
                return Err(anyhow!(
                    "ffmpeg loudnorm failed: {}",
                    String::from_utf8_lossy(&norm_out.stderr).trim()
                ));
            }
            Ok(())
        })
        .await??;

        let final_bytes = tokio::fs::read(out_wav_path).await?;
        let final_meta = parse_wav_metadata(&final_bytes)?;
        let duration_ms = final_meta.duration_ms.max(250);

        for cue in &mut cues {
            cue.start_ms = cue.start_ms.min(duration_ms);
            cue.end_ms = cue.end_ms.min(duration_ms).max(cue.start_ms);
        }
        if let Some(last) = cues.last_mut() {
            last.end_ms = duration_ms;
        }

        Ok(SceneAudioResult {
            scene_id: scene_id.to_string(),
            wav_path: out_wav_path.to_string_lossy().to_string(),
            duration_ms,
            cues,
            cached: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_voice_handles_empty_mixed_and_sapi_names() {
        assert_eq!(resolve_voice(""), DEFAULT_EDGE_VOICE);
        assert_eq!(resolve_voice("  "), DEFAULT_EDGE_VOICE);
        assert_eq!(resolve_voice("mixed"), DEFAULT_EDGE_VOICE);
        assert_eq!(resolve_voice("Microsoft Zira Desktop"), DEFAULT_EDGE_VOICE);
        assert_eq!(
            resolve_voice("en-GB-SoniaNeural"),
            "en-GB-SoniaNeural"
        );
    }

    #[test]
    fn format_rate_formats_and_clamps_percentages() {
        assert_eq!(format_rate(-4), "-4%");
        assert_eq!(format_rate(0), "+0%");
        assert_eq!(format_rate(10), "+10%");
        assert_eq!(format_rate(-99), "-50%");
        assert_eq!(format_rate(99), "+50%");
    }
}
