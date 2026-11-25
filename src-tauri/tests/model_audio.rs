use base64::{engine::general_purpose::STANDARD, Engine};
use learningedge_lib::{
    models::StageProviderConfig,
    providers::{model_audio::ModelAudio, narration::NarrationProvider},
};
use serde_json::json;
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    thread,
};

#[tokio::test]
async fn selected_model_audio_drives_cues_and_rejects_transcript_drift() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!("http://{}/v1", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        for (transcript, ms) in [
            ("Heat flows.", 100u32),
            ("Ice melts.", 200),
            ("Wrong sentence.", 100),
        ] {
            let (mut socket, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(&socket);
            let mut headers = String::new();
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line.trim().is_empty() {
                    break;
                }
                headers.push_str(&line.to_lowercase());
            }
            assert!(headers.starts_with("post /v1/chat/completions "));

            let length = headers
                .lines()
                .find_map(|l| l.strip_prefix("content-length: "))
                .unwrap()
                .parse()
                .unwrap();
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&body).unwrap()["model"],
                "test-model"
            );
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&body).unwrap()["modalities"],
                json!(["text", "audio"])
            );
            let size = ms * 16;
            let mut wav = b"RIFF".to_vec();
            wav.extend((36 + size).to_le_bytes());
            wav.extend(b"WAVEfmt ");
            wav.extend(16u32.to_le_bytes());
            wav.extend(1u16.to_le_bytes());
            wav.extend(1u16.to_le_bytes());
            wav.extend(8000u32.to_le_bytes());
            wav.extend(16000u32.to_le_bytes());
            wav.extend(2u16.to_le_bytes());
            wav.extend(16u16.to_le_bytes());
            wav.extend(b"data");
            wav.extend(size.to_le_bytes());
            wav.resize(44 + size as usize, 0);
            let reply=json!({"choices":[{"message":{"audio":{"transcript":transcript,"data":STANDARD.encode(wav)}}}]}).to_string();
            write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",reply.len(),reply).unwrap();
        }
    });
    let config: StageProviderConfig = serde_json::from_value(
        json!({"model":"test-model","provider":"open_ai","thinking":"off","base_url":endpoint}),
    )
    .unwrap();
    let dir = tempfile::tempdir().unwrap();
    let model = ModelAudio::new(&config, true).unwrap();
    let result = model
        .synthesize_scene(
            "scene",
            &["Heat flows.".into(), "Ice melts.".into()],
            &dir.path().join("scene.wav"),
            "",
            0,
        )
        .await
        .unwrap();
    assert_eq!(result.duration_ms, 300);
    assert_eq!(result.cues[1].start_ms, 100);
    assert!(model
        .synthesize_scene(
            "bad",
            &["Approved words.".into()],
            &dir.path().join("bad.wav"),
            "",
            0
        )
        .await
        .is_err());
    assert!(!dir.path().join("bad.wav").exists());
    server.join().unwrap();
}

#[test]
fn hydrogen_text_connection_stops_without_fallback() {
    let config: StageProviderConfig = serde_json::from_value(json!({
        "provider": "antigravity", "model": "gemini-4-hydrogen-low", "thinking": "low"
    })).unwrap();
    assert!(ModelAudio::new(&config,false).is_err());
}
