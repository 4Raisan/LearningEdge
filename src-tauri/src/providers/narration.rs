use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

use crate::models::{SceneAudioResult, SentenceCue};
use crate::sidecars;

#[async_trait]
pub trait NarrationProvider: Send + Sync {
    async fn synthesize_scene(
        &self,
        scene_id: &str,
        sentences: &[String],
        out_wav_path: &Path,
        voice: &str,
        rate: i32,
    ) -> Result<SceneAudioResult>;

    async fn synthesize_scene_with_context(
        &self,
        scene_id: &str,
        _scene_index: usize,
        sentences: &[String],
        out_wav_path: &Path,
        voice: &str,
        rate: i32,
    ) -> Result<SceneAudioResult> {
        self.synthesize_scene(scene_id, sentences, out_wav_path, voice, rate)
            .await
    }
}

#[derive(Debug, Clone, Serialize)]
struct SapiJobPayload<'a> {
    wav_path: String,
    voice: &'a str,
    rate: i32,
    sentences: &'a [String],
}

#[derive(Debug, Deserialize)]
struct SapiRawBookmark {
    name: String,
    ms: f64,
}

#[derive(Debug, Deserialize)]
struct SapiScriptOutput {
    bookmarks: Vec<SapiRawBookmark>,
}

fn encode_utf16_base64(script: &str) -> String {
    let utf16: Vec<u8> = script
        .encode_utf16()
        .flat_map(|u| u.to_le_bytes())
        .collect();
    base64_encode(&utf16)
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3f) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((n >> 6) & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(n & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[derive(Debug, Clone, Copy)]
pub struct WavMetadata {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub data_offset: usize,
    pub data_size: usize,
    pub duration_ms: u64,
}

pub fn parse_wav_metadata(bytes: &[u8]) -> Result<WavMetadata> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err(anyhow!("Invalid RIFF/WAVE header"));
    }

    let mut pos = 12usize;
    let mut sample_rate = 0u32;
    let mut channels = 0u16;
    let mut bits_per_sample = 0u16;
    let mut data_offset = 0usize;
    let mut data_size = 0usize;

    while pos + 8 <= bytes.len() {
        let chunk_id = &bytes[pos..pos + 4];
        let chunk_len =
            u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let payload_start = pos + 8;
        if payload_start + chunk_len > bytes.len() {
            break;
        }
        if chunk_id == b"fmt " && chunk_len >= 16 {
            channels = u16::from_le_bytes(bytes[payload_start + 2..payload_start + 4].try_into().unwrap());
            sample_rate = u32::from_le_bytes(bytes[payload_start + 4..payload_start + 8].try_into().unwrap());
            bits_per_sample = u16::from_le_bytes(bytes[payload_start + 14..payload_start + 16].try_into().unwrap());
        } else if chunk_id == b"data" {
            data_offset = payload_start;
            data_size = chunk_len;
        }
        pos = payload_start + chunk_len + (chunk_len % 2);
    }

    if sample_rate == 0 || channels == 0 || bits_per_sample == 0 || data_offset == 0 {
        return Err(anyhow!("Incomplete WAV fmt/data chunks"));
    }

    let bytes_per_sec = sample_rate as u64 * channels as u64 * (bits_per_sample as u64 / 8);
    let duration_ms = if bytes_per_sec > 0 {
        ((data_size as u64) * 1000) / bytes_per_sec
    } else {
        0
    };

    Ok(WavMetadata {
        sample_rate,
        channels,
        bits_per_sample,
        data_offset,
        data_size,
        duration_ms,
    })
}

/// Pads a PCM WAV file with silence up to `target_ms` so video frames and audio align identically.
pub fn pad_wav_to_duration(wav_path: &Path, target_ms: u64) -> Result<u64> {
    let mut bytes = std::fs::read(wav_path)?;
    let meta = parse_wav_metadata(&bytes)?;
    if meta.duration_ms >= target_ms {
        return Ok(meta.duration_ms);
    }

    let bytes_per_sample_frame = (meta.channels as usize) * (meta.bits_per_sample as usize / 8);
    let target_frames = ((meta.sample_rate as u64 * target_ms) + 999) / 1000;
    let target_data_bytes = (target_frames as usize) * bytes_per_sample_frame;
    if target_data_bytes <= meta.data_size {
        return Ok(meta.duration_ms);
    }

    let extra = target_data_bytes - meta.data_size;
    bytes.truncate(meta.data_offset + meta.data_size);
    bytes.resize(meta.data_offset + target_data_bytes, 0u8);

    // Update RIFF total chunk size and `data` chunk size
    let riff_size = (bytes.len() - 8) as u32;
    bytes[4..8].copy_from_slice(&riff_size.to_le_bytes());
    let data_size_offset = meta.data_offset - 4;
    let new_data_size = target_data_bytes as u32;
    bytes[data_size_offset..data_size_offset + 4].copy_from_slice(&new_data_size.to_le_bytes());

    std::fs::write(wav_path, &bytes)?;
    let updated = parse_wav_metadata(&bytes)?;
    let _ = extra;
    Ok(updated.duration_ms)
}

pub fn concat_wav_files(wav_paths: &[std::path::PathBuf], out_path: &Path) -> Result<u64> {
    if wav_paths.is_empty() {
        return Err(anyhow!("Cannot concatenate empty WAV list"));
    }
    let first_bytes = std::fs::read(&wav_paths[0])?;
    let first_meta = parse_wav_metadata(&first_bytes)?;

    let mut all_pcm = Vec::new();
    for p in wav_paths {
        let b = std::fs::read(p)?;
        let m = parse_wav_metadata(&b)?;
        if m.sample_rate != first_meta.sample_rate
            || m.channels != first_meta.channels
            || m.bits_per_sample != first_meta.bits_per_sample
        {
            return Err(anyhow!(
                "WAV format mismatch during concatenation for {}",
                p.display()
            ));
        }
        all_pcm.extend_from_slice(&b[m.data_offset..m.data_offset + m.data_size]);
    }

    let byte_rate = first_meta.sample_rate
        * (first_meta.channels as u32)
        * ((first_meta.bits_per_sample as u32) / 8);
    let block_align = first_meta.channels * (first_meta.bits_per_sample / 8);
    let data_len = all_pcm.len() as u32;
    let riff_len = 36 + data_len;

    let mut out = Vec::with_capacity(44 + all_pcm.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&riff_len.to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&first_meta.channels.to_le_bytes());
    out.extend_from_slice(&first_meta.sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&first_meta.bits_per_sample.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    out.extend_from_slice(&all_pcm);

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(out_path, &out)?;
    Ok(parse_wav_metadata(&out)?.duration_ms)
}

pub fn list_windows_voices() -> Result<Vec<String>> {
    let ps = sidecars::find_powershell_exe()?;
    let script = r#"
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$names = @($s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
$s.Dispose()
$names | ConvertTo-Json -Compress
"#;
    let encoded = encode_utf16_base64(script);
    let out = Command::new(ps)
        .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded])
        .output()
        .context("Failed to execute PowerShell to list SAPI voices")?;

    if !out.status.success() {
        return Err(anyhow!(
            "Failed to list voices: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if raw.is_empty() {
        return Ok(Vec::new());
    }
    if raw.starts_with('[') {
        Ok(serde_json::from_str(&raw)?)
    } else {
        let single: String = serde_json::from_str(&raw)?;
        Ok(vec![single])
    }
}

pub struct WindowsSapiProvider;

#[async_trait]
impl NarrationProvider for WindowsSapiProvider {
    async fn synthesize_scene(
        &self,
        scene_id: &str,
        sentences: &[String],
        out_wav_path: &Path,
        voice: &str,
        rate: i32,
    ) -> Result<SceneAudioResult> {
        if let Some(parent) = out_wav_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let sentences_owned: Vec<String> = if sentences.is_empty() {
            vec![format!("Scene {scene_id}.")]
        } else {
            sentences.to_vec()
        };

        let payload = SapiJobPayload {
            wav_path: out_wav_path.to_string_lossy().to_string(),
            voice,
            rate: rate.clamp(-10, 10),
            sentences: &sentences_owned,
        };
        let payload_json = serde_json::to_string(&payload)?;
        let temp_json = out_wav_path.with_extension("sapi.json");
        tokio::fs::write(&temp_json, payload_json).await?;

        let temp_json_str = temp_json.to_string_lossy().replace('\'', "''");
        let ps = sidecars::find_powershell_exe()?;
        let script = format!(
            r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$cfg = Get-Content -LiteralPath '{temp_json_str}' -Raw | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($cfg.voice -and $cfg.voice.Trim().Length -gt 0) {{
  try {{ $synth.SelectVoice($cfg.voice) }} catch {{}}
}}
$synth.Rate = [int]$cfg.rate
$synth.SetOutputToWaveFile($cfg.wav_path)
$marks = New-Object System.Collections.Generic.List[object]
$synth.add_BookmarkReached({{
  param($sender, $ev)
  $marks.Add([PSCustomObject]@{{ name = $ev.Bookmark; ms = [double]$ev.AudioPosition.TotalMilliseconds }})
}})
$pb = New-Object System.Speech.Synthesis.PromptBuilder
for ($i = 0; $i -lt $cfg.sentences.Count; $i++) {{
  $pb.AppendBookmark("s$i")
  $pb.AppendText([string]$cfg.sentences[$i])
  $pb.AppendBreak([TimeSpan]::FromMilliseconds(180))
}}
$pb.AppendBookmark("__end__")
$synth.Speak($pb)
$synth.SetOutputToNull()
$synth.Dispose()
@{{ bookmarks = $marks }} | ConvertTo-Json -Depth 4 -Compress
"#
        );

        let encoded = encode_utf16_base64(&script);
        let out = tokio::task::spawn_blocking(move || {
            Command::new(ps)
                .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded])
                .output()
        })
        .await??;

        let _ = tokio::fs::remove_file(&temp_json).await;

        if !out.status.success() {
            return Err(anyhow!(
                "Windows SAPI narration failed for {scene_id}: {}",
                String::from_utf8_lossy(&out.stderr)
            ));
        }

        let wav_bytes = tokio::fs::read(out_wav_path)
            .await
            .with_context(|| format!("Missing synthesized WAV at {}", out_wav_path.display()))?;
        let wav_meta = parse_wav_metadata(&wav_bytes)?;
        let duration_ms = wav_meta.duration_ms.max(250);

        let stdout_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let parsed_marks: SapiScriptOutput = if stdout_str.is_empty() {
            SapiScriptOutput {
                bookmarks: Vec::new(),
            }
        } else {
            serde_json::from_str(&stdout_str).unwrap_or(SapiScriptOutput {
                bookmarks: Vec::new(),
            })
        };

        let mut cues = Vec::with_capacity(sentences_owned.len());
        for (idx, sentence_text) in sentences_owned.iter().enumerate() {
            let tag = format!("s{idx}");
            let start_ms = parsed_marks
                .bookmarks
                .iter()
                .find(|b| b.name == tag)
                .map(|b| (b.ms.round() as u64).min(duration_ms))
                .unwrap_or_else(|| ((idx as u64) * duration_ms) / (sentences_owned.len() as u64));

            let next_tag = if idx + 1 < sentences_owned.len() {
                format!("s{}", idx + 1)
            } else {
                "__end__".to_string()
            };
            let end_ms = parsed_marks
                .bookmarks
                .iter()
                .find(|b| b.name == next_tag)
                .map(|b| (b.ms.round() as u64).min(duration_ms))
                .unwrap_or_else(|| {
                    if idx + 1 == sentences_owned.len() {
                        duration_ms
                    } else {
                        (((idx + 1) as u64) * duration_ms) / (sentences_owned.len() as u64)
                    }
                })
                .max(start_ms);

            cues.push(SentenceCue {
                sentence_index: idx,
                text: sentence_text.clone(),
                start_ms,
                end_ms,
            });
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
