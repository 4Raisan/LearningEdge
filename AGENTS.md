# Working on LearningEdge

Read the [README](README.md), [workflow](docs/workflow.md), [tech stack](docs/tech-stack.md), and [user controls](docs/user-controls.md) before changing the pipeline. The workflow defines product behavior. The stack guide explains the proposed defaults and the conditions for revisiting them.

## Implementation order

1. Build a Windows-first Tauri shell and one resumable pipeline worker. Start with a small, redistributable transcript fixture. Produce concise notes, a typed scene plan, and a playable video with narration and captions. Save the intermediate artifacts so failures can be diagnosed and retried.
2. Add FFmpeg audio extraction and whisper.cpp transcription. Preserve timestamps through chunk boundaries. Add supporting-material ingestion with page or slide references.
3. Add per-stage provider selection, model and thinking controls, and presets. Keep Ollama, OpenAI, and Gemini behind stage interfaces. Store API keys in the OS credential store and persist credential references in presets.
4. Add each user's SQLite-backed knowledge graph and source links. Save dreaming suggestions for review before adding them to the accepted graph.

## Pipeline rules

- Keep stable IDs and source references from transcript or material through notes, scenes, and exported timestamps.
- Validate output structure and required note IDs, then check whether the narration or visuals actually explain each point. Hold rendering when unresolved gaps remain.
- Persist completed stages and scenes. Invalidate downstream work when its inputs or settings change. Keep export duration driven by content.
- Keep local jobs offline. Send lecture content to a cloud provider only when the user explicitly configures cloud processing for that stage. Never put keys or private lecture content in fixtures or logs.

## Acceptance checks

- For the first milestone, run the transcript fixture end to end and check the playable export, captions, and source-to-video references.
- Remove one required point from a scene plan and confirm the coverage check holds rendering. Retry after correcting the scene and check that completed work is reused.
- When adding a provider or local engine, verify failure and retry behavior and record runtime and peak memory on the target Windows machine before changing a default.
