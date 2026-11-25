# Motion Graphics Studio visual direction

## 1. Structure & retention (why people keep watching)

- **Hook in 3 seconds.** Open with motion + a spoken promise of the payoff ("By the end
  you'll…"). No logos, no "welcome to my channel" throat-clearing.
- **One idea per scene, 15–25s each.** A scene = one sentence of the argument. If a
  scene needs two ideas, split it.
- **Open loops.** Tease what's coming ("but that breaks one thing…") and pay it off
  later. Every video ends with the payoff promised in the hook.
- **Pattern interrupt every 20–40s:** change layout family (diagram → grid → ladder →
  orbit), not just colors. Repeating one layout for 5 scenes kills retention.
- **Progress bar always on** (engine draws it) — viewers stay when they see the end.
- **Recap ladder near the end** (3–5 rungs), then a one-line takeaway. Connective
  scenes (intro/map/outro) are expected; content scenes must map to brief topics.

## 2. Motion (the 12 principles, translated to this engine)

| Principle | How to apply here |
|---|---|
| Slow in/out | Entrances `easeOut(seg(t,a,b))` 0.5–0.9s; moves `easeInOut`. Never linear. |
| Anticipation | Small wind-up (dip/scale 0.95) 0.1–0.2s before a big reveal. |
| Squash & stretch / overshoot | Pops use `easeBack` (scale 0→1 with overshoot). |
| Follow-through | After a pop, settle: secondary elements arrive 0.1–0.2s later. |
| Staging | One focal point per moment; dim everything else (`C.dim`, alpha ≤ 0.6). |
| Secondary action | Particles/blobs always drift (engine BG); nodes pulse `0.6+0.4*sin(t*2+i)`. |
| Arcs | Orbit/curved paths (`cos/sin`), not straight slides, for organic feel. |
| Timing | Reveal stagger 0.12–0.25s between siblings; scene fade-in 0.45s (engine). |
| Exaggeration | Glow (`additive` + shadowBlur), scale pops — emphasis, not decoration. |
| Appeal | Rounded corners (rr 12–16*S), glow rings, consistent geometry. |

**Never static > 2s.** During narration holds, keep pulse/orbit/drift alive.
**Exit** = engine's 0.45s crossfade; don't hand-animate exits unless intentional.

## 3. Clarity (non-negotiable — these were real bugs)

- **Explicit color on every text call.** Missing color = Chrome default black on dark
  bg = invisible. Always pass a `C.*` color.
- Sizes at 1080: scene title 44*S, kicker 21*S, body 24*S, chips 17–19*S, captions
  21*S. Weights 700–800. Measure with `ctx.measureText` before placing; wrap chips.
- No overlapping labels: compute widths first; stagger vertically if cramped.
- Clamp lerps (`seg` already clamps) — overshooting `t` past 1 caused a real shield bug.
- Check helper signatures when copying (a glowRing arg typo shipped once).
- Caption = one keyword-dense line (≤ ~90 chars), NOT the transcript. It fades
  in 0.25–0.65s, out before scene end (engine handles it).
- Dark bg `#05070f`, one accent per concept family (cyan/teal/amber/magenta/violet),
  `C.ink` for primary text, `C.dim` for secondary. Glow = `additive()` + shadowBlur.
- **Palette budget: pick 3 accents + neutrals per project** (override via
  `PROJECT.theme`); more reads as random. One of the three is the "pop" color for
  keywords, arrows and CTAs.
- Align to the grid: `col(i,n)` / `row(i,n)` place content in the safe area
  (x 7–93%, y 24–84%). Captions own the bottom band — keep content above 0.86H.

## 8. Visual kit (engine helpers — use them, don't hand-roll)

Craft sources: `_studio/references/` (MIT, mined not installed). Demo: the
template's `showcase` scene exercises every helper.

- **Draw-on lines** `drawPath(pts, p, col, alpha, width, {arrow, dash, march, glow})`
  and `flowPath(pts, t, …)` (marching dashes = direction). `pathPoint(pts, p)` for
  traveling packets. Reveal order: containers → nodes → edges → labels; dim
  inactive branches to ~0.35. Lines guide the eye to the next focal point.
- **Kinetic text** `kineticText(str, x, y, size, col, t, {start, stagger, dur, glow})`
  = word-by-word mask rise; `wipeText(str, …, p)` = clip-edge sweep. Timings:
  word stagger 0.04–0.07s, char 0.02–0.04s, dur 0.4–0.6s, easeOutExpo, whole
  reveal ≤ ~0.8s. One headline per scene; body copy stays plain `text`.
- **Icons** `icon(name, x, y, size, col, alpha, p)` — 17 outline icons, one stroke
  weight, all draw on with p. Never mix styles or hand-draw a one-off glyph.
  Names: check x plus arrow cloud lock bolt chart person phone mail search star
  clock shield gear database.
- **Charts** `bars(data, cx, baseY, w, h, t, start, col)` grow from the baseline
  (0.08s stagger); `donut(cx, cy, r, p, col)` sweeps; `countUp(value, …, p)` tweens
  the number. Animate the result, not every datapoint; label only what matters.
- **Callouts** `callout(label, x, y, tx, ty, col, p)` = short chip + draw-on arrow
  + target ring; `highlightRing(x, y, rx, ry, col, p)` = sketchy ellipse for round
  targets; `highlightBox(x, y, w, h, col, p)` = draw-on rounded rect for groups
  (an ellipse clips the corners of a rectangular grid). Labels ≤ 3 words. Keep
  rings/arrowheads clear of value labels and captions.
- **Characters** `figure(x, y, h, col, pose, t, alpha)` — one stick character,
  fixed proportions, poses idle/walk/point/cheer/sad; returns {head, hand, feet}
  anchors so props attach to it. Pose-sheet it alone before using it in a film
  (references/javascript-animation/character.md). Same stroke weight as icons.
- **Logo** `logoReveal(x, y, r, col, ink, t, start, glyph)` — ring + glyph stroke
  draw-on 0.9s, 0.2s micro-settle 1.04→1, idle breathing after. Symbol leads,
  wordmark follows (kineticText), hold settled ≥0.4s. Uniform scale only.
- If an animation doesn't make the message clearer, cut it.
