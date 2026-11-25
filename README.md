# LearningEdge

LearningEdge is a Windows-first, local-first automated workflow that turns lectures and supporting materials into concise study notes, verified knowledge graphs, and motion-graphics explainers.

1. Transcribe lecture audio or video and collect any supplied transcripts, slides, notes, or readings.
2. Produce simple, direct notes at the chosen depth while preserving the concepts, reasoning, and qualifications needed to understand the lecture.
3. Check the notes against the sources, then verify that the video script and storyboard cover every required point in the notes.
4. Generate dynamic motion graphics, narration audio, and captions. Let the material determine the runtime, with no fixed time limit.

Users can choose their models, thinking settings, narration voice/provider, note depth, and video orientation preferences, then save them as presets. Each user's personal knowledge graph connects concepts across lectures and supports reviewing dreaming connections and knowledge gaps.

## Tech Stack & Engine Architecture

- **Desktop and storage.** Tauri 2 uses the system WebView. Rust runs the resumable pipeline, Svelte and TypeScript handle the UI, and SQLite (via SQLx + Apalis) stores jobs, presets, and the personal knowledge graph in one local database.
- **Local AI.** Ollama provides local model management and structured output. Native whisper.cpp handles transcription on CPU. Download model weights separately to keep the installer small.
- **Motion Graphics Engine.** Konva renders shared templates across live preview and headless FFmpeg export (`scripts/render-scene.ts`), combining kinetic typography, geometric accents, 36 draw-on vector icons, orthogonal 2×2 animated diagrams with traveling packets, animated bar/donut/metric charts, visual metaphors, and sanitized inline SVG sketches. Exports support landscape (`1280 × 720`) and portrait (`720 × 1280`) with portrait-aware vertical timelines and direct `@napi-rs/canvas` pixel-buffer extraction for flat-memory long-scene rendering.
- **Narration & SFX.** Online narration defaults to Edge Neural TTS (`edge-tts` with `en-US-AvaMultilingualNeural` at `-4%` speed, normalized with FFmpeg `loudnorm=I=-16:TP=-1.5:LRA=11` to 48 kHz mono), with optional programmatic Rust SFX (transition whoosh and cue tones) mixed into the scene WAV and encoded at AAC 192 kbps. Offline runs fall back to installed Windows SAPI voices, and OpenAI-compatible chat endpoints with native audio output (`ModelAudio`) remain supported as an option. Measured WAV duration drives frame count and sentence-cue reveals.

Start with local processing or add separate OpenAI, Gemini, Codex CLI, or Antigravity configurations per stage. API keys are stored in the OS credential store with only credential references saved in presets.

- [Tech stack and provider options](docs/tech-stack.md)
- [Lecture-to-video workflow](docs/workflow.md)
- [User controls and knowledge graph](docs/user-controls.md)
- [Motion authoring direction](docs/motion-authoring.md)

## Run Lecture to Video

1. Open LearningEdge and select **Lecture to Video**.
2. Paste your lecture text, choose Brief, Standard, or Deep under the input, and select **Generate video**. The app groups related ideas, extracts the concepts and theories, and writes an explainer in its own words.
3. Watch the run status. When verification and rendering finish, play the MP4 in the Video Portal.

The default note and video settings use Ollama running locally with the `qwen3:4b` model, Windows narration (or Edge Neural TTS when online with `pip install edge-tts`), and FFmpeg. Install [Ollama for Windows](https://docs.ollama.com/windows), start it, and run `ollama pull qwen3:4b` once. Runs use the downloaded model and need no API key.

## Subscription-backed video authoring

- In **Providers**, sign in to Codex, check available models, and choose a model and thinking level separately for notes, video, or knowledge chat. The desktop worker runs Codex CLI with ChatGPT sign-in for concept extraction, outline review and scene coverage. These stages send the lecture to OpenAI. Install Codex CLI and run `codex login` first.
- **Antigravity Gemini 4 Hydrogen Low** works end-to-end in the desktop app (using Edge Neural TTS + programmatic SFX for narration and audio mixing), and also supports standalone script authoring and review through `scripts/hydrogen-video.py --script-only`. See [scene direction](docs/motion-authoring.md).

## Notes and provider connections

Choose a discovered model or type a model ID for its provider. Model discovery lists the provider catalog. The selected account and model determine access at generation time. Drag pane dividers or focus one and use the arrow keys to resize. The workspace theme and exported video palette are independent. Exports support landscape (1280 × 720) and portrait (720 × 1280).

**Graph** applies to the current lecture. Verified notes are also saved as `verified_notes.md` in the run folder. Select a node to read its linked lecture notes, open the Markdown file, or expand the reader. Knowledge chat history stays in the local desktop profile.

The **Local AI & hosted API** card accepts installed Ollama models and OpenAI-compatible chat-completions endpoints. Enter the API base URL, model ID, and key. LearningEdge stores keys in the OS credential store. Verify each model and thinking setting before selecting it for notes, video, or chat. Verification sends a short synthetic request.

## Building and packaging

- **Quick launch / dev setup.** Run `run.bat` (auto-provisions local Node/pnpm/FFmpeg if missing and builds or launches the desktop app) or run `pnpm tauri dev`.
- **Windows installer (NSIS).** Run `pnpm tauri build --bundles nsis` to produce `LearningEdge_0.1.0_x64-setup.exe`.
- **Portable Windows EXE.** Build `learningedge.exe` and `portable_launcher.exe` in release mode, ensure `ffmpeg`/`ffprobe` are on `PATH`, then run `python scripts/build-portable.py` to bundle and smoke-test `dist-portable/LearningEdge-Portable.exe`.

## Repository layout

| Folder | What to change there |
| --- | --- |
| [frontend/pages](frontend/pages) | App screens, starting with Lecture to Video. |
| [frontend/lib](frontend/lib) | Shared UI, Tauri calls, and the modular Konva motion-graphics kit (`renderer/`). |
| [src-tauri/src](src-tauri/src) | Rust backend: pipeline stages, coverage checks, `edge_tts` + `sfx` audio, and FFmpeg video assembly. |
| [scripts](scripts) | Headless Konva scene export (`render-scene.ts`), portable bundler (`build-portable.py`), and `hydrogen-video.py`. |
| [skills/motion-graphics-studio](skills/motion-graphics-studio) | Motion graphics studio skill guidance and visual direction (`docs/motion-authoring.md`). |
| [fixtures](fixtures) and [tests](tests) | Sample lecture material and frontend rendering tests. Rust acceptance tests live in [src-tauri/tests](src-tauri/tests). |

Coding agents can start with [AGENTS.md](AGENTS.md) for the build order and acceptance checks.
