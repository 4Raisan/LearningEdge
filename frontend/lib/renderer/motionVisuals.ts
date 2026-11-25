import Konva from "konva";
import { THEME } from "./theme";
import type { SceneVisual, SentenceCue, VisualStageBox } from "./types";
import {
  clamp01,
  drawBarChart,
  drawCallout,
  drawChipLabel,
  drawCountUp,
  drawDonutGauge,
  drawFlowPath,
  drawGlowNode,
  drawGlowRing,
  drawHighlightBox,
  drawKineticMaskText,
  drawLogoReveal,
  drawPolylinePath,
  drawStickFigure,
  drawVectorIcon,
  drawWipeText,
  easeOutBack,
  easeOutCubic,
  resolveIconName,
  roundedRectPath,
  samplePolylinePoint,
  seg,
  type MotionPalette,
  type Point2D,
} from "./visualKit";

const svgImageCache = new Map<string, { img: HTMLImageElement; width: number; height: number }>();

/**
 * Strips potentially unsafe script/event/external-resource constructs from LLM-authored SVGs
 * and guarantees valid XML namespace and viewBox attributes for headless rasterization.
 */
export function sanitizeSvgMarkup(rawSvg: string): string | null {
  const trimmed = rawSvg.trim();
  const svgStart = trimmed.indexOf("<svg");
  const svgEnd = trimmed.lastIndexOf("</svg>");
  if (svgStart < 0 || svgEnd <= svgStart) return null;

  let cleaned = trimmed.slice(svgStart, svgEnd + 6);
  cleaned = cleaned
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:xlink:)?href\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, "")
    .replace(/(?:xlink:)?href\s*=\s*("https?:[^"]*"|'https?:[^']*')/gi, "");

  if (!/xmlns\s*=/i.test(cleaned)) {
    cleaned = cleaned.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/viewBox\s*=/i.test(cleaned)) {
    cleaned = cleaned.replace("<svg", '<svg viewBox="0 0 400 280"');
  }
  if (!/\bwidth\s*=/i.test(cleaned)) {
    cleaned = cleaned.replace("<svg", '<svg width="400"');
  }
  if (!/\bheight\s*=/i.test(cleaned)) {
    cleaned = cleaned.replace("<svg", '<svg height="280"');
  }
  return cleaned;
}

function loadCachedSvgImage(
  rawSvg: string,
): { img: HTMLImageElement; width: number; height: number } | null {
  const sanitized = sanitizeSvgMarkup(rawSvg);
  if (!sanitized) return null;

  const hit = svgImageCache.get(sanitized);
  if (hit) return hit;

  try {
    const img = Konva.Util.createImageElement();
    if (typeof document === "undefined" && typeof Buffer !== "undefined") {
      (img as unknown as { src: Buffer }).src = Buffer.from(sanitized, "utf8");
    } else {
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitized)}`;
    }
    const w = Number(img.width) || 400;
    const h = Number(img.height) || 280;
    if (w > 0 && h > 0) {
      if (svgImageCache.size > 64) svgImageCache.clear();
      const entry = { img, width: w, height: h };
      svgImageCache.set(sanitized, entry);
      return entry;
    }
  } catch {
    return null;
  }
  return null;
}

function isCueActive(
  cueIndex: number | null | undefined,
  timeMs: number,
  cues: SentenceCue[],
): { revealed: boolean; active: boolean; progress: number } {
  if (cues.length === 0 || cueIndex === null || cueIndex === undefined) {
    return { revealed: true, active: false, progress: 1 };
  }
  const idx = Math.max(0, Math.min(cues.length - 1, cueIndex));
  const cue = cues[idx];
  if (timeMs < cue.start_ms) {
    return { revealed: false, active: false, progress: 0 };
  }
  const p = easeOutCubic((timeMs - cue.start_ms) / 360);
  return {
    revealed: true,
    active: timeMs >= cue.start_ms && timeMs <= cue.end_ms,
    progress: p,
  };
}

function drawStageFrame(
  ctx: CanvasRenderingContext2D,
  box: VisualStageBox,
  palette: MotionPalette,
  introP: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.9 * introP;
  roundedRectPath(ctx, box.x, box.y, box.width, box.height, 16);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Subtle corner accent ticks
  const arm = 16;
  ctx.strokeStyle = palette.accentPrimary;
  ctx.globalAlpha = 0.55 * introP;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(box.x + 12, box.y + arm + 12);
  ctx.lineTo(box.x + 12, box.y + 12);
  ctx.lineTo(box.x + arm + 12, box.y + 12);

  ctx.moveTo(box.x + box.width - arm - 12, box.y + box.height - 12);
  ctx.lineTo(box.x + box.width - 12, box.y + box.height - 12);
  ctx.lineTo(box.x + box.width - 12, box.y + box.height - arm - 12);
  ctx.stroke();
  ctx.restore();
}

function renderKineticTitle(
  ctx: CanvasRenderingContext2D,
  visual: Extract<SceneVisual, { kind: "kinetic_title" }>,
  box: VisualStageBox,
  timeSec: number,
  palette: MotionPalette,
): void {
  const cx = box.x + box.width / 2;
  const chips = (visual.chips ?? []).slice(0, 4);
  const compact = box.height < 400;
  const cy = box.y + box.height * (compact ? 0.25 : 0.31);
  const iconName = resolveIconName(visual.icon, visual.headline, 0);
  const ringR = Math.min(compact ? 36 : 44, Math.min(box.width, box.height) * 0.125);

  drawLogoReveal(ctx, cx, cy, ringR, palette.accentPrimary, palette.accentWarm, timeSec, 0.08, iconName);

  // Orbiting subtle nodes
  const orbitP = easeOutCubic(seg(timeSec, 0.4, 1.1));
  if (orbitP > 0.02) {
    const orbitColors = [palette.accentPrimary, palette.accentSecondary, palette.accentWarm];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3 + timeSec * 0.25;
      const rr = ringR * 1.5;
      drawGlowNode(
        ctx,
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr,
        3.2,
        orbitColors[i % orbitColors.length],
        orbitP * 0.85,
      );
    }
  }

  let textY = cy + ringR * 1.45 + (compact ? 10 : 14);
  if (visual.eyebrow) {
    const ep = easeOutCubic(seg(timeSec, 0.2, 0.6));
    drawWipeText(
      ctx,
      visual.eyebrow.toUpperCase(),
      cx,
      textY,
      `700 14px ${THEME.fontFamily}`,
      palette.accentWarm,
      ep,
      "center",
    );
    textY += compact ? 20 : 24;
  }

  const headlineSize = Math.min(compact ? 30 : 34, Math.max(22, Math.floor(box.width / 18)));
  drawKineticMaskText(
    ctx,
    visual.headline,
    cx,
    textY,
    `800 ${headlineSize}px ${THEME.fontFamily}`,
    palette.textPrimary,
    timeSec,
    { start: 0.3, stagger: 0.06, dur: 0.45, align: "center" },
  );
  textY += headlineSize + (compact ? 10 : 14);

  if (visual.accent_word) {
    const ap = easeOutBack(seg(timeSec, 0.7, 1.15));
    drawChipLabel(
      ctx,
      visual.accent_word,
      cx,
      textY + 14,
      palette.accentPrimary,
      palette.surfaceActive,
      clamp01(ap),
      15,
      THEME.fontFamily,
    );
    textY += compact ? 38 : 44;
  }

  if (chips.length > 0 && textY + 18 < box.y + box.height - 8) {
    const totalGap = 10 * (chips.length - 1);
    const chipMaxW = Math.min(165, (box.width - 48 - totalGap) / chips.length);
    const startX = cx - ((chipMaxW + 10) * chips.length - 10) / 2 + chipMaxW / 2;
    chips.forEach((chip, i) => {
      const cp = easeOutCubic(seg(timeSec, 0.75 + i * 0.1, 1.15 + i * 0.1));
      drawChipLabel(
        ctx,
        chip,
        startX + i * (chipMaxW + 10),
        textY + 13,
        i % 2 === 0 ? palette.accentSecondary : palette.accentWarm,
        palette.surfaceActive,
        cp,
        14,
        THEME.fontFamily,
      );
    });
  }
}

export interface DiagramNodeBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  col: number;
}

export interface RoutedDiagramEdge {
  points: Point2D[];
  labelPos: Point2D;
}

/**
 * Computes clean orthogonal edge paths and unobstructed label anchors across
 * 1D rows, 2x2 grids, and 2x3 diagram layouts so diagonal lines never cut through nodes.
 */
export function routeDiagramEdge(
  from: DiagramNodeBox,
  to: DiagramNodeBox,
  allNodes: DiagramNodeBox[],
  box: VisualStageBox,
  edgeIndex = 0
): RoutedDiagramEdge {
  const rowDiff = Math.abs(to.row - from.row);
  const colDiff = Math.abs(to.col - from.col);

  // 1. Same row, adjacent columns -> direct horizontal segment
  if (from.row === to.row && colDiff === 1) {
    const dir = Math.sign(to.x - from.x) || 1;
    const x1 = from.x + dir * (from.w / 2 + 4);
    const x2 = to.x - dir * (to.w / 2 + 4);
    return {
      points: [
        [x1, from.y],
        [x2, to.y],
      ],
      labelPos: [(x1 + x2) / 2, from.y - 20],
    };
  }

  // 2. Same column, adjacent rows -> direct vertical segment
  if (from.col === to.col && rowDiff === 1) {
    const dir = Math.sign(to.y - from.y) || 1;
    const y1 = from.y + dir * (from.h / 2 + 4);
    const y2 = to.y - dir * (to.h / 2 + 4);
    return {
      points: [
        [from.x, y1],
        [to.x, y2],
      ],
      labelPos: [from.x + 14, (y1 + y2) / 2],
    };
  }

  // 3. Cross-row and cross-column (e.g. 2x2 diagonal n1 -> n2 or n0 -> n3) -> orthogonal Z-bend
  if (from.row !== to.row && from.col !== to.col) {
    const minRow = Math.min(from.row, to.row);
    const maxRow = Math.max(from.row, to.row);
    const minRowNodes = allNodes.filter((n) => n.row === minRow);
    const maxRowNodes = allNodes.filter((n) => n.row === maxRow);
    const minRowBottom = minRowNodes.length
      ? Math.max(...minRowNodes.map((n) => n.y + n.h / 2))
      : from.y + from.h / 2;
    const maxRowTop = maxRowNodes.length
      ? Math.min(...maxRowNodes.map((n) => n.y - n.h / 2))
      : to.y - to.h / 2;

    const gap = maxRowTop - minRowBottom;
    let midY = (minRowBottom + maxRowTop) / 2;
    if (gap >= 24) {
      const stagger = ((edgeIndex % 3) - 1) * 5;
      midY = Math.max(minRowBottom + 8, Math.min(maxRowTop - 8, midY + stagger));
    }

    const dirY = Math.sign(to.y - from.y) || 1;
    const fromExitY = from.y + dirY * (from.h / 2 + 4);
    const toEntryY = to.y - dirY * (to.h / 2 + 4);
    return {
      points: [
        [from.x, fromExitY],
        [from.x, midY],
        [to.x, midY],
        [to.x, toEntryY],
      ],
      labelPos: [(from.x + to.x) / 2, midY - 12],
    };
  }

  // 4. Same row, non-adjacent (skips intermediate node) -> orthogonal U-route above or below row
  if (from.row === to.row && colDiff > 1) {
    const rowNodes = allNodes.filter((n) => n.row === from.row);
    const rowTop = rowNodes.length ? Math.min(...rowNodes.map((n) => n.y - n.h / 2)) : from.y - from.h / 2;
    const rowBottom = rowNodes.length ? Math.max(...rowNodes.map((n) => n.y + n.h / 2)) : from.y + from.h / 2;
    const useTop = from.row === 0;
    const laneY = useTop
      ? Math.max(box.y + 10, rowTop - 20)
      : Math.min(box.y + box.height - 10, rowBottom + 20);
    const dirY = useTop ? -1 : 1;
    const exitY = from.y + dirY * (from.h / 2 + 4);
    const entryY = to.y + dirY * (to.h / 2 + 4);
    return {
      points: [
        [from.x, exitY],
        [from.x, laneY],
        [to.x, laneY],
        [to.x, entryY],
      ],
      labelPos: [(from.x + to.x) / 2, useTop ? laneY - 12 : laneY + 14],
    };
  }

  // 5. Fallback (same column, non-adjacent rows) -> orthogonal C-route via side gutter
  const dirX = from.col === 0 ? -1 : 1;
  const sideEdge =
    dirX < 0
      ? Math.max(box.x + 10, from.x - from.w / 2 - 22)
      : Math.min(box.x + box.width - 10, from.x + from.w / 2 + 22);
  const exitX = from.x + dirX * (from.w / 2 + 4);
  const entryX = to.x + dirX * (to.w / 2 + 4);
  return {
    points: [
      [exitX, from.y],
      [sideEdge, from.y],
      [sideEdge, to.y],
      [entryX, to.y],
    ],
    labelPos: [sideEdge, (from.y + to.y) / 2],
  };
}

function renderDiagram(
  ctx: CanvasRenderingContext2D,
  visual: Extract<SceneVisual, { kind: "diagram" }>,
  box: VisualStageBox,
  timeMs: number,
  timeSec: number,
  cues: SentenceCue[],
  palette: MotionPalette,
): void {
  const nodes = (visual.nodes ?? []).slice(0, 6);
  if (nodes.length === 0) return;

  const cols = nodes.length <= 3 ? nodes.length : Math.ceil(nodes.length / 2);
  const rows = Math.ceil(nodes.length / cols);
  const padX = 24;
  const padY = 28;
  const usableW = Math.max(180, box.width - padX * 2);
  const usableH = Math.max(140, box.height - padY * 2 - (visual.callout ? 40 : 0));
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const edges = visual.edges ?? [];
  const hasEdgeLabels = edges.some((e) => Boolean(e.label?.trim()));
  const widthRatio = cols >= 3 ? (hasEdgeLabels ? 0.62 : 0.7) : 0.72;
  const nodeW = Math.min(176, cellW * widthRatio);
  const nodeH = Math.min(112, cellH * 0.72);

  const posById = new Map<string, DiagramNodeBox>();
  const allNodeBoxes: DiagramNodeBox[] = [];
  nodes.forEach((n, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const cx = box.x + padX + cellW * (c + 0.5);
    const cy = box.y + padY + cellH * (r + 0.5);
    const nodeBox: DiagramNodeBox = { id: n.id, x: cx, y: cy, w: nodeW, h: nodeH, row: r, col: c };
    posById.set(n.id, nodeBox);
    allNodeBoxes.push(nodeBox);
  });

  // Draw edge lines and traveling packets first so nodes layer cleanly above endpoints
  const pendingEdgeLabels: Array<{ label: string; x: number; y: number; color: string; alpha: number }> = [];
  edges.forEach((edge, idx) => {
    const from = posById.get(edge.from);
    const to = posById.get(edge.to);
    if (!from || !to) return;

    const routed = routeDiagramEdge(from, to, allNodeBoxes, box, idx);
    const pts = routed.points;
    const cueState = isCueActive(edge.cue_index, timeMs, cues);
    const rev = edge.cue_index != null ? cueState.progress : easeOutCubic(seg(timeSec, 0.2 + idx * 0.12, 0.65 + idx * 0.12));
    const edgeColor = cueState.active ? palette.accentWarm : palette.accentPrimary;

    drawPolylinePath(ctx, pts, rev, edgeColor, 0.78, 2.4, {
      arrow: true,
      dash: edge.dashed ? [6, 6] : undefined,
    });

    if (rev >= 0.9 && (edge.packet ?? true)) {
      drawFlowPath(ctx, pts, timeSec + idx * 0.2, edgeColor, 0.45, 2.2);
      const travel = (timeSec * 0.65 + idx * 0.31) % 1;
      const [px, py] = samplePolylinePoint(pts, travel);
      drawGlowNode(ctx, px, py, 3.8, palette.accentWarm, 0.95);
    }

    if (edge.label && rev > 0.45) {
      pendingEdgeLabels.push({
        label: edge.label,
        x: routed.labelPos[0],
        y: routed.labelPos[1],
        color: edgeColor,
        alpha: rev * 0.95,
      });
    }
  });

  // Draw nodes
  const accents = [palette.accentPrimary, palette.accentSecondary, palette.accentWarm];
  nodes.forEach((n, idx) => {
    const geom = posById.get(n.id)!;
    const cueState = isCueActive(n.cue_index, timeMs, cues);
    const rev = n.cue_index != null ? Math.max(0.28, cueState.progress) : easeOutCubic(seg(timeSec, 0.15 + idx * 0.12, 0.6 + idx * 0.12));
    const col = n.accent || accents[idx % accents.length];

    const rx = geom.x - geom.w / 2;
    const ry = geom.y - geom.h / 2;

    ctx.save();
    ctx.globalAlpha = cueState.revealed ? Math.max(0.32, rev) : 0.25;
    roundedRectPath(ctx, rx, ry, geom.w, geom.h, 12);
    ctx.fillStyle = cueState.active ? palette.surfaceActive : palette.bgStart;
    ctx.fill();
    ctx.strokeStyle = cueState.active ? palette.accentWarm : col;
    ctx.lineWidth = cueState.active ? 2.4 : 1.5;
    ctx.stroke();

    const iconName = resolveIconName(n.icon, `${n.label} ${n.sublabel ?? ""}`, idx);
    drawVectorIcon(ctx, iconName, geom.x, ry + 26, 26, col, rev);

    ctx.font = `700 17px ${THEME.fontFamily}`;
    ctx.fillStyle = palette.textPrimary;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(n.label, geom.x, ry + 48, geom.w - 16);

    if (n.sublabel) {
      ctx.font = `500 14px ${THEME.fontFamily}`;
      ctx.fillStyle = palette.textMuted;
      ctx.fillText(n.sublabel, geom.x, ry + 72, geom.w - 16);
    }
    ctx.restore();

    if (cueState.active) {
      drawHighlightBox(ctx, rx - 3, ry - 3, geom.w + 6, geom.h + 6, palette.accentWarm, cueState.progress, 0.85, 14);
    }
  });

  // Draw edge labels after nodes so chips remain crisp and never clipped behind boxes
  for (const lbl of pendingEdgeLabels) {
    drawChipLabel(ctx, lbl.label, lbl.x, lbl.y, lbl.color, palette.bgStart, lbl.alpha, 12, THEME.fontFamily);
  }

  if (visual.callout) {
    const cp = easeOutCubic(seg(timeSec, 0.9, 1.45));
    drawChipLabel(
      ctx,
      visual.callout,
      box.x + box.width / 2,
      box.y + box.height - 24,
      palette.accentWarm,
      palette.surfaceActive,
      cp,
      14,
      THEME.fontFamily,
    );
  }
}

function renderChart(
  ctx: CanvasRenderingContext2D,
  visual: Extract<SceneVisual, { kind: "chart" }>,
  box: VisualStageBox,
  timeSec: number,
  palette: MotionPalette,
): void {
  const titleY = box.y + 22;
  if (visual.title) {
    drawWipeText(
      ctx,
      visual.title,
      box.x + box.width / 2,
      titleY,
      `700 20px ${THEME.fontFamily}`,
      palette.textPrimary,
      seg(timeSec, 0.05, 0.42),
      "center",
    );
  }

  const bars = visual.bars ?? [];
  const chartType = (visual.chart_type || "").toLowerCase();
  const contentTop = visual.title ? box.y + 58 : box.y + 28;
  const contentH = Math.max(120, box.height - (visual.title ? 82 : 52));

  if ((chartType === "bar" || bars.length > 0) && bars.length > 0) {
    drawBarChart(
      ctx,
      bars,
      {
        x: box.x + 12,
        y: contentTop,
        width: box.width - 24,
        height: contentH - (visual.callout ? 32 : 0),
      },
      timeSec,
      0.25,
      palette,
      THEME.fontFamily,
    );
  } else if (chartType === "donut" || (visual.percent !== null && visual.percent !== undefined)) {
    const pct = Math.max(0, Math.min(100, visual.percent ?? 75));
    const cx = box.x + box.width / 2;
    const cy = contentTop + contentH * 0.44;
    const r = Math.min(82, Math.min(box.width, contentH) * 0.28);
    const p = seg(timeSec, 0.2, 1.35);

    drawDonutGauge(ctx, cx, cy, r, pct / 100, p, palette.accentPrimary, palette.border, 14);
    drawCountUp(ctx, pct, cx, cy, `800 34px ${THEME.fontFamily}`, palette.textPrimary, p, {
      suffix: "%",
    });

    if (visual.metric_label) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(seg(timeSec, 0.5, 1.0));
      ctx.font = `600 18px ${THEME.fontFamily}`;
      ctx.fillStyle = palette.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(visual.metric_label, cx, cy + r + 24, box.width - 40);
      ctx.restore();
    }
  } else {
    const cx = box.x + box.width / 2;
    const cy = contentTop + contentH * 0.42;
    const r = Math.min(78, Math.min(box.width, contentH) * 0.26);
    const p = seg(timeSec, 0.2, 1.2);
    const pulse = 1 + 0.03 * Math.sin(timeSec * 2.5);
    drawGlowRing(ctx, cx, cy, r * pulse, palette.accentPrimary, 0.75, 2.5);
    drawGlowRing(ctx, cx, cy, r * 1.24, palette.accentSecondary, 0.35, 1.5);

    const val = visual.metric_value ?? 100;
    drawCountUp(ctx, val, cx, cy, `800 36px ${THEME.fontFamily}`, palette.accentWarm, p, {
      prefix: visual.metric_prefix ?? "",
      suffix: visual.metric_suffix ?? "",
    });
    if (visual.metric_label) {
      ctx.save();
      ctx.globalAlpha = easeOutCubic(seg(timeSec, 0.45, 0.95));
      ctx.font = `600 18px ${THEME.fontFamily}`;
      ctx.fillStyle = palette.textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(visual.metric_label, cx, cy + r + 26, box.width - 40);
      ctx.restore();
    }
  }

  if (visual.callout) {
    drawChipLabel(
      ctx,
      visual.callout,
      box.x + box.width / 2,
      box.y + box.height - 22,
      palette.accentWarm,
      palette.surfaceActive,
      easeOutCubic(seg(timeSec, 0.9, 1.4)),
      14,
      THEME.fontFamily,
    );
  }
}

function renderMetaphor(
  ctx: CanvasRenderingContext2D,
  visual: Extract<SceneVisual, { kind: "metaphor" }>,
  box: VisualStageBox,
  timeSec: number,
  palette: MotionPalette,
): void {
  const cy = box.y + box.height * 0.46;
  const hasFigure = Boolean(visual.character_pose);
  const leftX = box.x + box.width * (hasFigure ? 0.28 : 0.24);
  const rightX = box.x + box.width * (hasFigure ? 0.77 : 0.76);
  const r = Math.min(46, Math.min(box.width, box.height) * 0.13);

  const lp = easeOutBack(seg(timeSec, 0.05, 0.45));
  const rp = easeOutBack(seg(timeSec, 0.18, 0.58));
  const linkP = easeOutCubic(seg(timeSec, 0.14, 0.56));

  // Connecting bridge & traveling packet
  const bridge: Point2D[] = [[leftX + r + 14, cy], [rightX - r - 14, cy]];
  drawPolylinePath(ctx, bridge, linkP, palette.accentSecondary, 0.75, 2.6, { arrow: true });
  if (linkP > 0.85) {
    drawFlowPath(ctx, bridge, timeSec, palette.accentPrimary, 0.5, 2.2);
    const [px, py] = samplePolylinePoint(bridge, (timeSec * 0.7) % 1);
    drawGlowNode(ctx, px, py, 4.2, palette.accentWarm, 0.95);
  }
  if (visual.connector_label && linkP > 0.4) {
    drawChipLabel(
      ctx,
      visual.connector_label,
      (leftX + rightX) / 2,
      cy - 28,
      palette.accentWarm,
      palette.bgStart,
      linkP,
      14,
      THEME.fontFamily,
    );
  }

  // Left medallion
  const leftIcon = resolveIconName(visual.left_icon, visual.left_label, 0);
  drawGlowRing(ctx, leftX, cy, r, palette.accentPrimary, clamp01(lp), 2.5);
  drawVectorIcon(ctx, leftIcon, leftX, cy, r * 0.98, palette.accentPrimary, clamp01(lp));
  ctx.save();
  ctx.globalAlpha = clamp01(lp);
  ctx.font = `700 18px ${THEME.fontFamily}`;
  ctx.fillStyle = palette.textPrimary;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(visual.left_label, leftX, cy + r + 16, box.width * 0.4);
  ctx.restore();

  // Optional stick figure guide cleanly left of the medallion ring
  if (visual.character_pose) {
    const pose = (["idle", "walk", "point", "cheer", "sad"].includes(visual.character_pose)
      ? visual.character_pose
      : "point") as "idle" | "walk" | "point" | "cheer" | "sad";
    drawStickFigure(
      ctx,
      Math.max(box.x + 28, leftX - r - 38),
      cy + r + 6,
      Math.min(68, box.height * 0.21),
      palette.accentWarm,
      pose,
      timeSec,
      clamp01(lp) * 0.92,
    );
  }

  // Right medallion
  const rightIcon = resolveIconName(visual.right_icon, visual.right_label, 1);
  drawGlowRing(ctx, rightX, cy, r, palette.accentSecondary, clamp01(rp), 2.5);
  drawVectorIcon(ctx, rightIcon, rightX, cy, r * 0.98, palette.accentSecondary, clamp01(rp));
  ctx.save();
  ctx.globalAlpha = clamp01(rp);
  ctx.font = `700 18px ${THEME.fontFamily}`;
  ctx.fillStyle = palette.textPrimary;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(visual.right_label, rightX, cy + r + 16, box.width * 0.42);
  ctx.restore();

  if (visual.caption) {
    drawChipLabel(
      ctx,
      visual.caption,
      box.x + box.width / 2,
      box.y + box.height - 24,
      palette.accentWarm,
      palette.surfaceActive,
      easeOutCubic(seg(timeSec, 0.5, 1.0)),
      14,
      THEME.fontFamily,
    );
  }
}

function renderSvgSketch(
  ctx: CanvasRenderingContext2D,
  visual: Extract<SceneVisual, { kind: "svg_sketch" }>,
  box: VisualStageBox,
  timeSec: number,
  palette: MotionPalette,
): void {
  const loaded = loadCachedSvgImage(visual.svg);
  const pad = 24;
  const maxW = Math.max(120, box.width - pad * 2);
  const maxH = Math.max(120, box.height - pad * 2 - (visual.caption ? 34 : 0));
  const reveal = easeOutCubic(seg(timeSec, 0.05, 0.55));

  if (loaded) {
    const scale = Math.min(maxW / loaded.width, maxH / loaded.height);
    const drawW = loaded.width * scale;
    const drawH = loaded.height * scale;
    const breathe = 1 + 0.012 * Math.sin(timeSec * 1.7);
    const cx = box.x + box.width / 2;
    const cy = box.y + pad + maxH / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(breathe, breathe);
    ctx.globalAlpha = reveal;
    ctx.beginPath();
    ctx.rect(-drawW / 2, -drawH / 2, drawW * reveal, drawH);
    ctx.clip();
    ctx.drawImage(loaded.img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  } else {
    // Graceful geometric fallback if SVG markup fails validation
    drawLogoReveal(
      ctx,
      box.x + box.width / 2,
      box.y + box.height * 0.46,
      54,
      palette.accentPrimary,
      palette.accentWarm,
      timeSec,
      0.1,
      "sparkles",
    );
  }

  if (visual.caption) {
    drawChipLabel(
      ctx,
      visual.caption,
      box.x + box.width / 2,
      box.y + box.height - 24,
      palette.accentPrimary,
      palette.surfaceActive,
      easeOutCubic(seg(timeSec, 0.55, 1.05)),
      15,
      THEME.fontFamily,
    );
  }
}

/**
 * Renders the scene's hero or split visual stage (kinetic typography, animated diagram,
 * chart, visual metaphor, or custom sanitized SVG sketch) inside `box`.
 */
export function renderSceneVisual(
  ctx: CanvasRenderingContext2D,
  visual: SceneVisual,
  box: VisualStageBox,
  timeMs: number,
  cues: SentenceCue[],
  palette: MotionPalette,
  _sceneDurationMs: number,
): void {
  const timeSec = timeMs / 1000;
  const introP = easeOutCubic(seg(timeSec, 0, 0.45));
  drawStageFrame(ctx, box, palette, introP);

  switch (visual.kind) {
    case "kinetic_title":
      renderKineticTitle(ctx, visual, box, timeSec, palette);
      break;
    case "diagram":
      renderDiagram(ctx, visual, box, timeMs, timeSec, cues, palette);
      break;
    case "chart":
      renderChart(ctx, visual, box, timeSec, palette);
      break;
    case "metaphor":
      renderMetaphor(ctx, visual, box, timeSec, palette);
      break;
    case "svg_sketch":
      renderSvgSketch(ctx, visual, box, timeSec, palette);
      break;
  }
}
