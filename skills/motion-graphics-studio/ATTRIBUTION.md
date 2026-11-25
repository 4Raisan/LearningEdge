# References — mined craft, not installed pipelines

Curated copies of MIT-licensed skill references, adapted for the `_studio` canvas
engine. The source packs target Remotion/GSAP/Lottie pipelines; we do NOT install
or run them (studio contract: one engine). These docs are design guidance only.
Fetched 2026-11-22.

| Folder | Source repo (MIT) | What we took |
|---|---|---|
| `javascript-animation/` | [iart-ai/javascript-animation-skills](https://github.com/iart-ai/javascript-animation-skills) | `claim()` layout-collision model (adapted into engine + `render.js --layout`), character construction rules, QC passes, hand-drawn "boil" technique |
| `kinetic-typography/` | [iart-ai/kinetic-typography-skills](https://github.com/iart-ai/kinetic-typography-skills) | Mask-rise reveal, stagger timings (line 60–100ms / word 40–70ms / char 20–40ms), easeOutExpo, ~800ms reveal cap → `kineticText`/`wipeText` |
| `motion-design/` | [iart-ai/motion-design-skills](https://github.com/iart-ai/motion-design-skills) | Logo reveal patterns, palette discipline, shot grids (for future logo helper + PLAYBOOK rules) |
| `data-animation/` | [iart-ai/explainer-video-skills](https://github.com/iart-ai/explainer-video-skills), [iart-ai/data-animation-skills](https://github.com/iart-ai/data-animation-skills) | Node→edge→label reveal order, dash draw-on, marching-dash flow, bar growth + count-up easing → `drawPath`/`bars`/`countUp` |
| `lottie-recipes/` | [diffusionstudio/lottie](https://github.com/diffusionstudio/lottie) | Design/motion taste rules and logo/type/icon/diagram/data recipes (guidance only; no Lottie runtime) |

 Umbrella index: [iart-ai/motion-skills](https://github.com/iart-ai/motion-skills).