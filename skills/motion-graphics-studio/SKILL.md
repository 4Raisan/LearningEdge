---
name: motion-graphics-studio
description: Author and review LearningEdge concept explainers using the local Studio visual kit, Edge Neural TTS (or offline SAPI / optional model audio), and programmatic SFX.
---

Use [visual direction](visual-direction.md) for staging, rhythm and visual hierarchy. The Konva implementation lives in frontend/lib/renderer. The runtime scene prompt is [motion-authoring.md](../../docs/motion-authoring.md).

1. Extract required concepts and qualifications with source references. Explain each mechanism in the script.
2. Map concepts to typed scenes. Keep one visual focus per reveal. Keep the approved sentence text and its cue index together.
3. Synthesize per-scene narration first (Edge Neural TTS `en-US-AvaMultilingualNeural` at `-4%` normalized via FFmpeg `loudnorm` to 48 kHz mono when online, Windows SAPI offline, or optional `ModelAudio`) and mix programmatic SFX when enabled. Use the measured sentence audio for cues.
4. Paginate and audit layout before rendering. Inspect the PNGs in each clip's adjacent .review directory for text collisions, cue alignment and legibility.
5. Check exported streams, captions and concept coverage. Report whether anyone actually reviewed the frames and listened to the narration.

Adapted from the user's editable Motion Graphics Studio kit. Visual craft sources are listed in [ATTRIBUTION.md](ATTRIBUTION.md).
