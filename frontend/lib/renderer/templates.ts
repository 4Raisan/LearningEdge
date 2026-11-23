import Konva from "konva";
import { computeSceneLayout } from "./layout";
import { THEME } from "./theme";
import type { ComputedSceneLayout, PositionedItem, SceneSpec, SentenceCue } from "./types";

const layoutCache = new WeakMap<SceneSpec, { key: string; layout: ComputedSceneLayout }>();

function getCachedLayout(scene: SceneSpec, width: number, height: number): ComputedSceneLayout {
  const key = `${scene.scene_id}:${width}x${height}:${scene.items.length}:${scene.title}:${scene.subtitle ?? ""}`;
  const hit = layoutCache.get(scene);
  if (hit && hit.key === key) {
    return hit.layout;
  }
  const computed = computeSceneLayout(scene, width, height);
  layoutCache.set(scene, { key, layout: computed });
  return computed;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function itemVisibility(
  itemIndex: number,
  totalItems: number,
  cueIndex: number | null | undefined,
  timeMs: number,
  cues: SentenceCue[]
): { opacity: number; slideY: number; isActive: boolean } {
  if (cues.length === 0) {
    const staggerMs = itemIndex * 350;
    const p = easeOutCubic((timeMs - staggerMs) / 260);
    return { opacity: Math.max(0.15, p), slideY: (1 - p) * 14, isActive: false };
  }

  const idx =
    cueIndex !== null && cueIndex !== undefined && cueIndex >= 0 && cueIndex < cues.length
      ? cueIndex
      : Math.min(cues.length - 1, Math.floor((itemIndex * cues.length) / Math.max(1, totalItems)));

  const cue = cues[idx];
  const revealDuration = 280;
  if (timeMs < cue.start_ms) {
    // Subtle ghost preview before reveal so structure feels cohesive yet reveals cleanly at cue
    return { opacity: 0.14, slideY: 12, isActive: false };
  }
  const p = easeOutCubic((timeMs - cue.start_ms) / revealDuration);
  const isActive = timeMs >= cue.start_ms && timeMs <= cue.end_ms;
  return { opacity: p, slideY: (1 - p) * 12, isActive };
}

function activeCueText(timeMs: number, cues: SentenceCue[]): string {
  if (cues.length === 0) return "";
  const exact = cues.find((c) => timeMs >= c.start_ms && timeMs <= c.end_ms);
  if (exact) return exact.text;
  const last = [...cues].reverse().find((c) => timeMs >= c.start_ms);
  return (last ?? cues[0]).text;
}

function drawConceptItem(
  layer: Konva.Layer,
  pos: PositionedItem,
  vis: { opacity: number; slideY: number; isActive: boolean }
) {
  const group = new Konva.Group({
    x: pos.x,
    y: pos.y + vis.slideY,
    opacity: vis.opacity,
  });

  group.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: pos.width,
      height: pos.height,
      cornerRadius: 12,
      fill: vis.isActive ? THEME.colors.surfaceActive : THEME.colors.surface,
      stroke: vis.isActive ? THEME.colors.accent : THEME.colors.surfaceBorder,
      strokeWidth: vis.isActive ? 2.5 : 1.5,
    })
  );

  // Left accent bar
  group.add(
    new Konva.Rect({
      x: 0,
      y: 10,
      width: 6,
      height: Math.max(16, pos.height - 20),
      cornerRadius: 3,
      fill: vis.isActive ? THEME.colors.accent : THEME.colors.emerald,
    })
  );

  const padX = 22;
  const padY = 16;
  let badgeOffset = 0;

  if (pos.badgeLines.length > 0) {
    const badgeW = Math.min(220, pos.badgeLines[0].length * 11 + 28);
    group.add(
      new Konva.Rect({
        x: padX,
        y: padY,
        width: badgeW,
        height: 28,
        cornerRadius: 6,
        fill: THEME.colors.accentSoft,
        stroke: THEME.colors.accent,
        strokeWidth: 1,
      })
    );
    group.add(
      new Konva.Text({
        x: padX,
        y: padY + 4,
        width: badgeW,
        align: "center",
        text: pos.badgeLines[0],
        fontSize: pos.badgeFontSize,
        fontStyle: "bold",
        fontFamily: THEME.fontFamily,
        fill: THEME.colors.accent,
      })
    );
    badgeOffset = badgeW + 14;
  }

  const labelText = pos.labelLines.join("\n");
  const labelH = Math.max(1, pos.labelLines.length) * Math.ceil(pos.labelFontSize * 1.32);

  group.add(
    new Konva.Text({
      x: padX + badgeOffset,
      y: padY,
      width: pos.width - padX * 2 - badgeOffset,
      text: labelText,
      fontSize: pos.labelFontSize,
      lineHeight: 1.3,
      fontStyle: "bold",
      fontFamily: THEME.fontFamily,
      fill: THEME.colors.textPrimary,
    })
  );

  if (pos.detailLines.length > 0) {
    group.add(
      new Konva.Text({
        x: padX,
        y: padY + labelH + 8,
        width: pos.width - padX * 2,
        text: pos.detailLines.join("\n"),
        fontSize: pos.detailFontSize,
        lineHeight: 1.3,
        fontFamily: THEME.fontFamily,
        fill: THEME.colors.textSecondary,
      })
    );
  }

  layer.add(group);
}

function drawColumnCard(
  layer: Konva.Layer,
  pos: PositionedItem,
  vis: { opacity: number; slideY: number; isActive: boolean },
  accentColor: string
) {
  const group = new Konva.Group({
    x: pos.x,
    y: pos.y + vis.slideY,
    opacity: vis.opacity,
  });

  group.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: pos.width,
      height: pos.height,
      cornerRadius: 12,
      fill: vis.isActive ? THEME.colors.surfaceActive : THEME.colors.surface,
      stroke: vis.isActive ? THEME.colors.accent : THEME.colors.surfaceBorder,
      strokeWidth: vis.isActive ? 2.5 : 1.5,
    })
  );

  const padX = 18;
  let curY = 16;

  if (pos.badgeLines.length > 0) {
    const badgeH = pos.badgeLines.length * Math.ceil(pos.badgeFontSize * 1.32) + 8;
    group.add(
      new Konva.Rect({
        x: padX,
        y: curY,
        width: pos.width - padX * 2,
        height: badgeH,
        cornerRadius: 6,
        fill: THEME.colors.accentSoft,
      })
    );
    group.add(
      new Konva.Text({
        x: padX + 8,
        y: curY + 4,
        width: pos.width - padX * 2 - 16,
        text: pos.badgeLines.join("\n"),
        fontSize: pos.badgeFontSize,
        lineHeight: 1.3,
        fontStyle: "bold",
        fontFamily: THEME.fontFamily,
        fill: accentColor,
      })
    );
    curY += badgeH + 10;
  }

  const labelH = Math.max(1, pos.labelLines.length) * Math.ceil(pos.labelFontSize * 1.32);
  group.add(
    new Konva.Text({
      x: padX,
      y: curY,
      width: pos.width - padX * 2,
      text: pos.labelLines.join("\n"),
      fontSize: pos.labelFontSize,
      lineHeight: 1.3,
      fontStyle: "bold",
      fontFamily: THEME.fontFamily,
      fill: THEME.colors.textPrimary,
    })
  );
  curY += labelH + 10;

  if (pos.detailLines.length > 0) {
    group.add(
      new Konva.Text({
        x: padX,
        y: curY,
        width: pos.width - padX * 2,
        text: pos.detailLines.join("\n"),
        fontSize: pos.detailFontSize,
        lineHeight: 1.3,
        fontFamily: THEME.fontFamily,
        fill: THEME.colors.textSecondary,
      })
    );
  }

  layer.add(group);
}

/**
 * Pure timestamp-driven Konva renderer shared identically by preview & export.
 */
export function renderSceneAtTime(
  stage: Konva.Stage,
  scene: SceneSpec,
  timeMs: number,
  cues: SentenceCue[],
  options?: { showCaptions?: boolean; width?: number; height?: number }
): void {
  const width = options?.width ?? THEME.width;
  const height = options?.height ?? THEME.height;
  const showCaptions = options?.showCaptions ?? true;

  if (stage.width() !== width) stage.width(width);
  if (stage.height() !== height) stage.height(height);

  let layer = stage.findOne<Konva.Layer>("#scene-layer");
  if (!layer) {
    layer = new Konva.Layer({ id: "scene-layer" });
    stage.add(layer);
  }
  layer.destroyChildren();

  const layout = getCachedLayout(scene, width, height);

  // Background
  layer.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width,
      height,
      fill: THEME.colors.bg,
    })
  );
  layer.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width,
      height: layout.headerBottom,
      fill: THEME.colors.bgTopGlow,
    })
  );
  layer.add(
    new Konva.Line({
      points: [THEME.safeMargin, layout.headerBottom, width - THEME.safeMargin, layout.headerBottom],
      stroke: THEME.colors.surfaceBorder,
      strokeWidth: 1.5,
    })
  );

  // Title & subtitle
  layer.add(
    new Konva.Text({
      x: THEME.safeMargin,
      y: 34,
      width: width - THEME.safeMargin * 2 - 230,
      text: layout.titleLines.join("\n"),
      fontSize: THEME.titleFontSize,
      lineHeight: 1.25,
      fontStyle: "bold",
      fontFamily: THEME.fontFamily,
      fill: THEME.colors.textPrimary,
    })
  );

  if (layout.subtitleLines.length > 0) {
    const titleH =
      Math.max(1, layout.titleLines.length) * Math.ceil(THEME.titleFontSize * 1.32);
    layer.add(
      new Konva.Text({
        x: THEME.safeMargin,
        y: 34 + titleH + 4,
        width: width - THEME.safeMargin * 2,
        text: layout.subtitleLines.join("\n"),
        fontSize: THEME.subtitleFontSize,
        lineHeight: 1.3,
        fontFamily: THEME.fontFamily,
        fill: THEME.colors.textMuted,
      })
    );
  }

  // Note ID & Source Ref badge in top-right
  const metaBadgeText = [
    scene.note_point_ids.join(", "),
    scene.source_refs.slice(0, 2).join(", "),
  ]
    .filter(Boolean)
    .join(" | ");
  if (metaBadgeText) {
    layer.add(
      new Konva.Rect({
        x: width - THEME.safeMargin - 218,
        y: 34,
        width: 218,
        height: 36,
        cornerRadius: 8,
        fill: THEME.colors.surface,
        stroke: THEME.colors.surfaceBorder,
        strokeWidth: 1,
      })
    );
    layer.add(
      new Konva.Text({
        x: width - THEME.safeMargin - 210,
        y: 42,
        width: 202,
        align: "center",
        text: metaBadgeText,
        fontSize: THEME.badgeFontSize,
        fontFamily: THEME.fontFamily,
        fill: THEME.colors.accent,
        ellipsis: true,
        wrap: "none",
      })
    );
  }

  // Template rendering
  if (scene.template === "concept_reveal") {
    layout.positionedItems.forEach((pos, idx) => {
      const vis = itemVisibility(
        idx,
        layout.positionedItems.length,
        pos.item.cue_index,
        timeMs,
        cues
      );
      drawConceptItem(layer!, pos, vis);
    });
  } else if (scene.template === "process_diagram") {
    layout.positionedItems.forEach((pos, idx) => {
      const vis = itemVisibility(
        idx,
        layout.positionedItems.length,
        pos.item.cue_index,
        timeMs,
        cues
      );
      drawColumnCard(layer!, pos, vis, THEME.colors.accent);
      if (idx < layout.positionedItems.length - 1) {
        const next = layout.positionedItems[idx + 1];
        const midY = pos.y + Math.floor(pos.height / 2);
        layer!.add(
          new Konva.Arrow({
            points: [pos.x + pos.width + 4, midY, next.x - 4, midY],
            pointerLength: 9,
            pointerWidth: 9,
            fill: THEME.colors.accent,
            stroke: THEME.colors.accent,
            strokeWidth: 3,
            opacity: Math.max(0.25, vis.opacity),
          })
        );
      }
    });
  } else {
    // timeline
    const spineY = layout.contentTop + 56;
    layer.add(
      new Konva.Line({
        points: [THEME.safeMargin, spineY, width - THEME.safeMargin, spineY],
        stroke: THEME.colors.surfaceBorder,
        strokeWidth: 4,
      })
    );

    layout.positionedItems.forEach((pos, idx) => {
      const vis = itemVisibility(
        idx,
        layout.positionedItems.length,
        pos.item.cue_index,
        timeMs,
        cues
      );
      const centerX = pos.x + Math.floor(pos.width / 2);

      // Node dot on spine
      layer!.add(
        new Konva.Circle({
          x: centerX,
          y: spineY,
          radius: vis.isActive ? 11 : 8,
          fill: vis.isActive ? THEME.colors.amber : THEME.colors.accent,
          stroke: THEME.colors.bg,
          strokeWidth: 2,
          opacity: Math.max(0.35, vis.opacity),
        })
      );

      // Connector stem from spine down to card
      layer!.add(
        new Konva.Line({
          points: [centerX, spineY + 10, centerX, pos.y + vis.slideY],
          stroke: vis.isActive ? THEME.colors.amber : THEME.colors.surfaceBorder,
          strokeWidth: 2,
          opacity: Math.max(0.25, vis.opacity),
        })
      );

      // Era badge above spine
      if (pos.item.badge) {
        layer!.add(
          new Konva.Text({
            x: pos.x,
            y: spineY - 38,
            width: pos.width,
            align: "center",
            text: pos.item.badge,
            fontSize: THEME.labelFontSize,
            fontStyle: "bold",
            fontFamily: THEME.fontFamily,
            fill: vis.isActive ? THEME.colors.amber : THEME.colors.accent,
            opacity: Math.max(0.35, vis.opacity),
          })
        );
      }

      drawColumnCard(layer!, pos, vis, THEME.colors.amber);
    });
  }

  // Caption bar (when enabled for live preview)
  if (showCaptions) {
    const caption = activeCueText(timeMs, cues);
    if (caption) {
      const capY = height - THEME.captionZoneHeight + 8;
      layer.add(
        new Konva.Rect({
          x: THEME.safeMargin,
          y: capY,
          width: width - THEME.safeMargin * 2,
          height: 62,
          cornerRadius: 10,
          fill: "#090e1c",
          opacity: 0.92,
          stroke: THEME.colors.captionBorder,
          strokeWidth: 1,
        })
      );
      layer.add(
        new Konva.Text({
          x: THEME.safeMargin + 16,
          y: capY + 10,
          width: width - THEME.safeMargin * 2 - 32,
          height: 44,
          align: "center",
          verticalAlign: "middle",
          text: caption,
          fontSize: 18,
          lineHeight: 1.25,
          fontFamily: THEME.fontFamily,
          fill: THEME.colors.textPrimary,
        })
      );
    }
  } else if (scene.footer_note) {
    layer.add(
      new Konva.Text({
        x: THEME.safeMargin,
        y: height - 40,
        width: width - THEME.safeMargin * 2,
        text: `${scene.footer_note} · Sources: ${scene.source_refs.join(", ")}`,
        fontSize: THEME.footerFontSize,
        fontFamily: THEME.fontFamily,
        fill: THEME.colors.textMuted,
      })
    );
  }

  layer.draw();
}
