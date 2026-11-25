use anyhow::{ensure, Result};
use std::f64::consts::PI;
use std::path::Path;

use super::narration::parse_wav_metadata;
use crate::models::SentenceCue;

const WARNING_KEYWORDS: &[&str] = &[
    "fail",
    "warn",
    "error",
    "pitfall",
    "danger",
    "force-push",
    "conflict",
    "mistake",
];

#[derive(Clone, Copy)]
enum WaveKind {
    Sine,
    Triangle,
}

/// Synthesizes a subtle scene transition whoosh and cue tones directly into the scene's 16-bit PCM WAV.
pub fn mix_scene_sfx(
    wav_path: &Path,
    scene_index: usize,
    scene_total: usize,
    cues: &[SentenceCue],
    scene_id: &str,
    title: &str,
) -> Result<()> {
    let mut bytes = std::fs::read(wav_path)?;
    let meta = parse_wav_metadata(&bytes)?;
    ensure!(
        meta.bits_per_sample == 16 && meta.channels > 0 && meta.sample_rate > 0,
        "SFX mixer requires 16-bit PCM WAV audio"
    );

    let channels = meta.channels as usize;
    let total_frames = meta.data_size / (channels * 2);
    if total_frames == 0 {
        return Ok(());
    }

    let sr = meta.sample_rate as f64;
    let mut mono_sfx = vec![0.0_f64; total_frames];

    // 1. Scene transition whoosh: white noise swept 400 -> 3200 Hz through a bandpass filter.
    add_bandpass_whoosh(&mut mono_sfx, sr, 0.0, 0.22, 400.0, 3200.0, 0.14);

    // 2. Scene cue tones: warning triangle tones, intro/outro arpeggios, or pentatonic cue ticks.
    let lower_id = scene_id.to_ascii_lowercase();
    let lower_title = title.to_ascii_lowercase();
    let is_warning = WARNING_KEYWORDS
        .iter()
        .any(|kw| lower_id.contains(kw) || lower_title.contains(kw));

    if is_warning {
        let pitches = [220.0, 196.0, 233.08];
        if cues.is_empty() {
            add_tone(&mut mono_sfx, sr, 0.18, 0.14, pitches[0], 0.12, WaveKind::Triangle);
        } else {
            for (idx, cue) in cues.iter().enumerate() {
                let at_s = (cue.start_ms as f64) / 1000.0;
                add_tone(
                    &mut mono_sfx,
                    sr,
                    at_s,
                    0.14,
                    pitches[idx % pitches.len()],
                    0.12,
                    WaveKind::Triangle,
                );
            }
        }
    } else if scene_index == 0 {
        for (at_s, freq) in [(0.18, 523.25), (0.29, 659.25), (0.40, 783.99)] {
            add_tone(&mut mono_sfx, sr, at_s, 0.12, freq, 0.11, WaveKind::Sine);
        }
    } else if scene_total > 1 && scene_index + 1 == scene_total {
        for (at_s, freq) in [(0.18, 783.99), (0.30, 659.25), (0.42, 523.25)] {
            add_tone(&mut mono_sfx, sr, at_s, 0.14, freq, 0.11, WaveKind::Sine);
        }
    } else {
        let pitches = [523.25, 659.25, 783.99];
        for (idx, cue) in cues.iter().enumerate() {
            let at_s = (cue.start_ms as f64) / 1000.0;
            add_tone(
                &mut mono_sfx,
                sr,
                at_s,
                0.12,
                pitches[idx % pitches.len()],
                0.10,
                WaveKind::Sine,
            );
        }
    }

    let data_slice = &mut bytes[meta.data_offset..meta.data_offset + meta.data_size];
    for (frame_idx, sfx_sample) in mono_sfx.iter().enumerate() {
        for ch in 0..channels {
            let byte_idx = (frame_idx * channels + ch) * 2;
            let orig = i16::from_le_bytes([data_slice[byte_idx], data_slice[byte_idx + 1]]) as f64
                / 32768.0;
            let mixed = (orig + *sfx_sample).clamp(-1.0, 1.0);
            let out_i16 = (mixed * 32767.0).round().clamp(-32768.0, 32767.0) as i16;
            let le = out_i16.to_le_bytes();
            data_slice[byte_idx] = le[0];
            data_slice[byte_idx + 1] = le[1];
        }
    }

    std::fs::write(wav_path, &bytes)?;
    Ok(())
}

fn add_bandpass_whoosh(
    buf: &mut [f64],
    sr: f64,
    start_s: f64,
    dur_s: f64,
    f_start: f64,
    f_end: f64,
    gain: f64,
) {
    let start_idx = (start_s * sr).round() as usize;
    let len = (dur_s * sr).round() as usize;
    if start_idx >= buf.len() || len == 0 {
        return;
    }

    let q = 2.0_f64;
    let mut x1 = 0.0_f64;
    let mut x2 = 0.0_f64;
    let mut y1 = 0.0_f64;
    let mut y2 = 0.0_f64;
    let mut seed: u64 = 0x5EED_CAFE_BABE_1234;

    let end_idx = (start_idx + len).min(buf.len());
    for i in 0..(end_idx - start_idx) {
        let progress = (i as f64) / (len as f64);
        let freq = f_start + (f_end - f_start) * progress;
        let w0 = 2.0 * PI * freq / sr;
        let alpha = w0.sin() / (2.0 * q);
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * w0.cos();
        let a2 = 1.0 - alpha;

        // Deterministic LCG white noise in [-1.0, 1.0]
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let x0 = (((seed >> 33) as f64) / (u32::MAX as f64 / 2.0)) - 1.0;

        let y0 = (alpha * x0 - alpha * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;

        let env = (PI * progress).sin();
        buf[start_idx + i] += y0 * env * gain;
    }
}

fn add_tone(
    buf: &mut [f64],
    sr: f64,
    start_s: f64,
    dur_s: f64,
    freq: f64,
    gain: f64,
    kind: WaveKind,
) {
    let start_idx = (start_s * sr).round() as usize;
    let len = (dur_s * sr).round() as usize;
    if start_idx >= buf.len() || len == 0 {
        return;
    }
    let attack_samples = (0.005 * sr).max(1.0);
    let end_idx = (start_idx + len).min(buf.len());
    for i in 0..(end_idx - start_idx) {
        let t = (i as f64) / sr;
        let attack = ((i as f64) / attack_samples).min(1.0);
        let env = attack * (-t * 24.0).exp();
        let phase = freq * t;
        let wave = match kind {
            WaveKind::Sine => (2.0 * PI * phase).sin(),
            WaveKind::Triangle => {
                let frac = phase.fract();
                4.0 * (frac - 0.5).abs() - 1.0
            }
        };
        buf[start_idx + i] += wave * env * gain;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_silent_wav(path: &Path, sample_rate: u32, duration_ms: u64) {
        let total_frames = ((sample_rate as u64 * duration_ms) / 1000) as usize;
        let data_bytes = (total_frames * 2) as u32;
        let riff_size = 36 + data_bytes;
        let mut out = Vec::with_capacity(44 + data_bytes as usize);
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&riff_size.to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&sample_rate.to_le_bytes());
        out.extend_from_slice(&(sample_rate * 2).to_le_bytes());
        out.extend_from_slice(&2u16.to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_bytes.to_le_bytes());
        out.resize(44 + data_bytes as usize, 0);
        std::fs::write(path, out).unwrap();
    }

    #[test]
    fn mix_scene_sfx_preserves_duration_and_synthesizes_without_clipping() {
        let dir = tempfile::tempdir().unwrap();
        let cues = vec![
            SentenceCue {
                sentence_index: 0,
                text: "First sentence.".into(),
                start_ms: 150,
                end_ms: 900,
            },
            SentenceCue {
                sentence_index: 1,
                text: "Second sentence.".into(),
                start_ms: 1000,
                end_ms: 1800,
            },
        ];

        for (idx, total, id, title) in [
            (0, 4, "intro", "Introduction"),
            (1, 4, "concept-1", "Core Mechanism"),
            (2, 4, "force-push-warn", "Pitfalls and Warnings"),
            (3, 4, "outro", "Summary"),
        ] {
            let wav = dir.path().join(format!("{id}.wav"));
            write_silent_wav(&wav, 48000, 2000);
            mix_scene_sfx(&wav, idx, total, &cues, id, title).unwrap();
            let bytes = std::fs::read(&wav).unwrap();
            let meta = parse_wav_metadata(&bytes).unwrap();
            assert_eq!(meta.duration_ms, 2000);
            assert_eq!(meta.sample_rate, 48000);
            let samples: Vec<i16> = bytes[meta.data_offset..meta.data_offset + meta.data_size]
                .chunks_exact(2)
                .map(|c| i16::from_le_bytes([c[0], c[1]]))
                .collect();
            let peak = samples.iter().map(|s| s.unsigned_abs()).max().unwrap_or(0);
            assert!(peak > 500, "expected audible SFX peak for {id}, got {peak}");
            assert!(peak < 32000, "expected non-clipping SFX peak for {id}, got {peak}");
        }
    }
}
