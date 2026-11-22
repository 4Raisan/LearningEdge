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
- **Video.** Canvas 2D shares scene templates between preview and export. FFmpeg encodes each scene so a retry can reuse completed footage. Installed Windows speech voices give the first version an offline narration option.

Start with local processing and let users add separate OpenAI and Gemini API keys. Eligible ChatGPT Pro and Business users can use claimed API credits through their linked OpenAI API organization. Use a Gemini API key for Google models in LearningEdge.

- [Tech stack and provider options](docs/tech-stack.md)
- [Lecture-to-video workflow](docs/workflow.md)
- [User controls and knowledge graph](docs/user-controls.md)

## Start implementing

The repository currently contains product and architecture documentation. Coding agents should start with [AGENTS.md](AGENTS.md) for the build order and acceptance checks. The first milestone is a local transcript-to-video run using a small fixture, followed by local audio transcription, provider controls, and knowledge graph features.
