# Proposed technology stack

Start with a Windows-first, local-first desktop app. Run the pipeline in one local worker with resumable stages. Cloud providers are optional and selected per stage.

| Layer | Recommendation | Why choose it |
| --- | --- | --- |
| Desktop | [Tauri 2](https://v2.tauri.app/concept/architecture/) with Rust, Svelte, TypeScript, and Vite | The system WebView saves bundling a browser. A static frontend and one Rust worker keep setup small. Rust owns jobs, files, provider calls, and native processes. |
| Storage and personal graph | [SQLite with FTS5](https://sqlite.org/fts5.html) and local files | Jobs, presets, concepts, edges, and source references fit in one embedded database. FTS5 provides keyword search for lecture passages. Indexed edges support graph traversal for dreaming. Keep large media on disk. |
| Local language models | [Ollama](https://docs.ollama.com/api/chat) on loopback | Ollama handles model management, structured output, and supported thinking settings through one API. Keep it optional for API-only installs. Use a small quantized model and keep it loaded briefly across adjacent text stages when memory permits. |
| Local transcription | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and FFmpeg | A native engine gives the Windows build a CPU path without a Python environment. Use timestamps, voice activity detection, and a quantized multilingual model. Benchmark Vulkan on the actual GPU before enabling it by default. |
| Motion graphics | [Konva](https://konvajs.org/docs/overview.html) and [FFmpeg](https://ffmpeg.org/ffmpeg-formats.html) | Konva (`frontend/lib/renderer/`) supplies Canvas 2D scene templates, `motionVisuals.ts` visual stages (`kinetic_title`, orthogonal `diagram`, `chart`, `metaphor`, `svg_sketch`), and 36 draw-on icons across live preview and headless FFmpeg export via `@napi-rs/canvas` direct pixel buffers (`canvas.data()`). |
| Narration & SFX | Edge Neural TTS (`edge-tts` + FFmpeg `loudnorm`), Windows SAPI offline fallback, and programmatic Rust SFX | Online runs synthesize neural voice (`en-US-AvaMultilingualNeural`, `-4%`, 48 kHz mono normalized) and mix synthesized transition whooshes and cue tones directly in Rust PCM before AAC 192 kbps muxing. Offline runs fall back to installed Windows speech voices behind the same `NarrationProvider` interface, and `ModelAudio` remains selectable for audio-capable OpenAI-compatible endpoints. |

## Frameworks and libraries to reuse

- **Durable jobs.** Use [Apalis with SQLite](https://docs.rs/apalis-sqlite/latest/apalis_sqlite/) for job persistence, retries, and recovery. Keep one worker initially. LearningEdge still owns stage checkpoints, cache invalidation, and safe retries after a partial output.
- **Database access.** Use [SQLx](https://docs.rs/sqlx/latest/sqlx/macro.migrate.html) for SQLite access and migrations. LearningEdge defines the note, coverage, and graph schemas.
- **Native processes.** Use [Tauri sidecars](https://v2.tauri.app/develop/sidecar/) for packaged FFmpeg and whisper.cpp executables. Reuse the engines for media processing and transcription. Fetch model weights separately.
- **Video framework tradeoff.** Start with Konva and FFmpeg because preview can use the existing WebView, while headless `@napi-rs/canvas` `data()` export with reusable Konva shapes and `--expose-gc` keeps memory flat across multi-minute scenes.

## Optimization choices

- **Ship the app separately from model weights.** Download only the selected models and allow a pre-downloaded model for an offline install. Benchmark local models before changing defaults.
- **Zero unmanaged memory growth during long renders.** `scripts/render-scene.ts` reads raw RGBA frames via `extractCanvasRgbaBuffer()` (`canvas.data()`), reuses a single non-listening `#motion-scene` `Konva.Shape`, and yields cleanly every 30/60 frames with `--expose-gc`, keeping RSS flat across 16s+ scenes and 3–5 minute exports.
- **Clean orthogonal 2×2 diagram routing.** `routeDiagramEdge()` in `frontend/lib/renderer/motionVisuals.ts` routes cross-row edges via orthogonal Z-bends in the inter-row gutter and skips intermediate row nodes via clean U-routes so lines and packets never cross node cards.
- **Reuse encoded footage.** Write scene clips with matching video parameters and concatenate with FFmpeg stream copy when compatible. Mix narration and captions at assembly so audio-only or caption-only edits can reuse unchanged visual clips. Render against explicit frame timestamps so export stays consistent under load.
- **Resilient LLM stages.** Cache Antigravity CLI model discovery once per process, enforce explicit subprocess deadlines (`LEARNINGEDGE_AGY_TIMEOUT_SECS`) with tree termination on timeout, strip verbose inline `<svg>` markup during semantic coverage verification via `compact_plan_for_coverage()`, and retry transient JSON schema formatting errors automatically without relaxing validation.

## Provider modes

- **Local.** Ollama for text, whisper.cpp for transcription, and an installed Windows SAPI voice for narration (with optional Rust SFX). Run offline once the selected models and voices are installed.
- **Bring your own API key.** Provide independent connections for OpenAI and Gemini. OpenAI can serve text, transcription, and optional native narration (`model_audio`) through their respective APIs. Online runs default to Edge Neural TTS (`edge-tts`) with any text/scripting provider. Store keys in the OS credential store and save only credential references in presets. Show the provider, model, connection, and available thinking controls for each stage.
- **Use an eligible ChatGPT subscription.** Eligible ChatGPT Pro and Business users can claim API credits for a linked OpenAI API organization and use a key from that organization in LearningEdge. Treat signed-in Codex as a separate product workflow and use the OpenAI API for automated inference. [API credit eligibility and activation](https://developers.openai.com/api/docs/guides/chatgpt-api-credits) · [Codex authentication](https://learn.chatgpt.com/docs/auth)
- **Google Antigravity.** Use a separate Gemini API key for LearningEdge. Google excludes wrapping the Antigravity CLI inside third-party apps under consumer plans. [Antigravity FAQ](https://antigravity.google/docs/faq)

Configure cloud use explicitly. When a stage fails or exhausts its quota, resume with the selected connection or let the user choose another. Keep local-only jobs offline.

## Speed and coverage

- Checkpoint timestamped transcript chunks, verified notes, the scene plan, and encoded scenes. Reuse completed work when its inputs and settings match. Bound parallel jobs so transcription, model inference, and rendering can share CPU, RAM, and GPU resources.
- Assign stable IDs to required note points and reference them from scenes. Validate that every ID has a scene, then run a semantic check against the actual narration and visuals. Revise or hold rendering if coverage is incomplete. Resolve scene references to timestamps in the exported video.
- Benchmark a short lecture and a long lecture on the target Windows machine, including representative accents and technical terms. Record startup and install size, time per stage, peak RAM and VRAM, transcript errors, and missed required note points. Choose the fastest configuration that meets the quality checks.
