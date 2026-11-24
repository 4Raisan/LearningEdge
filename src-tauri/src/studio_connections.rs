use std::process::Command;
#[tauri::command]
pub async fn antigravity_status()->Result<bool,String>{
    tokio::task::spawn_blocking(||{
        let mut cmd=Command::new("agy");
        #[cfg(windows)] {use std::os::windows::process::CommandExt;cmd.creation_flags(0x08000000);}
        let out=cmd.arg("models").output().map_err(|e|e.to_string())?;
        Ok(out.status.success() && String::from_utf8_lossy(&out.stdout).to_lowercase().contains("gemini-4-hydrogen-low"))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn agy_models()->Result<Vec<String>,String>{
    tokio::task::spawn_blocking(||{
        let mut cmd=Command::new("agy");
        #[cfg(windows)] {use std::os::windows::process::CommandExt;cmd.creation_flags(0x08000000);}
        let out=cmd.arg("models").output().map_err(|e|e.to_string())?;
        if !out.status.success(){return Err("Antigravity model discovery failed".into())}
        Ok(String::from_utf8_lossy(&out.stdout).lines().filter_map(|line|line.split_once('\t').map(|(id,_)|id.trim().to_owned())).collect())
    }).await.map_err(|e|e.to_string())?
}
