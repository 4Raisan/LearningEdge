import Konva from "konva";
import { computeSceneLayout } from "./layout";
import { renderSceneVisual } from "./motionVisuals";
import { THEME } from "./theme";
import type { ComputedSceneLayout, PositionedItem, SceneSpec, SceneTemplate, SentenceCue } from "./types";
import {
  createOffscreenCanvas,
  drawChipLabel,
  drawConnector,
  drawGlobalProgressBar,
  drawHighlightBox,
  drawKineticMaskText,
  drawMotionBackdrop,
  drawVectorIcon,
  easeOutCubic,
  progressWindow,
  resolveIconName,
  resolvePalette,
  roundedRectPath,
  type MotionPalette,
} from "./visualKit";

export interface RenderOptions {
  showCaptions?: boolean;
  width?: number;
  height?: number;
  theme?: string;
  sceneIndex?: number;
  sceneTotal?: number;
  sceneDurationMs?: number;
}

const layoutCache = new WeakMap<SceneSpec, { key: string; layout: ComputedSceneLayout }>();
const cardSpriteCache = new Map<string, HTMLCanvasElement>();

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

function rawCanvas2d(konvaCtx: Konva.Context): CanvasRenderingContext2D {
  return (konvaCtx as unknown as { _context?: CanvasRenderingContext2D })._context ??
    (konvaCtx as unknown as CanvasRenderingContext2D);
}

function resolveThemeName(explicit?: string): string {
  if (explicit === "light" || explicit === "forest" || explicit === "night") {
    return explicit;
  }
  const bg = THEME.colors.bg.toLowerCase();
  if (bg.startsWith("#f5") || bg.startsWith("#ff")) return "light";
  if (bg.startsWith("#1028") || bg.startsWith("#071")) return "forest";
  return "night";
}

function templateDisplayName(tpl: SceneTemplate): string {
  switch (tpl) {
    case "concept_reveal":
      return "CONCEPT REVEAL";
    case "process_diagram":
      return "PROCESS FLOW";
    case "timeline":
      return "TIMELINE";
    case "comparison_grid":
      return "COMPARISON";
    case "recap_ladder":
      return "KEY RECAP";
  }
}

function itemVisibility(
  itemIndex: number,
  totalItems: number,
  cueIndex: number | null | undefined,
  timeMs: number,
  cues: SentenceCue[]
): { opacity: number; slideY: number; revealProgress: number; isActive: boolean } {
  if (cues.length === 0) {
    const staggerMs = itemIndex * 320;
    const p = easeOutCubic((timeMs - staggerMs) / 280);
    return { opacity: Math.max(0.18, p), slideY: (1 - p) * 14, revealProgress: p, isActive: false };
  }

  const idx =
    cueIndex !== null && cueIndex !== undefined && cueIndex >= 0 && cueIndex < cues.length
      ? cueIndex
      : Math.min(cues.length - 1, Math.floor((itemIndex * cues.length) / Math.max(1, totalItems)));

  const cue = cues[idx];
  const revealDuration = 320;
  if (timeMs < cue.start_ms) {
    return { opacity: 0.16, slideY: 12, revealProgress: 0.12, isActive: false };
  }
  const p = easeOutCubic((timeMs - cue.start_ms) / revealDuration);
  const isActive = timeMs >= cue.start_ms && timeMs <= cue.end_ms;
  return { opacity: p, slideY: (1 - p) * 12, revealProgress: p, isActive };
}

function activeCueText(timeMs: number, cues: SentenceCue[]): string {
  if (cues.length === 0) return "";
  const exact = cues.find((c) => timeMs >= c.start_ms && timeMs <= c.end_ms);
  if (exact) return exact.text;
  const last = [...cues].reverse().find((c) => timeMs >= c.start_ms);
  return (last ?? cues[0]).text;
}

function renderCardInteriorToCanvas(
  ctx: CanvasRenderingContext2D,
  pos: PositionedItem,
  index: number,
  isActive: boolean,
  accentColor: string,
  palette: MotionPalette,
  template: SceneTemplate,
  isColumnCard: boolean,
  isCompactVisualCard = false
): void {
  const padX = isColumnCard || isCompactVisualCard ? 18 : 22;
  const padY = isCompactVisualCard ? 13 : 16;

  // Card surface
  roundedRectPath(ctx, 0, 0, pos.width, pos.height, 14);
  ctx.fillStyle = isActive ? palette.surfaceActive : palette.surface;
  ctx.fill();
  ctx.strokeStyle = isActive ? accentColor : palette.border;
  ctx.lineWidth = isActive ? 2.4 : 1.3;
  ctx.stroke();

  if (isColumnCard || isCompactVisualCard) {
    roundedRectPath(ctx, 14, 0, Math.max(24, pos.width - 28), 4, 2);
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = isActive ? 0.95 : 0.65;
    ctx.fill();
    ctx.globalAlpha = 1;

    let curY = padY;
    if (pos.badgeLines.length > 0) {
      const lineH = Math.ceil(pos.badgeFontSize * 1.3);
      const badgeH = pos.badgeLines.length * Math.ceil(pos.badgeFontSize * 1.32) + 8;
      const badgeW = Math.max(96, pos.width - padX * 2 - 42);
      roundedRectPath(ctx, padX, curY, badgeW, badgeH, 7);
      ctx.fillStyle = isActive ? accentColor : palette.surfaceActive;
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = `700 ${pos.badgeFontSize}px ${THEME.fontFamily}`;
      ctx.fillStyle = isActive ? palette.badgeText : accentColor;
      ctx.textBaseline = "top";
      pos.badgeLines.forEach((line, i) => {
        ctx.fillText(line, padX + 10, curY + 4 + i * lineH, badgeW - 20);
      });
      curY += badgeH + (isCompactVisualCard ? 8 : 10);
    } else if (isColumnCard) {
      curY += 26;
    }

    const labelLH = Math.ceil(pos.labelFontSize * 1.32);
    ctx.font = `700 ${pos.labelFontSize}px ${THEME.fontFamily}`;
    ctx.fillStyle = palette.textPrimary;
    ctx.textBaseline = "top";
    const labelMaxW = pos.width - padX * 2 - (isCompactVisualCard && pos.badgeLines.length === 0 ? 44 : 0);
    pos.labelLines.forEach((line, i) => {
      ctx.fillText(line, padX, curY + i * labelLH, labelMaxW);
    });
    curY += Math.max(1, pos.labelLines.length) * labelLH + (isCompactVisualCard ? 6 : 10);

    if (pos.detailLines.length > 0) {
      const detailLH = Math.ceil(pos.detailFontSize * 1.3);
      ctx.font = `${pos.detailFontSize}px ${THEME.fontFamily}`;
      ctx.fillStyle = palette.textSecondary;
      pos.detailLines.forEach((line, i) => {
        ctx.fillText(line, padX, curY + i * detailLH, pos.width - padX * 2);
      });
    }
    return;
  }

  // Left vertical accent rail for concept_reveal / recap_ladder
  const barGrad = ctx.createLinearGradient(0, 10, 0, pos.height - 10);
  barGrad.addColorStop(0, accentColor);
  barGrad.addColorStop(1, palette.accentSecondary);
  roundedRectPath(ctx, 0, 10, 6, Math.max(16, pos.height - 20), 3);
  ctx.fillStyle = barGrad;
  ctx.fill();

  let badgeOffset = 0;
  if (pos.badgeLines.length > 0) {
    const labelStr = template === "recap_ladder" ? `#${index + 1} · ${pos.badgeLines[0]}` : pos.badgeLines[0];
    const badgeW = Math.min(220, labelStr.length * 10.5 + 26);
    roundedRectPath(ctx, padX, padY, badgeW, 28, 7);
    ctx.fillStyle = isActive ? accentColor : palette.surfaceActive;
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `700 ${pos.badgeFontSize}px ${THEME.fontFamily}`;
    ctx.fillStyle = isActive ? palette.badgeText : accentColor;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(labelStr, padX + badgeW / 2, padY + 14, badgeW - 10);
    ctx.textAlign = "left";
    badgeOffset = badgeW + 14;
  }

  const labelLH = Math.ceil(pos.labelFontSize * 1.32);
  ctx.font = `700 ${pos.labelFontSize}px ${THEME.fontFamily}`;
  ctx.fillStyle = palette.textPrimary;
  ctx.textBaseline = "top";
  const labelW = Math.max(140, pos.width - padX * 2 - badgeOffset - 44);
  pos.labelLines.forEach((line, i) => {
    ctx.fillText(line, padX + badgeOffset, padY + i * labelLH, labelW);
  });

  if (pos.detailLines.length > 0) {
    const labelH = Math.max(1, pos.labelLines.length) * labelLH;
    const detailLH = Math.ceil(pos.detailFontSize * 1.3);
    ctx.font = `${pos.detailFontSize}px ${THEME.fontFamily}`;
    ctx.fillStyle = palette.textSecondary;
    pos.detailLines.forEach((line, i) => {
      ctx.fillText(line, padX, padY + labelH + 8 + i * detailLH, pos.width - padX * 2);
    });
  }
}

function drawCardFast(
  ctx: CanvasRenderingContext2D,
  sceneId: string,
  pos: PositionedItem,
  index: number,
  vis: { opacity: number; slideY: number; revealProgress: number; isActive: boolean },
  accentColor: string,
  timeMs: number,
  palette: MotionPalette,
  template: SceneTemplate,
  isColumnCard: boolean,
  isCompactVisualCard = false
): void {
  const x = pos.x;
  const y = pos.y + vis.slideY;

  ctx.save();
  ctx.globalAlpha = vis.opacity;

  // Breathing outer glow halo when active (pure double stroke, zero slow shadowBlur)
  if (vis.isActive) {
    const pulse = 0.5 + 0.5 * Math.sin((timeMs / 1000) * 4.5);
    ctx.save();
    roundedRectPath(ctx, x - 2, y - 2, pos.width + 4, pos.height + 4, 16);
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = vis.opacity * (0.16 + pulse * 0.14);
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  }

  const cacheKey = `${sceneId}:${pos.item.id}:${pos.width}x${pos.height}:${palette.name}:${template}:${isColumnCard ? "c" : isCompactVisualCard ? "v" : "r"}:${vis.isActive ? 1 : 0}:${accentColor}:${pos.item.stat ?? ""}:${pos.item.badge ?? ""}:${pos.item.label}:${pos.item.detail}`;
  let sprite = cardSpriteCache.get(cacheKey);
  if (!sprite) {
    const off = createOffscreenCanvas(ctx, Math.ceil(pos.width), Math.ceil(pos.height));
    if (off) {
      const octx = off.getContext("2d");
      if (octx) {
        renderCardInteriorToCanvas(
          octx,
          pos,
          index,
          vis.isActive,
          accentColor,
          palette,
          template,
          isColumnCard,
          isCompactVisualCard
        );
        if (cardSpriteCache.size > 400) cardSpriteCache.clear();
        cardSpriteCache.set(cacheKey, off);
        sprite = off;
      }
    }
  }

  if (sprite) {
    ctx.drawImage(sprite, x, y);
  } else {
    ctx.save();
    ctx.translate(x, y);
    renderCardInteriorToCanvas(
      ctx,
      pos,
      index,
      vis.isActive,
      accentColor,
      palette,
      template,
      isColumnCard,
      isCompactVisualCard
    );
    ctx.restore();
  }

  // Animated semantic vector icon chip in top-right corner
  const cx = x + pos.width - (isColumnCard || isCompactVisualCard ? 24 : 26);
  const cy = y + (isCompactVisualCard ? 27 : 30);
  ctx.beginPath();
  ctx.arc(cx, cy, 15, 0, Math.PI * 2);
  ctx.fillStyle = vis.isActive ? accentColor : palette.surfaceActive;
  ctx.globalAlpha = vis.opacity * (vis.isActive ? 0.22 : 0.85);
  ctx.fill();
  ctx.strokeStyle = vis.isActive ? accentColor : palette.border;
  ctx.lineWidth = 1.25;
  ctx.globalAlpha = vis.opacity * (vis.isActive ? 0.9 : 0.65);
  ctx.stroke();
  ctx.globalAlpha = vis.opacity;
  const iconName = resolveIconName(
    pos.item.icon,
    `${pos.item.badge ?? ""} ${pos.item.label} ${pos.item.detail}`,
    index
  );
  drawVectorIcon(ctx, iconName, cx, cy, 18, accentColor, vis.revealProgress);

  ctx.restore();
}

export interface NativePixelCanvasLike {
  data?: () => Uint8Array;
  getContext: (id: "2d") => CanvasRenderingContext2D;
  toBuffer?: (mime: string) => Uint8Array;
}

/**
 * Extract raw RGBA pixels using native `@napi-rs/canvas` `data()` when available
 * to avoid unmanaged `getImageData()` allocations, falling back to 2D `getImageData`.
 */
export function extractCanvasRgbaBuffer(
  canvasEl: NativePixelCanvasLike,
  width: number,
  height: number
): Uint8Array {
  if (typeof canvasEl.data === "function") {
    return canvasEl.data();
  }
  const img = canvasEl.getContext("2d").getImageData(0, 0, width, height);
  return new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
}

/**
 * Pure timestamp-driven Konva motion-graphics renderer shared by live preview & FFmpeg export.
 */
export function renderSceneAtTime(
  stage: Konva.Stage,
  scene: SceneSpec,
  timeMs: number,
  cues: SentenceCue[],
  options?: RenderOptions
): void {
  const width = options?.width ?? THEME.width;
  const height = options?.height ?? THEME.height;
  const showCaptions = options?.showCaptions ?? true;
  const sceneIndex = options?.sceneIndex ?? 0;
  const sceneTotal = options?.sceneTotal ?? 1;
  const lastCueEnd = cues.length > 0 ? cues[cues.length - 1].end_ms : 4000;
  const sceneDurationMs = options?.sceneDurationMs ?? Math.max(4000, lastCueEnd);
  const palette = resolvePalette(resolveThemeName(options?.theme));

  if (stage.width() !== width) stage.width(width);
  if (stage.height() !== height) stage.height(height);

  let layer = stage.findOne<Konva.Layer>("#scene-layer");
  if (!layer) {
    layer = new Konva.Layer({ id: "scene-layer", listening: false });
    stage.add(layer);
  }

  const layout = getCachedLayout(scene, width, height);
  const introP = progressWindow(timeMs, 0, 520);

  let shape = layer.findOne<Konva.Shape>("#motion-scene");
  if (!shape) {
    shape = new Konva.Shape({ id: "motion-scene", listening: false });
    layer.add(shape);
  }
  shape.sceneFunc((konvaCtx) => {
        const ctx = rawCanvas2d(konvaCtx);

        // 1. Continuous ambient backdrop + top global progress bar
        drawMotionBackdrop(ctx, width, height, timeMs, palette);
        drawGlobalProgressBar(ctx, width, sceneIndex, sceneTotal, timeMs, sceneDurationMs, palette);

        // Header divider line
        ctx.save();
        const divGrad = ctx.createLinearGradient(THEME.safeMargin, 0, width - THEME.safeMargin, 0);
        divGrad.addColorStop(0, palette.accentPrimary);
        divGrad.addColorStop(0.5, palette.accentSecondary);
        divGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.strokeStyle = divGrad;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(THEME.safeMargin, layout.headerBottom);
        ctx.lineTo(THEME.safeMargin + (width - THEME.safeMargin * 2) * easeOutCubic(introP), layout.headerBottom);
        ctx.stroke();
        ctx.restore();

        // 2. Clean top-right kicker pill
        const sceneTag = sceneTotal > 1 ? `SCENE ${sceneIndex + 1}/${sceneTotal} · ` : "";
        const kickerText = `${sceneTag}${templateDisplayName(scene.template)}`;
        ctx.save();
        const kx = width - THEME.safeMargin - 216;
        roundedRectPath(ctx, kx, 34, 216, 34, 8);
        ctx.fillStyle = palette.surface;
        ctx.fill();
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.font = `700 ${THEME.badgeFontSize - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = palette.accentPrimary;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(kickerText, kx + 108, 51, 200);
        ctx.restore();

        // 3. Kinetic headline & clean subtitle
        const titleLH = Math.ceil(THEME.titleFontSize * 1.25);
        layout.titleLines.forEach((line, idx) => {
          drawKineticMaskText(
            ctx,
            line,
            THEME.safeMargin,
            34 + idx * titleLH,
            `700 ${THEME.titleFontSize}px ${THEME.fontFamily}`,
            palette.textPrimary,
            timeMs / 1000,
            { start: idx * 0.08, stagger: 0.045, dur: 0.4 }
          );
        });

        const cleanSub =
          scene.subtitle && !scene.subtitle.startsWith("Verified note ") ? scene.subtitle : "";
        if (cleanSub && layout.subtitleLines.length > 0) {
          const titleH = Math.max(1, layout.titleLines.length) * Math.ceil(THEME.titleFontSize * 1.32);
          const subLH = Math.ceil(THEME.subtitleFontSize * 1.3);
          ctx.save();
          ctx.globalAlpha = easeOutCubic(introP);
          ctx.font = `${THEME.subtitleFontSize}px ${THEME.fontFamily}`;
          ctx.fillStyle = palette.textMuted;
          ctx.textBaseline = "top";
          layout.subtitleLines.forEach((line, i) => {
            ctx.fillText(line, THEME.safeMargin, 34 + titleH + 4 + i * subLH, width - THEME.safeMargin * 2);
          });
          ctx.restore();
        }

        // 4. Visual stage (kinetic_title, diagram, chart, metaphor, svg_sketch) + cards
        if (layout.visualBox && scene.visual) {
          renderSceneVisual(
            ctx,
            scene.visual,
            layout.visualBox,
            timeMs,
            cues,
            palette,
            sceneDurationMs
          );
          layout.positionedItems.forEach((pos, idx) => {
            const vis = itemVisibility(
              idx,
              layout.positionedItems.length,
              pos.item.cue_index,
              timeMs,
              cues
            );
            const accent = idx % 2 === 0 ? palette.accentPrimary : palette.accentSecondary;
            drawCardFast(
              ctx,
              scene.scene_id,
              pos,
              idx,
              vis,
              vis.isActive ? palette.accentWarm : accent,
              timeMs,
              palette,
              scene.template,
              false,
              true
            );
            if (vis.isActive) {
              drawHighlightBox(
                ctx,
                pos.x - 1,
                pos.y + vis.slideY - 1,
                pos.width + 2,
                pos.height + 2,
                palette.accentWarm,
                vis.revealProgress,
                0.7,
                14
              );
            }
          });
        } else if (scene.template === "concept_reveal" || scene.template === "recap_ladder") {
          if (scene.template === "recap_ladder" && layout.positionedItems.length > 1) {
            for (let idx = 0; idx < layout.positionedItems.length - 1; idx++) {
              const curr = layout.positionedItems[idx];
              const next = layout.positionedItems[idx + 1];
              const nextVis = itemVisibility(idx + 1, layout.positionedItems.length, next.item.cue_index, timeMs, cues);
              drawConnector(
                ctx,
                curr.x + 14,
                curr.y + curr.height + 2,
                next.x + 14,
                next.y - 2,
                nextVis.revealProgress,
                timeMs,
                palette.accentWarm,
                palette.accentPrimary
              );
            }
          }
          layout.positionedItems.forEach((pos, idx) => {
            const vis = itemVisibility(idx, layout.positionedItems.length, pos.item.cue_index, timeMs, cues);
            const accent =
              scene.template === "recap_ladder"
                ? idx % 2 === 0 ? palette.accentWarm : palette.accentPrimary
                : vis.isActive ? palette.accentPrimary : palette.accentSecondary;
            drawCardFast(ctx, scene.scene_id, pos, idx, vis, accent, timeMs, palette, scene.template, false);
          });
        } else if (scene.template === "comparison_grid") {
          if (layout.positionedItems.length === 2 && width - THEME.safeMargin * 2 >= 820) {
            const left = layout.positionedItems[0];
            const right = layout.positionedItems[1];
            const midX = (left.x + left.width + right.x) / 2;
            const topY = Math.min(left.y, right.y) + 12;
            const botY = Math.max(left.y + left.height, right.y + right.height) - 12;
            ctx.save();
            ctx.strokeStyle = palette.border;
            ctx.lineWidth = 1.6;
            ctx.setLineDash([6, 6]);
            ctx.globalAlpha = 0.65 * easeOutCubic(introP);
            ctx.beginPath();
            ctx.moveTo(midX, topY);
            ctx.lineTo(midX, botY);
            ctx.stroke();
            ctx.restore();
            drawChipLabel(
              ctx,
              "VS",
              midX,
              (topY + botY) / 2,
              palette.accentWarm,
              palette.bgStart,
              easeOutCubic(introP),
              13,
              THEME.fontFamily
            );
          }
          layout.positionedItems.forEach((pos, idx) => {
            const vis = itemVisibility(idx, layout.positionedItems.length, pos.item.cue_index, timeMs, cues);
            const colAccent = idx % 2 === 0 ? palette.accentPrimary : palette.accentSecondary;
            drawCardFast(ctx, scene.scene_id, pos, idx, vis, colAccent, timeMs, palette, scene.template, true);
          });
        } else if (scene.template === "process_diagram") {
          for (let idx = 0; idx < layout.positionedItems.length - 1; idx++) {
            const pos = layout.positionedItems[idx];
            const next = layout.positionedItems[idx + 1];
            const vis = itemVisibility(idx + 1, layout.positionedItems.length, next.item.cue_index, timeMs, cues);
            const midY = pos.y + Math.floor(pos.height / 2);
            drawConnector(
              ctx,
              pos.x + pos.width + 4,
              midY,
              next.x - 4,
              midY,
              vis.revealProgress,
              timeMs,
              palette.accentPrimary,
              palette.accentWarm
            );
          }
          layout.positionedItems.forEach((pos, idx) => {
            const vis = itemVisibility(idx, layout.positionedItems.length, pos.item.cue_index, timeMs, cues);
            drawCardFast(ctx, scene.scene_id, pos, idx, vis, palette.accentPrimary, timeMs, palette, scene.template, true);
          });
        } else {
          // timeline: vertical left-spine in portrait, horizontal top-spine in landscape
          const innerW = width - THEME.safeMargin * 2;
          if (innerW < 820 && layout.positionedItems.length > 0) {
            const spineX = THEME.safeMargin + 16;
            const firstPos = layout.positionedItems[0];
            const lastPos = layout.positionedItems[layout.positionedItems.length - 1];
            const topY = firstPos.y + 18;
            const botY = lastPos.y + Math.min(lastPos.height - 18, 42);
            drawConnector(
              ctx,
              spineX,
              topY,
              spineX,
              Math.max(topY + 24, botY),
              introP,
              timeMs,
              palette.accentSecondary,
              palette.accentWarm
            );

            layout.positionedItems.forEach((pos, idx) => {
              const vis = itemVisibility(idx, layout.positionedItems.length, pos.item.cue_index, timeMs, cues);
              const nodeY = pos.y + 28 + vis.slideY;

              ctx.save();
              if (vis.isActive) {
                const haloR = 13 + 3.5 * Math.sin((timeMs / 1000) * 5);
                ctx.globalAlpha = 0.28;
                ctx.fillStyle = palette.accentWarm;
                ctx.beginPath();
                ctx.arc(spineX, nodeY, haloR, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.globalAlpha = Math.max(0.4, vis.opacity);
              ctx.fillStyle = vis.isActive ? palette.accentWarm : palette.accentPrimary;
              ctx.beginPath();
              ctx.arc(spineX, nodeY, vis.isActive ? 9 : 7, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = palette.bgStart;
              ctx.lineWidth = 2;
              ctx.stroke();

              ctx.globalAlpha = Math.max(0.25, vis.opacity);
              ctx.strokeStyle = vis.isActive ? palette.accentWarm : palette.border;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(spineX + 9, nodeY);
              ctx.lineTo(pos.x, nodeY);
              ctx.stroke();
              ctx.restore();

              drawCardFast(ctx, scene.scene_id, pos, idx, vis, palette.accentWarm, timeMs, palette, scene.template, false);
            });
          } else {
            const spineY = layout.contentTop + 56;
            drawConnector(
              ctx,
              THEME.safeMargin,
              spineY,
              width - THEME.safeMargin,
              spineY,
              introP,
              timeMs,
              palette.accentSecondary,
              palette.accentWarm
            );

            layout.positionedItems.forEach((pos, idx) => {
              const vis = itemVisibility(idx, layout.positionedItems.length, pos.item.cue_index, timeMs, cues);
              const centerX = pos.x + Math.floor(pos.width / 2);

              ctx.save();
              if (vis.isActive) {
                const haloR = 14 + 4 * Math.sin((timeMs / 1000) * 5);
                ctx.globalAlpha = 0.28;
                ctx.fillStyle = palette.accentWarm;
                ctx.beginPath();
                ctx.arc(centerX, spineY, haloR, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.globalAlpha = Math.max(0.4, vis.opacity);
              ctx.fillStyle = vis.isActive ? palette.accentWarm : palette.accentPrimary;
              ctx.beginPath();
              ctx.arc(centerX, spineY, vis.isActive ? 10 : 7.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = palette.bgStart;
              ctx.lineWidth = 2;
              ctx.stroke();

              ctx.globalAlpha = Math.max(0.25, vis.opacity);
              ctx.strokeStyle = vis.isActive ? palette.accentWarm : palette.border;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(centerX, spineY + 10);
              ctx.lineTo(centerX, pos.y + vis.slideY);
              ctx.stroke();

              if (pos.item.badge) {
                ctx.globalAlpha = Math.max(0.35, vis.opacity);
                ctx.font = `700 ${THEME.labelFontSize}px ${THEME.fontFamily}`;
                ctx.fillStyle = vis.isActive ? palette.accentWarm : palette.accentPrimary;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillText(pos.item.badge, centerX, spineY - 38, pos.width);
              }
              ctx.restore();

              drawCardFast(ctx, scene.scene_id, pos, idx, vis, palette.accentWarm, timeMs, palette, scene.template, true);
            });
          }
        }

        // 5. Caption bar when live preview captions are enabled
        if (showCaptions) {
          const caption = activeCueText(timeMs, cues);
          if (caption) {
            const capY = height - THEME.captionZoneHeight + 8;
            ctx.save();
            roundedRectPath(ctx, THEME.safeMargin, capY, width - THEME.safeMargin * 2, 62, 10);
            ctx.fillStyle = palette.captionBg;
            ctx.fill();
            ctx.strokeStyle = palette.borderActive;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.font = `18px ${THEME.fontFamily}`;
            ctx.fillStyle = "#f8fafc";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(caption, width / 2, capY + 32, width - THEME.safeMargin * 2 - 32);
            ctx.restore();
          }
        }
      });

  layer.draw();
}
