# Motion Graphics Studio Scene Direction

Turn the supplied verified notes and draft into a `ScenePlan` JSON object matching the schema. Preserve `note_point_ids`, `source_refs`, required concepts, causal explanations, qualifications, and sentence-to-item `cue_index` mappings.

## Visual Storytelling Rules

Never emit a sequence of plain text cards. Choose the best visual technique for each scene's central idea and vary visual kinds across consecutive scenes:

- **Introduction / Definition** -> `visual.kind = "kinetic_title"` (`visual_layout: "hero"` when 1-2 items, `"split"` otherwise): logo reveal, kinetic headline, accent keyword chip, and key-term chips.
- **Technical Process / Architecture / Network Flow** -> `visual.kind = "diagram"` (`visual_layout: "split"`): 2-6 connected nodes (`nodes`, `edges` with `packet: true`, `cue_index` synced to spoken steps, and a short `callout`).
- **Abstract Concept / Analogy** -> `visual.kind = "metaphor"` (`visual_layout: "split"`): two illustrated medallions bridged by a flowing packet (`left_label`, `left_icon`, `right_label`, `right_icon`, `connector_label`, optional `character_pose`: `"idle" | "walk" | "point" | "cheer" | "sad"`).
- **Statistics / Metrics / Benchmarks** -> `visual.kind = "chart"` (`visual_layout: "split"`): `chart_type: "bar"` with `bars`, `"donut"` with `percent`, or `"metric"` with `metric_value` + `metric_label`.
- **Custom Visual Sketch** (when a bespoke illustration makes the idea click, e.g. street-address houses, router topology, memory hierarchy, git branches) -> `visual.kind = "svg_sketch"` (`visual_layout: "split"`): a clean minimalist inline `<svg viewBox="0 0 400 280">` using bright high-contrast strokes (`#38bdf8`, `#818cf8`, `#fbbf24`, `#34d399`, `#f8fafc`), simple shapes/paths, and readable labels (no `<script>`, no `<foreignObject>`, no external URLs).
- **Contrast / Evolution / Summary** -> `template: "comparison_grid"` (side-by-side VS), `"timeline"`, or `"recap_ladder"`, optionally paired with a `visual` stage.

## Copy & Timing Discipline

- Write `narration_sentences` for a single expressive presenter (clear, conversational, explaining the mechanism and qualifications completely).
- Keep on-screen `items[].label` concise (2-6 words) and `items[].detail` punchy (under 16 words) so scenes breathe with generous negative space; let `narration_sentences` carry the detailed explanation.
- Set `items[].icon` from: `brain`, `zap`, `lock`, `unlock`, `key`, `layers`, `check`, `x`, `alert`, `arrowR`, `arrowDown`, `database`, `cpu`, `globe`, `clock`, `sparkles`, `target`, `cloud`, `bolt`, `chart`, `person`, `phone`, `mail`, `search`, `star`, `shield`, `gear`, `router`, `house`, `server`, `git`, `packet`, `code`, `plus`, `arrow`.
- Optionally set `items[].stat` for a compact highlight badge (e.g. `"4 bytes"`, `"O(1)"`, `"32-bit"`).

## Output Schema Extensions on Each Scene

```json
{
  "visual_layout": "split | hero | cards",
  "visual": {
    "kind": "kinetic_title | diagram | chart | metaphor | svg_sketch"
  }
}
```

- `kinetic_title`: `{ "kind": "kinetic_title", "eyebrow": "...", "headline": "...", "accent_word": "...", "icon": "...", "chips": ["..."] }`
- `diagram`: `{ "kind": "diagram", "nodes": [{ "id": "n1", "label": "...", "sublabel": "...", "icon": "...", "cue_index": 0 }], "edges": [{ "from": "n1", "to": "n2", "label": "...", "packet": true, "cue_index": 1 }], "callout": "..." }`
- `chart`: `{ "kind": "chart", "chart_type": "bar | donut | metric", "title": "...", "bars": [{ "label": "...", "value": 85, "suffix": "%" }], "percent": 85, "metric_value": 4, "metric_suffix": " bytes", "metric_label": "...", "callout": "..." }`
- `metaphor`: `{ "kind": "metaphor", "left_label": "...", "left_icon": "...", "right_label": "...", "right_icon": "...", "connector_label": "...", "character_pose": "point", "caption": "..." }`
- `svg_sketch`: `{ "kind": "svg_sketch", "svg": "<svg viewBox=\"0 0 400 280\">...</svg>", "caption": "..." }`

Return only valid `ScenePlan` JSON.
