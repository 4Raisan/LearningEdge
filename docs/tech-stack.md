# Proposed technology stack

Start with a Windows-first, local-first desktop app. Run the pipeline in one local worker with resumable stages. Cloud providers are optional and selected per stage.

| Layer | Recommendation | Why choose it |
| --- | --- | --- |
| Desktop | [Tauri 2](https://v2.tauri.app/concept/architecture/) with Rust, Svelte, TypeScript, and Vite | The system WebView saves bundling a browser. A static frontend and one Rust worker keep setup small. Rust owns jobs, files, provider calls, and native processes. |
| Storage and personal graph | [SQLite with FTS5](https://sqlite.org/fts5.html) and local files | Jobs, presets, concepts, edges, and source references fit in one embedded database. FTS5 provides keyword search for lecture passages. Indexed edges support graph traversal for dreaming. Keep large media on disk. |
| Local language models | [Ollama](https://docs.ollama.com/api/chat) on loopback | Ollama handles model management, structured output, and supported thinking settings through one API. Keep it optional for API-only installs. Use a small quantized model and keep it loaded briefly across adjacent text stages when memory permits. |
| Local transcription | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and FFmpeg | A native engine gives the Windows build a CPU path without a Python environment. Use timestamps, voice activity detection, and a quantized multilingual model. Benchmark Vulkan on the actual GPU before enabling it by default. |
| Motion graphics | Canvas 2D and [FFmpeg](https://ffmpeg.org/ffmpeg-formats.html) | Typed scene templates support text, diagrams, and timelines while sharing the renderer between preview and export. Encoding per scene limits the work repeated after a change or failure. |
| Local narration | Installed Windows speech voices | The first offline version can start with voices already available on the machine. Test intelligibility and pronunciation in the target languages before adding a neural voice dependency. |

## Optimization choices

- **Ship the app separately from model weights.** Download only the selected models and allow a pre-downloaded model for an offline install. Evaluate [llama.cpp](https://github.com/ggml-org/llama.cpp) as a managed local sidecar if the extra Ollama setup blocks a one-install experience. Benchmark it on the same model before changing the default.
- **Keep one transcription default.** Evaluate [faster-whisper](https://github.com/SYSTRAN/faster-whisper) as a throughput candidate when suitable hardware is available. Compare repeatable runs on the same audio and model size, including dependency setup and transcript quality.
- **Reuse encoded footage.** Write scene clips with matching video parameters and concatenate with FFmpeg stream copy when compatible. Mix narration and captions at assembly so audio-only or caption-only edits can reuse unchanged visual clips. Render against explicit frame timestamps so export stays consistent under load.
- **Route model effort by stage.** Apply deterministic checks to IDs and schemas first. Use model reasoning for coverage and meaning, and retry only failed sections with a stronger allowed model or higher thinking setting. Cache results by source revision, model, settings, and prompt version so changes invalidate dependent stages.

## Provider modes

- **Local.** Ollama for text, whisper.cpp for transcription, and an installed voice for narration. Run offline once the selected models and voices are installed.
- **Bring your own API key.** Provide independent connections for OpenAI and Gemini. OpenAI can serve text, transcription, and narration through their respective APIs. Start Gemini with text stages. Store keys in the OS credential store and save only credential references in presets. Show the provider, model, connection, and available thinking controls for each stage.
- **Use an eligible ChatGPT subscription.** Eligible ChatGPT Pro and Business users can claim API credits for a linked OpenAI API organization and use a key from that organization in LearningEdge. Treat signed-in Codex as a separate product workflow and use the OpenAI API for automated inference. [API credit eligibility and activation](https://developers.openai.com/api/docs/guides/chatgpt-api-credits) · [Codex authentication](https://learn.chatgpt.com/docs/auth)
- **Google Antigravity.** Use a separate Gemini API key for LearningEdge. Google excludes wrapping the Antigravity CLI inside third-party apps under consumer plans. [Antigravity FAQ](https://antigravity.google/docs/faq)

Configure cloud use explicitly. When a stage fails or exhausts its quota, resume with the selected connection or let the user choose another. Keep local-only jobs offline.

## Speed and coverage

- Checkpoint timestamped transcript chunks, verified notes, the scene plan, and encoded scenes. Reuse completed work when its inputs and settings match. Bound parallel jobs so transcription, model inference, and rendering can share CPU, RAM, and GPU resources.
- Assign stable IDs to required note points and reference them from scenes. Validate that every ID has a scene, then run a semantic check against the actual narration and visuals. Revise or hold rendering if coverage is incomplete. Resolve scene references to timestamps in the exported video.
- Benchmark a short lecture and a long lecture on the target Windows machine, including representative accents and technical terms. Record startup and install size, time per stage, peak RAM and VRAM, transcript errors, and missed required note points. Choose the fastest configuration that meets the quality checks.
