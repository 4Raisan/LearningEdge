import "konva/napi-backend";
import Konva from "konva";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditSceneLayout, paginateScene, paginateScenes } from "../frontend/lib/renderer/layout";
import { renderSceneAtTime } from "../frontend/lib/renderer/templates";
import { THEME } from "../frontend/lib/renderer/theme";
import type { SceneSpec, SentenceCue } from "../frontend/lib/renderer/types";

const denseFixturePath = path.resolve(
  __dirname,
  "../fixtures/dense_overflow_scenes.json"
);

describe("Shared Konva Scene Layout, Pagination, and Renderer", () => {
  it("splits dense concept_reveal, process_diagram, and timeline scenes without clipping or shrinking text", () => {
    const raw = fs.readFileSync(denseFixturePath, "utf8");
    const parsed = JSON.parse(raw) as { scenes: SceneSpec[] };
    expect(parsed.scenes.length).toBe(3);

    for (const orig of parsed.scenes) {
      const split = paginateScene(orig, THEME.width, THEME.height);
      expect(split.length).toBeGreaterThanOrEqual(2);

      // Every item and sentence must remain preserved across continuation parts
      const totalItems = split.reduce((acc, s) => acc + s.items.length, 0);
      expect(totalItems).toBe(orig.items.length);

      const totalSentences = split.reduce(
        (acc, s) => acc + s.narration_sentences.length,
        0
      );
      expect(totalSentences).toBeGreaterThanOrEqual(orig.narration_sentences.length);

      for (const part of split) {
        expect(part.part_total).toBe(split.length);
        const audit = auditSceneLayout(part, THEME.width, THEME.height);
        expect(audit.min_font_size).toBeGreaterThanOrEqual(18);
        expect(audit.max_overlap_count).toBe(0);
        expect(audit.out_of_bounds_count).toBe(0);
      }
    }

    const combined = paginateScenes(parsed.scenes);
    expect(combined.length).toBeGreaterThanOrEqual(6);
  });

  it("renders progressive sentence-cue reveals across all 3 templates with Konva napi-backend", () => {
    const raw = fs.readFileSync(denseFixturePath, "utf8");
    const parsed = JSON.parse(raw) as { scenes: SceneSpec[] };
    const split = paginateScenes(parsed.scenes);

    const templatesToCheck = ["concept_reveal", "process_diagram", "timeline"] as const;
    for (const tpl of templatesToCheck) {
      const scene = split.find((s) => s.template === tpl)!;
      expect(scene).toBeDefined();

      const cues: SentenceCue[] = scene.narration_sentences.map((text, idx) => ({
        sentence_index: idx,
        text,
        start_ms: idx * 2000,
        end_ms: (idx + 1) * 2000,
      }));

      const stage = new Konva.Stage({ width: THEME.width, height: THEME.height });
      const layer = new Konva.Layer({ id: "scene-layer" });
      stage.add(layer);

      renderSceneAtTime(stage, scene, 50, cues, { showCaptions: true });
      const canvasEl = layer.getNativeCanvasElement() as unknown as {
        getContext: (id: "2d") => CanvasRenderingContext2D;
      };
      const frameEarly = Buffer.from(
        canvasEl.getContext("2d").getImageData(0, 0, THEME.width, THEME.height).data
      );

      const laterMs = cues.length > 1 ? cues[cues.length - 1].start_ms + 350 : 2500;
      renderSceneAtTime(stage, scene, laterMs, cues, { showCaptions: true });
      const frameLate = Buffer.from(
        canvasEl.getContext("2d").getImageData(0, 0, THEME.width, THEME.height).data
      );

      expect(frameEarly.byteLength).toBe(THEME.width * THEME.height * 4);
      expect(Buffer.compare(frameEarly, frameLate)).not.toBe(0);
      stage.destroy();
    }
  });

  it("paginates, audits, and animates comparison_grid and recap_ladder templates", () => {
    for (const tpl of ["comparison_grid", "recap_ladder"] as const) {
      const denseScene: SceneSpec = {
        scene_id: `dense-${tpl}`,
        base_scene_id: `dense-${tpl}`,
        part_index: 1,
        part_total: 1,
        title: `${tpl} showcase`,
        subtitle: "Key contrasts and takeaways",
        template: tpl,
        note_point_ids: ["concept-1"],
        source_refs: ["source-1"],
        narration_sentences: [
          "First point compares throughput versus tail latency.",
          "Second point balances cache hit ratio against memory budget.",
          "Third point summarizes write-back coherency tradeoffs.",
          "Fourth point locks in the final engineering checklist.",
          "Fifth point wraps up with measurement guidance.",
        ],
        items: Array.from({ length: 5 }, (_, idx) => ({
          id: `${tpl}-item-${idx + 1}`,
          badge: `Point ${idx + 1}`,
          label: `Aspect ${idx + 1} · Tradeoff Analysis`,
          detail:
            "Explains concrete mechanism, performance bounds, and practical engineering implications across workloads.",
          cue_index: idx,
        })),
      };

      const parts = paginateScenes([denseScene]);
      expect(parts.length).toBeGreaterThanOrEqual(2);
      for (const part of parts) {
        const audit = auditSceneLayout(part);
        expect(audit.min_font_size).toBeGreaterThanOrEqual(THEME.minFontSize);
        expect(audit.max_overlap_count).toBe(0);
        expect(audit.out_of_bounds_count).toBe(0);
      }

      const cues: SentenceCue[] = parts[0].narration_sentences.map((text, idx) => ({
        sentence_index: idx,
        text,
        start_ms: idx * 1800,
        end_ms: (idx + 1) * 1800,
      }));
      const stage = new Konva.Stage({ width: THEME.width, height: THEME.height });
      const layer = new Konva.Layer({ id: "scene-layer" });
      stage.add(layer);
      renderSceneAtTime(stage, parts[0], 120, cues, {
        showCaptions: true,
        theme: "night",
        sceneIndex: 0,
        sceneTotal: parts.length,
        sceneDurationMs: 4000,
      });
      const canvasEl = layer.getNativeCanvasElement() as unknown as {
        getContext: (id: "2d") => CanvasRenderingContext2D;
      };
      const f1 = Buffer.from(
        canvasEl.getContext("2d").getImageData(0, 0, THEME.width, THEME.height).data
      );
      renderSceneAtTime(stage, parts[0], 2100, cues, {
        showCaptions: true,
        theme: "night",
        sceneIndex: 0,
        sceneTotal: parts.length,
        sceneDurationMs: 4000,
      });
      const f2 = Buffer.from(
        canvasEl.getContext("2d").getImageData(0, 0, THEME.width, THEME.height).data
      );
      expect(Buffer.compare(f1, f2)).not.toBe(0);
      stage.destroy();
    }
  });
});
