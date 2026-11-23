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
});
