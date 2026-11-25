#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use flate2::read::GzDecoder;
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::process::Command;

const MAGIC: &[u8; 8] = b"LEPORT01";
const TRAILER_LEN: u64 = 32;

fn cache_base_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|p| p.join("LearningEdge").join("portable"))
        .unwrap_or_else(|| std::env::temp_dir().join("LearningEdge-portable"))
}

fn sanitize_rel_path(raw: &str) -> io::Result<PathBuf> {
    if raw.is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Empty archive path"));
    }
    let mut out = PathBuf::new();
    for seg in raw.split(['/', '\\']) {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." || seg.contains(':') {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Unsafe archive path: {raw}"),
            ));
        }
        let p = Path::new(seg);
        for comp in p.components() {
            match comp {
                Component::Normal(c) => out.push(c),
                _ => {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!("Unsafe path component: {raw}"),
                    ));
                }
            }
        }
    }
    if out.as_os_str().is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Invalid archive path: {raw}"),
        ));
    }
    Ok(out)
}

fn read_exact_or_eof<R: Read>(r: &mut R, buf: &mut [u8]) -> io::Result<bool> {
    let mut read = 0;
    while read < buf.len() {
        match r.read(&mut buf[read..])? {
            0 => {
                if read == 0 {
                    return Ok(false);
                }
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "Truncated archive header",
                ));
            }
            n => read += n,
        }
    }
    Ok(true)
}

fn extract_payload(exe_path: &Path, cache_dir: &Path) -> io::Result<()> {
    let mut file = File::open(exe_path)?;
    let total_len = file.metadata()?.len();
    if total_len < TRAILER_LEN {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Executable is missing portable payload trailer",
        ));
    }

    file.seek(SeekFrom::End(-(TRAILER_LEN as i64)))?;
    let mut trailer = [0u8; 32];
    file.read_exact(&mut trailer)?;
    if &trailer[24..32] != MAGIC {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid portable trailer magic",
        ));
    }

    let payload_len = u64::from_le_bytes(trailer[0..8].try_into().unwrap());
    let payload_offset = total_len
        .checked_sub(TRAILER_LEN + payload_len)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "Corrupt payload length"))?;

    if cache_dir.join(".ready").is_file() {
        return Ok(());
    }

    let parent = cache_dir
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::Other, "Invalid cache directory"))?;
    fs::create_dir_all(parent)?;

    let tag = cache_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("app");
    let tmp_dir = parent.join(format!("{tag}.tmp"));
    let _ = fs::remove_dir_all(&tmp_dir);
    fs::create_dir_all(&tmp_dir)?;

    file.seek(SeekFrom::Start(payload_offset))?;
    let limited = BufReader::new(file.take(payload_len));
    let mut gz = GzDecoder::new(limited);

    let mut path_len_buf = [0u8; 4];
    let mut file_len_buf = [0u8; 8];
    while read_exact_or_eof(&mut gz, &mut path_len_buf)? {
        let path_len = u32::from_le_bytes(path_len_buf) as usize;
        if path_len == 0 || path_len > 4096 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Invalid entry path length: {path_len}"),
            ));
        }
        let mut path_bytes = vec![0u8; path_len];
        gz.read_exact(&mut path_bytes)?;
        let rel_str = String::from_utf8(path_bytes)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        let rel_path = sanitize_rel_path(&rel_str)?;

        gz.read_exact(&mut file_len_buf)?;
        let entry_len = u64::from_le_bytes(file_len_buf);

        let dest = tmp_dir.join(rel_path);
        if let Some(p) = dest.parent() {
            fs::create_dir_all(p)?;
        }
        let out_file = File::create(&dest)?;
        let mut writer = BufWriter::new(out_file);
        let copied = io::copy(&mut (&mut gz).take(entry_len), &mut writer)?;
        if copied != entry_len {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                format!("Truncated entry {rel_str}"),
            ));
        }
    }

    fs::write(tmp_dir.join(".ready"), b"ok")?;
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(cache_dir);
    }
    if let Err(e) = fs::rename(&tmp_dir, cache_dir) {
        if !cache_dir.join(".ready").is_file() {
            return Err(e);
        }
        let _ = fs::remove_dir_all(&tmp_dir);
    }
    Ok(())
}

fn read_tag(exe_path: &Path) -> io::Result<String> {
    let mut file = File::open(exe_path)?;
    let total_len = file.metadata()?.len();
    if total_len < TRAILER_LEN {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Executable is missing portable payload trailer",
        ));
    }
    file.seek(SeekFrom::End(-(TRAILER_LEN as i64)))?;
    let mut trailer = [0u8; 32];
    file.read_exact(&mut trailer)?;
    if &trailer[24..32] != MAGIC {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid portable trailer magic",
        ));
    }
    let tag = std::str::from_utf8(&trailer[8..24])
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    if !tag
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid portable version tag",
        ));
    }
    Ok(tag.to_string())
}

fn run() -> io::Result<()> {
    let exe_path = std::env::current_exe()?;
    let tag = read_tag(&exe_path)?;
    let cache_dir = cache_base_dir().join(&tag);

    if !cache_dir.join(".ready").is_file() {
        extract_payload(&exe_path, &cache_dir)?;
    }

    let app_exe = cache_dir.join("learningedge.exe");
    let mut cmd = Command::new(&app_exe);
    cmd.current_dir(&cache_dir)
        .args(std::env::args_os().skip(1))
        .env("LEARNINGEDGE_ROOT", &cache_dir)
        .env("LEARNINGEDGE_FFMPEG_PATH", cache_dir.join("ffmpeg.exe"))
        .env("LEARNINGEDGE_FFPROBE_PATH", cache_dir.join("ffprobe.exe"))
        .env("LEARNINGEDGE_NODE_PATH", cache_dir.join("node.exe"));

    cmd.spawn()?;
    Ok(())
}

fn main() {
    if let Err(err) = run() {
        eprintln!("LearningEdge Portable launch failed: {err}");
        std::process::exit(1);
    }
}
