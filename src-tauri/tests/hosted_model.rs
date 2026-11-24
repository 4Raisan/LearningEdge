use learningedge_lib::{credentials, pipeline::ingest::sha256_hex, studio};
use serde_json::json;
use std::{io::{BufRead, BufReader, Read, Write}, net::TcpListener, thread};

#[tokio::test]
async fn verifies_the_selected_hosted_model_with_its_endpoint_key() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!("http://{}/v1", listener.local_addr().unwrap());
    let credential = format!("hosted-{}", sha256_hex(endpoint.as_bytes()));
    studio::hosted_key(endpoint.clone(), "integration-test-key".into()).unwrap();
    let server = thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        let mut reader = BufReader::new(&socket);
        let mut headers = String::new();
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if line.trim().is_empty() { break; }
            headers.push_str(&line.to_lowercase());
        }
        assert!(headers.starts_with("post /v1/chat/completions "));
        assert!(headers.contains("authorization: bearer integration-test-key"));
        let length = headers.lines().find_map(|l| l.strip_prefix("content-length: ")).unwrap().parse().unwrap();
        let mut body = vec![0; length];
        reader.read_exact(&mut body).unwrap();
        assert_eq!(serde_json::from_slice::<serde_json::Value>(&body).unwrap()["model"], "test-model");
        let reply = json!({"choices":[{"message":{"content":"{\"available\":true}"}}]}).to_string();
        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",reply.len(),reply).unwrap();
    });
    let choice = serde_json::from_value(json!({"provider":"open_ai","model":"test-model","thinking":"off","endpoint":endpoint})).unwrap();
    let result = studio::studio_verify(choice).await;
    credentials::delete_secret(&credential).unwrap();
    result.unwrap();
    server.join().unwrap();
}
