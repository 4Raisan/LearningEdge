import "konva/napi-backend";
import Konva from "konva";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditSceneLayout, computeSceneLayout, paginateScene, paginateScenes } from "../frontend/lib/renderer/layout";
import { routeDiagramEdge, sanitizeSvgMarkup, type DiagramNodeBox } from "../frontend/lib/renderer/motionVisuals";
import { extractCanvasRgbaBuffer, renderSceneAtTime, type NativePixelCanvasLike } from "../frontend/lib/renderer/templates";
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

  it("sanitizes inline SVGs while preserving vector geometry", () => {
    const dirty = `<svg viewBox="0 0 200 120" onload="alert(1)"><script>evil()</script><foreignObject><div>no</div></foreignObject><circle cx="60" cy="60" r="40" stroke="#38bdf8" fill="none"/></svg>`;
    const clean = sanitizeSvgMarkup(dirty);
    expect(clean).not.toBeNull();
    expect(clean!).not.toContain("<script");
    expect(clean!).not.toContain("onload");
    expect(clean!).not.toContain("foreignObject");
    expect(clean!).toContain("<circle");
    expect(clean!).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("audits, paginates, and animates all five SceneVisual kinds in landscape and portrait", () => {
    const visualScenes: SceneSpec[] = [
      {
        scene_id: "vis-kinetic",
        base_scene_id: "vis-kinetic",
        part_index: 1,
        part_total: 1,
        title: "What Is an IP Address?",
        subtitle: "Unique network identity",
        template: "concept_reveal",
        note_point_ids: ["np-1"],
        source_refs: ["src-1"],
        narration_sentences: [
          "Every device on a network needs a unique IP address so packets reach the right destination.",
          "Without it, routers cannot tell which machine should receive incoming traffic.",
        ],
        visual_layout: "hero",
        visual: {
          kind: "kinetic_title",
          eyebrow: "NETWORK FUNDAMENTALS",
          headline: "Unique Device Identity",
          accent_word: "32-bit IPv4 / 128-bit IPv6",
          icon: "globe",
          chips: ["Routing", "Addressing", "Packets"],
        },
        items: [
          {
            id: "vk-1",
            badge: "Core",
            icon: "globe",
            stat: "4 bytes",
            label: "Unique Network ID",
            detail: "Identifies a device on a local or global network.",
            cue_index: 0,
          },
          {
            id: "vk-2",
            badge: "Why",
            icon: "router",
            label: "Guides Every Packet",
            detail: "Prevents traffic collisions across shared links.",
            cue_index: 1,
          },
        ],
      },
      {
        scene_id: "vis-diagram",
        base_scene_id: "vis-diagram",
        part_index: 1,
        part_total: 1,
        title: "How Packets Traverse Routers",
        template: "process_diagram",
        note_point_ids: ["np-2"],
        source_refs: ["src-2"],
        narration_sentences: [
          "Your laptop sends a packet with a destination IP to the local router.",
          "Each router inspects the prefix and forwards the packet toward the destination server.",
        ],
        visual_layout: "split",
        visual: {
          kind: "diagram",
          nodes: [
            { id: "n1", label: "Laptop", sublabel: "192.168.1.12", icon: "cpu", cue_index: 0 },
            { id: "n2", label: "Router", sublabel: "Gateway Hop", icon: "router", cue_index: 0 },
            { id: "n3", label: "Server", sublabel: "93.184.216.34", icon: "server", cue_index: 1 },
          ],
          edges: [
            { from: "n1", to: "n2", label: "LAN", packet: true, cue_index: 0 },
            { from: "n2", to: "n3", label: "WAN", packet: true, cue_index: 1 },
          ],
          callout: "Hop-by-hop prefix forwarding",
        },
        items: [
          { id: "vd-1", badge: "Step 1", icon: "cpu", label: "Originate Packet", detail: "Source and destination IPs are stamped in the header.", cue_index: 0 },
          { id: "vd-2", badge: "Step 2", icon: "router", label: "Forward by Prefix", detail: "Each router checks its routing table for the next hop.", cue_index: 1 },
        ],
      },
      {
        scene_id: "vis-chart",
        base_scene_id: "vis-chart",
        part_index: 1,
        part_total: 1,
        title: "IPv4 vs IPv6 Address Space",
        template: "comparison_grid",
        note_point_ids: ["np-3"],
        source_refs: ["src-3"],
        narration_sentences: [
          "IPv4 provides about 4.3 billion addresses, whereas IPv6 expands to 128-bit space.",
        ],
        visual_layout: "split",
        visual: {
          kind: "chart",
          chart_type: "bar",
          title: "Bit Width Comparison",
          bars: [
            { label: "IPv4", value: 32, suffix: "-bit" },
            { label: "IPv6", value: 128, suffix: "-bit" },
          ],
          callout: "IPv6 solves address exhaustion",
        },
        items: [
          { id: "vc-1", stat: "32-bit", icon: "chart", label: "IPv4 Space", detail: "4.3 billion addresses, now exhausted.", cue_index: 0 },
        ],
      },
      {
        scene_id: "vis-metaphor",
        base_scene_id: "vis-metaphor",
        part_index: 1,
        part_total: 1,
        title: "Street Address Analogy",
        template: "concept_reveal",
        note_point_ids: ["np-4"],
        source_refs: ["src-4"],
        narration_sentences: [
          "Just like a postal letter needs a street address to reach the right house, data needs an IP address.",
        ],
        visual_layout: "split",
        visual: {
          kind: "metaphor",
          left_label: "Postal Street Address",
          left_icon: "house",
          right_label: "Device IP Address",
          right_icon: "globe",
          connector_label: "Maps destination",
          character_pose: "point",
          caption: "Exact delivery target",
        },
        items: [
          { id: "vm-1", badge: "Analogy", icon: "house", label: "Mail Delivery", detail: "Every house on a street needs a distinct number.", cue_index: 0 },
        ],
      },
      {
        scene_id: "vis-svg",
        base_scene_id: "vis-svg",
        part_index: 1,
        part_total: 1,
        title: "Network Header Sketch",
        template: "concept_reveal",
        note_point_ids: ["np-5"],
        source_refs: ["src-5"],
        narration_sentences: [
          "Every packet wraps payload bytes behind a header holding source and destination addresses.",
        ],
        visual_layout: "split",
        visual: {
          kind: "svg_sketch",
          svg: `<svg viewBox="0 0 400 280"><rect x="30" y="70" width="140" height="120" rx="12" fill="#0c4a6e" stroke="#38bdf8" stroke-width="3"/><text x="100" y="135" fill="#f8fafc" font-size="18" text-anchor="middle" font-family="Segoe UI, sans-serif">Header (IP)</text><rect x="180" y="70" width="190" height="120" rx="12" fill="#1e1b4b" stroke="#818cf8" stroke-width="3"/><text x="275" y="135" fill="#f8fafc" font-size="18" text-anchor="middle" font-family="Segoe UI, sans-serif">Payload Data</text></svg>`,
          caption: "Packet anatomy",
        },
        items: [
          { id: "vs-1", badge: "Structure", icon: "packet", label: "Header + Payload", detail: "Routers read only the header to route the frame.", cue_index: 0 },
        ],
      },
    ];

    for (const [w, h] of [[1280, 720], [720, 1280]]) {
      const parts = paginateScenes(visualScenes, w, h);
      expect(parts.length).toBeGreaterThanOrEqual(visualScenes.length);
      for (const part of parts) {
        const audit = auditSceneLayout(part, w, h);
        expect(audit.min_font_size).toBeGreaterThanOrEqual(THEME.minFontSize);
        expect(audit.max_overlap_count).toBe(0);
        expect(audit.out_of_bounds_count).toBe(0);
      }
    }

    // Confirm animated frame progression for every SceneVisual kind
    for (const scene of visualScenes) {
      const cues: SentenceCue[] = scene.narration_sentences.map((text, idx) => ({
        sentence_index: idx,
        text,
        start_ms: idx * 1500,
        end_ms: (idx + 1) * 1500,
      }));
      const stage = new Konva.Stage({ width: THEME.width, height: THEME.height });
      const layer = new Konva.Layer({ id: "scene-layer" });
      stage.add(layer);

      renderSceneAtTime(stage, scene, 120, cues, { showCaptions: true, theme: "night" });
      const canvasEl = layer.getNativeCanvasElement() as unknown as {
        getContext: (id: "2d") => CanvasRenderingContext2D;
      };
      const early = Buffer.from(
        canvasEl.getContext("2d").getImageData(0, 0, THEME.width, THEME.height).data
      );

      renderSceneAtTime(stage, scene, 1800, cues, { showCaptions: true, theme: "night" });
      const late = Buffer.from(
        canvasEl.getContext("2d").getImageData(0, 0, THEME.width, THEME.height).data
      );
      expect(Buffer.compare(early, late)).not.toBe(0);
      stage.destroy();
    }
  });

  it("renders portrait timelines in one scene, centers sparse split/comparison layouts, and drops duplicate kinetic_title on continuations", () => {
    // 1. Portrait 3-item timeline fits on a single vertical-spine page without splitting 3x
    const portraitTimeline: SceneSpec = {
      scene_id: "tl-portrait",
      base_scene_id: "tl-portrait",
      part_index: 1,
      part_total: 1,
      title: "Evolution of Key Exchange",
      template: "timeline",
      note_point_ids: ["np-1"],
      source_refs: ["src-1"],
      narration_sentences: ["In 1976 Diffie-Hellman arrived.", "In 1977 RSA launched.", "Today TLS rules."],
      items: [
        { id: "t1", badge: "1976", label: "Diffie-Hellman", detail: "Shared secret over public links.", cue_index: 0 },
        { id: "t2", badge: "1977", label: "RSA", detail: "Asymmetric encryption.", cue_index: 1 },
        { id: "t3", badge: "Today", label: "Hybrid TLS", detail: "Fast symmetric stream.", cue_index: 2 },
      ],
    };
    const tlParts = paginateScene(portraitTimeline, 720, 1280);
    expect(tlParts.length).toBe(1);
    const tlAudit = auditSceneLayout(tlParts[0], 720, 1280);
    expect(tlAudit.max_overlap_count).toBe(0);
    expect(tlAudit.out_of_bounds_count).toBe(0);

    // 2. Sparse split-layout right card & comparison_grid row are vertically centered
    const sparseSplit: SceneSpec = {
      scene_id: "sparse-split",
      base_scene_id: "sparse-split",
      part_index: 1,
      part_total: 1,
      title: "Single Card Split",
      template: "concept_reveal",
      note_point_ids: ["np-2"],
      source_refs: ["src-2"],
      narration_sentences: ["Single metric explanation."],
      visual_layout: "split",
      visual: { kind: "chart", chart_type: "metric", metric_value: 400, metric_label: "Cycles" },
      items: [{ id: "sp-1", stat: "400x", label: "Stall", detail: "RAM miss cost.", cue_index: 0 }],
    };
    const splitLayout = computeSceneLayout(sparseSplit, 1280, 720);
    expect(splitLayout.positionedItems[0].y).toBeGreaterThan(splitLayout.contentTop + 80);

    // 3. Dense kinetic_title drops duplicate hero visual on part 2+
    const denseKinetic: SceneSpec = {
      scene_id: "dense-k",
      base_scene_id: "dense-k",
      part_index: 1,
      part_total: 1,
      title: "Intro",
      template: "concept_reveal",
      note_point_ids: ["np-3"],
      source_refs: ["src-3"],
      narration_sentences: ["Sentence one.", "Sentence two.", "Sentence three."],
      visual_layout: "hero",
      visual: { kind: "kinetic_title", headline: "Intro", chips: ["A", "B"] },
      items: Array.from({ length: 4 }, (_, i) => ({
        id: `dk-${i}`,
        label: `Item ${i + 1}`,
        detail: "Long enough detail text so four items paginate cleanly across two hero/card scenes.",
        cue_index: Math.min(2, i),
      })),
    };
    const dkParts = paginateScene(denseKinetic, 1280, 720);
    expect(dkParts.length).toBeGreaterThanOrEqual(2);
    expect(dkParts[0].visual?.kind).toBe("kinetic_title");
    expect(dkParts[1].visual).toBeNull();
  });

  it("routes 2x2 cross-row and 1x3 non-adjacent diagram edges orthogonally without intersecting nodes", () => {
    const box = { x: 48, y: 160, width: 640, height: 420 };
    const nodes2x2: DiagramNodeBox[] = [
      { id: "n0", x: 200, y: 260, w: 160, h: 96, row: 0, col: 0 },
      { id: "n1", x: 520, y: 260, w: 160, h: 96, row: 0, col: 1 },
      { id: "n2", x: 200, y: 460, w: 160, h: 96, row: 1, col: 0 },
      { id: "n3", x: 520, y: 460, w: 160, h: 96, row: 1, col: 1 },
    ];

    const zRoute = routeDiagramEdge(nodes2x2[1], nodes2x2[2], nodes2x2, box, 1);
    expect(zRoute.points.length).toBe(4);
    for (let i = 1; i < zRoute.points.length; i++) {
      const dx = Math.abs(zRoute.points[i][0] - zRoute.points[i - 1][0]);
      const dy = Math.abs(zRoute.points[i][1] - zRoute.points[i - 1][1]);
      expect(dx < 1e-6 || dy < 1e-6).toBe(true);
    }
    // Horizontal gutter segment must lie cleanly between row 0 bottom (308) and row 1 top (412)
    expect(zRoute.points[1][1]).toBeGreaterThan(nodes2x2[1].y + nodes2x2[1].h / 2);
    expect(zRoute.points[1][1]).toBeLessThan(nodes2x2[2].y - nodes2x2[2].h / 2);

    const nodes1x3: DiagramNodeBox[] = [
      { id: "a", x: 160, y: 360, w: 140, h: 90, row: 0, col: 0 },
      { id: "b", x: 360, y: 360, w: 140, h: 90, row: 0, col: 1 },
      { id: "c", x: 560, y: 360, w: 140, h: 90, row: 0, col: 2 },
    ];
    const uRoute = routeDiagramEdge(nodes1x3[0], nodes1x3[2], nodes1x3, box, 0);
    expect(uRoute.points.length).toBe(4);
    for (let i = 1; i < uRoute.points.length; i++) {
      const dx = Math.abs(uRoute.points[i][0] - uRoute.points[i - 1][0]);
      const dy = Math.abs(uRoute.points[i][1] - uRoute.points[i - 1][1]);
      expect(dx < 1e-6 || dy < 1e-6).toBe(true);
    }
    // Horizontal bypass lane must stay strictly above intermediate node b
    expect(uRoute.points[1][1]).toBeLessThan(nodes1x3[1].y - nodes1x3[1].h / 2);
  });

  it("extractCanvasRgbaBuffer returns byte-for-byte identical RGBA pixels to getImageData", () => {
    const sample: SceneSpec = {
      scene_id: "rgba-parity",
      base_scene_id: "rgba-parity",
      part_index: 1,
      part_total: 1,
      title: "RGBA Parity Test",
      template: "process_diagram",
      note_point_ids: ["np-1"],
      source_refs: ["src-1"],
      narration_sentences: ["Fast path parity check."],
      visual_layout: "split",
      visual: {
        kind: "diagram",
        nodes: [
          { id: "n0", label: "Ingress" },
          { id: "n1", label: "Router" },
          { id: "n2", label: "Worker" },
          { id: "n3", label: "Store" },
        ],
        edges: [
          { from: "n0", to: "n1" },
          { from: "n1", to: "n2", label: "dispatch" },
          { from: "n2", to: "n3" },
        ],
      },
      items: [{ id: "it-1", label: "Clean Routing", detail: "Orthogonal Z-bend verified.", cue_index: 0 }],
    };

    const cues: SentenceCue[] = [
      { sentence_index: 0, text: "Fast path parity check.", start_ms: 0, end_ms: 2500 },
    ];
    const stage = new Konva.Stage({ width: THEME.width, height: THEME.height });
    const layer = new Konva.Layer({ id: "scene-layer", listening: false });
    stage.add(layer);

    renderSceneAtTime(stage, sample, 1200, cues, { showCaptions: true, theme: "night" });
    const canvasEl = layer.getNativeCanvasElement() as unknown as NativePixelCanvasLike;
    const direct = extractCanvasRgbaBuffer(canvasEl, THEME.width, THEME.height);
    const img = canvasEl.getContext("2d").getImageData(0, 0, THEME.width, THEME.height);
    const copy = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);

    expect(direct.byteLength).toBe(copy.byteLength);
    expect(Buffer.compare(Buffer.from(direct), copy)).toBe(0);
    stage.destroy();
  });
});
