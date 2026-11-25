---
name: motion-graphics-studio
description: Author and review LearningEdge concept explainers using the local Studio visual kit and native audio from the selected video model.
---

Use [visual direction](visual-direction.md) for staging, rhythm and visual hierarchy. The Konva implementation lives in frontend/lib/renderer. The runtime scene prompt is [motion-authoring.md](../../docs/motion-authoring.md).

1. Extract required concepts and qualifications with source references. Explain each mechanism in the script.
2. Map concepts to typed scenes. Keep one visual focus per reveal. Keep the approved sentence text and its cue index together.
3. Request native audio on the selected video model connection. Stop if it cannot return audio. Check its returned transcript, then use the measured sentence audio for cues.
4. Paginate and audit layout before rendering. Inspect the PNGs in each clip's adjacent .review directory for text collisions, cue alignment and legibility.
5. Check exported streams, captions and concept coverage. Report whether anyone actually reviewed the frames and listened to the narration.

Adapted from the user's editable Motion Graphics Studio kit. Visual craft sources are listed in [ATTRIBUTION.md](ATTRIBUTION.md).
