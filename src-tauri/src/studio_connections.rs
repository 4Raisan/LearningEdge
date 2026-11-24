use crate::{commands::AppState, models::VerifiedNotes, pipeline::ingest::sha256_hex, providers::text::ConceptTextProvider};
use serde_json::{json, Value};
use std::{path::PathBuf,process::Command};
use tauri::State;
use super::Choice;

pub(super) fn hosted_endpoint(raw: &str) -> Result<String,String> {
    let url=reqwest::Url::parse(raw.trim()).map_err(|_|"Invalid API base URL")?;
    let loopback=matches!(url.host_str(),Some("localhost"|"127.0.0.1"|"[::1]"));
    if !(url.scheme()=="https" || loopback && url.scheme()=="http") || url.host().is_none() ||
        !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("Use an HTTPS API base URL, or HTTP on localhost.".into())
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}
pub(super) fn hosted_ref(base:&str)->String {format!("hosted-{}",sha256_hex(base.as_bytes()))}

#[tauri::command]
pub fn hosted_key(endpoint:String,key:String)->Result<(),String>{
    crate::credentials::store_secret(&hosted_ref(&hosted_endpoint(&endpoint)?),&key).map_err(|e|e.to_string())
}
#[tauri::command]
pub async fn studio_verify(choice:Choice)->Result<(),String>{
    let result=ConceptTextProvider::new(choice.config()?).chat_json("Reply only with the JSON object {\"available\":true}. Do not use tools.", "{}").await.map_err(|e|e.to_string())?;
    if result["available"]!=true {return Err("Model did not return the required structured response.".into())}
    Ok(())
}
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
pub async fn hosted_models(endpoint:String)->Result<Vec<String>,String>{
    let base=hosted_endpoint(&endpoint)?;
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::none()).build().map_err(|e|e.to_string())?;
    let mut request=client.get(format!("{base}/models"));
    if let Ok(token)=crate::credentials::get_secret(&hosted_ref(&base)){request=request.bearer_auth(token);}
    let body:Value=request.send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
    Ok(body["data"].as_array().ok_or("Endpoint did not return a model list")?.iter().filter_map(|m|m["id"].as_str().map(str::to_owned)).collect())
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
