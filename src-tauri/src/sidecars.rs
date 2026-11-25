use anyhow::{anyhow, Context, Result};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct ToolPaths {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub whisper_cli: Option<PathBuf>,
    pub node: PathBuf,
    pub tsx_cli: PathBuf,
    pub project_root: PathBuf,
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let candidates: Vec<String> = if cfg!(windows) {
        if name.ends_with(".exe") {
            vec![name.to_string()]
        } else {
            vec![format!("{name}.exe"), name.to_string()]
        }
    } else {
        vec![name.to_string()]
    };

    for dir in std::env::split_paths(&path_var) {
        for cand in &candidates {
            let full = dir.join(cand);
            if full.is_file() {
                return Some(full);
            }
        }
    }
    None
}

fn find_sidecar(base_name: &str, env_var: &str) -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var(env_var) {
        let p = PathBuf::from(explicit);
        if p.is_file() {
            return Some(p);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let triple_name = if cfg!(windows) {
                format!("{base_name}-x86_64-pc-windows-msvc.exe")
            } else {
                base_name.to_string()
            };
            for cand in [
                dir.join(format!("{base_name}.exe")),
                dir.join(&triple_name),
                dir.join("binaries").join(&triple_name),
            ] {
                if cand.is_file() {
                    return Some(cand);
                }
            }
        }
    }

    find_in_path(base_name)
}

pub fn discover_project_root() -> Result<PathBuf> {
    if let Ok(explicit) = std::env::var("LEARNINGEDGE_ROOT") {
        let p = PathBuf::from(explicit);
        if p.join("scripts").join("render-scene.ts").is_file() {
            return Ok(p);
        }
    }

    let mut cur = std::env::current_dir()?;
    for _ in 0..6 {
        if cur.join("scripts").join("render-scene.ts").is_file() {
            return Ok(cur);
        }
        if !cur.pop() {
            break;
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(parent) = manifest_dir.parent() {
        if parent.join("scripts").join("render-scene.ts").is_file() {
            return Ok(parent.to_path_buf());
        }
    }

    Err(anyhow!(
        "Could not locate LearningEdge project root containing scripts/render-scene.ts"
    ))
}

pub fn resolve_tools(project_root: Option<&Path>) -> Result<ToolPaths> {
    let root = match project_root {
        Some(p) => p.to_path_buf(),
        None => discover_project_root()?,
    };

    let ffmpeg = find_sidecar("ffmpeg", "LEARNINGEDGE_FFMPEG_PATH")
        .ok_or_else(|| anyhow!("ffmpeg executable not found in sidecars or PATH"))?;
    let ffprobe = find_sidecar("ffprobe", "LEARNINGEDGE_FFPROBE_PATH")
        .ok_or_else(|| anyhow!("ffprobe executable not found in sidecars or PATH"))?;
    let whisper_cli = find_sidecar("whisper-cli", "LEARNINGEDGE_WHISPER_CLI_PATH");

    let node = find_sidecar("node", "LEARNINGEDGE_NODE_PATH")
        .ok_or_else(|| anyhow!("node executable not found on PATH"))?;
    let tsx_cli = root.join("node_modules").join("tsx").join("dist").join("cli.mjs");
    if !tsx_cli.is_file() {
        return Err(anyhow!(
            "tsx CLI missing at {} — run pnpm install first",
            tsx_cli.display()
        ));
    }

    Ok(ToolPaths {
        ffmpeg,
        ffprobe,
        whisper_cli,
        node,
        tsx_cli,
        project_root: root,
    })
}

pub fn find_powershell_exe() -> Result<PathBuf> {
    find_in_path("pwsh")
        .or_else(|| find_in_path("powershell"))
        .context("Neither pwsh nor powershell.exe found on PATH")
}

/// Resolves `edge-tts` executable or falls back to `python -m edge_tts`.
pub fn find_edge_tts_cmd() -> Option<(PathBuf, Vec<String>)> {
    if let Some(exe) = find_sidecar("edge-tts", "LEARNINGEDGE_EDGE_TTS_PATH") {
        return Some((exe, Vec::new()));
    }
    if let Some(py) = find_in_path("python").or_else(|| find_in_path("python3")) {
        return Some((py, vec!["-m".to_string(), "edge_tts".to_string()]));
    }
    None
}
