# LearningEdge

LearningEdge is a planned automated workflow that turns lectures and supporting materials into concise study notes and motion-graphics explainers.

1. Transcribe lecture audio or video and collect any supplied transcripts, slides, notes, or readings.
2. Produce simple, direct notes at the chosen depth while preserving the material needed to understand the lecture.
3. Check the notes against the sources, then verify that the video script and storyboard cover every required point in the notes.
4. Generate the motion graphics, narration, and captions. Let the material determine the runtime, with no fixed time limit.

Users can choose their models, thinking settings, note depth, and video preferences, then save them as presets. Each user's knowledge graph connects concepts across their lectures and supports reviewing suggested connections and knowledge gaps.

## Proposed tech stack

- **Desktop and storage.** Tauri 2 uses the system WebView. Rust runs the pipeline, Svelte and TypeScript handle the UI, and SQLite stores jobs and the personal knowledge graph in one local database.
- **Local AI.** Ollama provides model management and structured output. Native whisper.cpp handles transcription on CPU, with Vulkan as a benchmark candidate. Download model weights separately to keep the installer smaller.
- **Video.** Konva provides the Canvas 2D scene primitives for preview and export. FFmpeg encodes each scene so a retry can reuse completed footage. Installed Windows speech voices give the first version an offline narration option.

Reuse Apalis with SQLite for durable jobs and retries, SQLx for database migrations, and Tauri sidecars to run native tools. LearningEdge owns the lecture workflow, coverage checks, and educational scene templates.

Start with local processing and let users add separate OpenAI and Gemini API keys. Eligible ChatGPT Pro and Business users can use claimed API credits through their linked OpenAI API organization. Use a Gemini API key for Google models in LearningEdge.

- [Tech stack and provider options](docs/tech-stack.md)
- [Lecture-to-video workflow](docs/workflow.md)
- [User controls and knowledge graph](docs/user-controls.md)

## Run Lecture to Video

1. Open LearningEdge and select **Lecture to Video**.
2. Paste your lecture text and select **Generate video**. The app groups related ideas, extracts the concepts and theories, and writes an explainer in its own words.
3. Watch the run status. When verification and rendering finish, play the MP4 in the Video Portal.

Pasted text uses Ollama running locally with the `qwen3:4b` model, Windows narration, and FFmpeg. Install [Ollama for Windows](https://docs.ollama.com/windows), start it, and run `ollama pull qwen3:4b` once. Runs use the downloaded model and need no API key.

## Repository layout

| Folder | What to change there |
| --- | --- |
| [frontend/pages](frontend/pages) | App screens, starting with Lecture to Video. |
| [frontend/lib](frontend/lib) | Shared UI, Tauri calls, and motion-graphics templates. |
| [src-tauri/src](src-tauri/src) | Rust backend. Commands connect the UI to the queue, coverage checks, narration, and video rendering. |
| [scripts](scripts) | Scene export entry point used by the backend. |
| [fixtures](fixtures) and [tests](tests) | Sample lecture material and frontend rendering tests. Rust acceptance tests live in [src-tauri/tests](src-tauri/tests). |

Coding agents can start with [AGENTS.md](AGENTS.md) for the build order and acceptance checks.
