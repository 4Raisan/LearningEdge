import Konva from "konva";
import { THEME } from "./theme";
import type {
  BoundingBox,
  ComputedSceneLayout,
  LayoutMetrics,
  PositionedItem,
  SceneItem,
  SceneSpec,
} from "./types";

export interface TextMeasureContext {
  font: string;
  measureText(text: string): { width: number };
}

let cachedMeasureCtx: TextMeasureContext | null = null;

function getMeasureContext(custom?: TextMeasureContext): TextMeasureContext {
  if (custom) return custom;
  if (cachedMeasureCtx) return cachedMeasureCtx;
  try {
    const canvas = Konva.Util.createCanvasElement();
    const ctx = canvas.getContext("2d");
    if (ctx) {
      cachedMeasureCtx = ctx as unknown as TextMeasureContext;
      return cachedMeasureCtx;
    }
  } catch {
    // Fallback if canvas backend has not been attached yet
  }
  return {
    font: "",
    measureText(text: string) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
      const px = m ? Number(m[1]) : 18;
      return { width: text.length * px * 0.56 };
    },
  };
}

export function measureTextWidth(
  text: string,
  fontSize: number,
  fontWeight: "normal" | "bold" | "600" | "700" = "normal",
  ctx?: TextMeasureContext
): number {
  const mctx = getMeasureContext(ctx);
  mctx.font = `${fontWeight} ${fontSize}px ${THEME.fontFamily}`;
  return mctx.measureText(text).width;
}

/**
 * Wraps prose and long unbroken technical identifiers cleanly inside `maxWidth`.
 */
export function wrapTextLines(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: "normal" | "bold" | "600" | "700" = "normal",
  ctx?: TextMeasureContext
): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  const safeWidth = Math.max(40, maxWidth);
  const words = cleaned.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  const pushWrappedToken = (token: string) => {
    let chunk = "";
    for (const ch of token) {
      const candidate = chunk + ch;
      if (chunk && measureTextWidth(candidate, fontSize, fontWeight, ctx) > safeWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) {
      current = chunk;
    }
  };

  for (const word of words) {
    if (!current) {
      if (measureTextWidth(word, fontSize, fontWeight, ctx) <= safeWidth) {
        current = word;
      } else {
        pushWrappedToken(word);
      }
      continue;
    }

    const candidate = `${current} ${word}`;
    if (measureTextWidth(candidate, fontSize, fontWeight, ctx) <= safeWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = "";
      if (measureTextWidth(word, fontSize, fontWeight, ctx) <= safeWidth) {
        current = word;
      } else {
        pushWrappedToken(word);
      }
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

function lineHeight(fontSize: number): number {
  return Math.ceil(fontSize * 1.32);
}

function effectiveBadgeText(item: SceneItem): string {
  const parts = [item.stat?.trim(), item.badge?.trim()].filter(Boolean) as string[];
  return parts.join(" · ");
}

function resolveVisualMode(
  scene: SceneSpec
): "cards" | "split" | "hero" {
  if (!scene.visual || scene.visual_layout === "cards") {
    return "cards";
  }
  if (scene.visual_layout === "hero") {
    return "hero";
  }
  if (scene.visual.kind === "kinetic_title" && scene.items.length <= 2) {
    return "hero";
  }
  return "split";
}

function measureConceptCard(
  item: SceneItem,
  cardWidth: number,
  ctx?: TextMeasureContext
): {
  height: number;
  badgeLines: string[];
  labelLines: string[];
  detailLines: string[];
} {
  const padX = 22;
  const padY = 16;
  const badgeFontSize = THEME.badgeFontSize;
  const labelFontSize = THEME.labelFontSize;
  const detailFontSize = THEME.detailFontSize;

  const badgeText = effectiveBadgeText(item);
  const badgeReserve = badgeText
    ? Math.min(220, Math.ceil(measureTextWidth(badgeText, badgeFontSize, "700", ctx)) + 30)
    : 0;
  const labelWidth = Math.max(
    180,
    cardWidth - padX * 2 - (badgeReserve > 0 ? badgeReserve + 14 : 0) - 44
  );
  const detailWidth = cardWidth - padX * 2;

  const badgeLines = badgeText ? [badgeText] : [];
  const labelLines = wrapTextLines(item.label, labelWidth, labelFontSize, "700", ctx);
  const detailLines = wrapTextLines(item.detail, detailWidth, detailFontSize, "normal", ctx);

  const labelH = Math.max(1, labelLines.length) * lineHeight(labelFontSize);
  const detailH = detailLines.length * lineHeight(detailFontSize);
  const height = padY * 2 + labelH + (detailH > 0 ? 8 + detailH : 0);

  return { height, badgeLines, labelLines, detailLines };
}

function measureCompactPointCard(
  item: SceneItem,
  cardWidth: number,
  ctx?: TextMeasureContext
): {
  height: number;
  badgeLines: string[];
  labelLines: string[];
  detailLines: string[];
  badgeFontSize: number;
  labelFontSize: number;
  detailFontSize: number;
} {
  const padX = 18;
  const padY = 13;
  const badgeFontSize = THEME.badgeFontSize;
  const labelFontSize = 20;
  const detailFontSize = THEME.detailFontSize;

  const badgeText = effectiveBadgeText(item);
  const badgeLines = badgeText
    ? wrapTextLines(badgeText, Math.max(96, cardWidth - padX * 2 - 46), badgeFontSize, "700", ctx)
    : [];
  const labelWidth = Math.max(140, cardWidth - padX * 2 - 44);
  const detailWidth = Math.max(140, cardWidth - padX * 2);

  const labelLines = wrapTextLines(item.label, labelWidth, labelFontSize, "700", ctx);
  const detailLines = wrapTextLines(item.detail, detailWidth, detailFontSize, "normal", ctx);

  const badgeH = badgeLines.length > 0 ? badgeLines.length * lineHeight(badgeFontSize) + 8 : 0;
  const labelH = Math.max(1, labelLines.length) * lineHeight(labelFontSize);
  const detailH = detailLines.length * lineHeight(detailFontSize);
  const height = padY * 2 + badgeH + labelH + (detailH > 0 ? 6 + detailH : 0);

  return {
    height,
    badgeLines,
    labelLines,
    detailLines,
    badgeFontSize,
    labelFontSize,
    detailFontSize,
  };
}

function measureColumnCard(
  item: SceneItem,
  cardWidth: number,
  badgeFontSize: number,
  labelFontSize: number,
  detailFontSize: number,
  ctx?: TextMeasureContext
): {
  height: number;
  badgeLines: string[];
  labelLines: string[];
  detailLines: string[];
} {
  const padX = 18;
  const padY = 16;
  const innerW = Math.max(120, cardWidth - padX * 2);

  const badgeText = effectiveBadgeText(item);
  const badgeLines = badgeText
    ? wrapTextLines(badgeText, Math.max(96, innerW - 56), badgeFontSize, "700", ctx)
    : [];
  const labelLines = wrapTextLines(item.label, innerW, labelFontSize, "700", ctx);
  const detailLines = wrapTextLines(item.detail, innerW, detailFontSize, "normal", ctx);

  const badgeH = badgeLines.length > 0 ? badgeLines.length * lineHeight(badgeFontSize) + 12 : 0;
  const labelH = Math.max(1, labelLines.length) * lineHeight(labelFontSize);
  const detailH = detailLines.length * lineHeight(detailFontSize);
  const height = padY * 2 + badgeH + labelH + (detailH > 0 ? 10 + detailH : 0);

  return { height, badgeLines, labelLines, detailLines };
}

function computeHeader(
  scene: SceneSpec,
  width: number,
  ctx?: TextMeasureContext
): {
  titleLines: string[];
  subtitleLines: string[];
  headerBottom: number;
  metaText: string;
} {
  const innerW = width - THEME.safeMargin * 2;
  const partSuffix =
    scene.part_total > 1 ? ` (Part ${scene.part_index}/${scene.part_total})` : "";
  const fullTitle = `${scene.title}${partSuffix}`;
  const titleLines = wrapTextLines(fullTitle, innerW - 220, THEME.titleFontSize, "700", ctx);
  const subtitleLines = scene.subtitle
    ? wrapTextLines(scene.subtitle, innerW, THEME.subtitleFontSize, "normal", ctx)
    : [];

  const titleH = Math.max(1, titleLines.length) * lineHeight(THEME.titleFontSize);
  const subH = subtitleLines.length > 0 ? subtitleLines.length * lineHeight(THEME.subtitleFontSize) + 6 : 0;
  const metaText = [
    ...scene.note_point_ids,
    ...scene.source_refs.slice(0, 3),
  ].join(" · ");

  const headerBottom = 38 + titleH + subH + 14;
  return { titleLines, subtitleLines, headerBottom, metaText };
}

export function computeSceneLayout(
  scene: SceneSpec,
  width: number = THEME.width,
  height: number = THEME.height,
  ctx?: TextMeasureContext
): ComputedSceneLayout {
  const innerW = width - THEME.safeMargin * 2;
  const { titleLines, subtitleLines, headerBottom } = computeHeader(scene, width, ctx);
  const contentTop = headerBottom + 10;
  const contentBottom = height - THEME.captionZoneHeight - 12;

  const boundingBoxes: BoundingBox[] = [
    {
      id: "header",
      kind: "header",
      x: THEME.safeMargin,
      y: 34,
      width: innerW,
      height: headerBottom - 34,
      font_size: THEME.subtitleFontSize,
    },
  ];

  const fontSizes: number[] = [THEME.titleFontSize, THEME.subtitleFontSize, THEME.footerFontSize];
  const positionedItems: PositionedItem[] = [];
  const effectiveLayout = resolveVisualMode(scene);
  let visualBox: ComputedSceneLayout["visualBox"] = null;

  if (effectiveLayout !== "cards") {
    const availableH = Math.max(220, contentBottom - contentTop);
    if (effectiveLayout === "hero") {
      const gapY = 14;
      const cols = innerW >= 820 && scene.items.length >= 2 ? 2 : 1;
      const colGap = 18;
      const itemW = Math.floor((innerW - colGap * (cols - 1)) / cols);
      const measured = scene.items.map((item) => measureCompactPointCard(item, itemW, ctx));
      const rowHeights: number[] = [];
      for (let i = 0; i < measured.length; i += cols) {
        rowHeights.push(Math.max(88, ...measured.slice(i, i + cols).map((m) => m.height)));
      }
      const totalItemsH =
        rowHeights.reduce((acc, h) => acc + h, 0) + Math.max(0, rowHeights.length - 1) * 12;
      const visualH = Math.max(200, availableH - (scene.items.length > 0 ? totalItemsH + gapY : 0));

      visualBox = {
        x: THEME.safeMargin,
        y: contentTop,
        width: innerW,
        height: visualH,
      };
      boundingBoxes.push({
        id: "visual-stage",
        kind: "visual",
        ...visualBox,
      });

      let curY = contentTop + visualH + gapY;
      for (let i = 0; i < scene.items.length; i += cols) {
        const rowItems = scene.items.slice(i, i + cols);
        const rowH = rowHeights[Math.floor(i / cols)];
        rowItems.forEach((item, c) => {
          const m = measured[i + c];
          const x = THEME.safeMargin + c * (itemW + colGap);
          positionedItems.push({
            item,
            x,
            y: curY,
            width: itemW,
            height: rowH,
            badgeLines: m.badgeLines,
            labelLines: m.labelLines,
            detailLines: m.detailLines,
            badgeFontSize: m.badgeFontSize,
            labelFontSize: m.labelFontSize,
            detailFontSize: m.detailFontSize,
          });
          boundingBoxes.push({
            id: item.id,
            kind: "card",
            x,
            y: curY,
            width: itemW,
            height: rowH,
            font_size: m.detailFontSize,
          });
          fontSizes.push(m.badgeFontSize, m.labelFontSize, m.detailFontSize);
        });
        curY += rowH + 12;
      }
    } else if (innerW >= 820) {
      // Split landscape: visual left (55%), concise key-point cards right (45%)
      const colGap = 24;
      const visualW = Math.floor((innerW - colGap) * 0.55);
      const itemsW = innerW - colGap - visualW;
      visualBox = {
        x: THEME.safeMargin,
        y: contentTop,
        width: visualW,
        height: availableH,
      };
      boundingBoxes.push({
        id: "visual-stage",
        kind: "visual",
        ...visualBox,
      });

      const itemsX = THEME.safeMargin + visualW + colGap;
      const itemGap = 12;
      const measuredRight = scene.items.map((item) => measureCompactPointCard(item, itemsW, ctx));
      const totalItemsH =
        measuredRight.reduce((acc, m) => acc + m.height, 0) +
        Math.max(0, measuredRight.length - 1) * itemGap;
      let curY = contentTop + Math.max(0, Math.floor((availableH - totalItemsH) / 2));
      scene.items.forEach((item, idx) => {
        const m = measuredRight[idx];
        positionedItems.push({
          item,
          x: itemsX,
          y: curY,
          width: itemsW,
          height: m.height,
          badgeLines: m.badgeLines,
          labelLines: m.labelLines,
          detailLines: m.detailLines,
          badgeFontSize: m.badgeFontSize,
          labelFontSize: m.labelFontSize,
          detailFontSize: m.detailFontSize,
        });
        boundingBoxes.push({
          id: item.id,
          kind: "card",
          x: itemsX,
          y: curY,
          width: itemsW,
          height: m.height,
          font_size: m.detailFontSize,
        });
        fontSizes.push(m.badgeFontSize, m.labelFontSize, m.detailFontSize);
        curY += m.height + itemGap;
      });
    } else {
      // Split portrait: visual top (~42%), key-point cards below
      const gapY = 16;
      const visualH = Math.floor(availableH * 0.42);
      visualBox = {
        x: THEME.safeMargin,
        y: contentTop,
        width: innerW,
        height: visualH,
      };
      boundingBoxes.push({
        id: "visual-stage",
        kind: "visual",
        ...visualBox,
      });

      const itemGap = 12;
      let curY = contentTop + visualH + gapY;
      for (const item of scene.items) {
        const m = measureCompactPointCard(item, innerW, ctx);
        positionedItems.push({
          item,
          x: THEME.safeMargin,
          y: curY,
          width: innerW,
          height: m.height,
          badgeLines: m.badgeLines,
          labelLines: m.labelLines,
          detailLines: m.detailLines,
          badgeFontSize: m.badgeFontSize,
          labelFontSize: m.labelFontSize,
          detailFontSize: m.detailFontSize,
        });
        boundingBoxes.push({
          id: item.id,
          kind: "card",
          x: THEME.safeMargin,
          y: curY,
          width: innerW,
          height: m.height,
          font_size: m.detailFontSize,
        });
        fontSizes.push(m.badgeFontSize, m.labelFontSize, m.detailFontSize);
        curY += m.height + itemGap;
      }
    }
  } else if (scene.template === "concept_reveal" || scene.template === "recap_ladder") {
    const gap = 14;
    let curY = contentTop;
    for (const item of scene.items) {
      const m = measureConceptCard(item, innerW, ctx);
      positionedItems.push({
        item,
        x: THEME.safeMargin,
        y: curY,
        width: innerW,
        height: m.height,
        badgeLines: m.badgeLines,
        labelLines: m.labelLines,
        detailLines: m.detailLines,
        badgeFontSize: THEME.badgeFontSize,
        labelFontSize: THEME.labelFontSize,
        detailFontSize: THEME.detailFontSize,
      });
      boundingBoxes.push({
        id: item.id,
        kind: "card",
        x: THEME.safeMargin,
        y: curY,
        width: innerW,
        height: m.height,
        font_size: THEME.detailFontSize,
      });
      fontSizes.push(THEME.badgeFontSize, THEME.labelFontSize, THEME.detailFontSize);
      curY += m.height + gap;
    }
  } else if (scene.template === "comparison_grid") {
    const cols = innerW >= 820 && scene.items.length >= 2 ? 2 : 1;
    const colGap = 20;
    const rowGap = 16;
    const colW = Math.floor((innerW - colGap * (cols - 1)) / cols);
    const rows: Array<{ items: SceneItem[]; measured: ReturnType<typeof measureColumnCard>[]; rowH: number }> = [];
    for (let i = 0; i < scene.items.length; i += cols) {
      const rowItems = scene.items.slice(i, i + cols);
      const measured = rowItems.map((item) =>
        measureColumnCard(
          item,
          colW,
          THEME.badgeFontSize,
          THEME.labelFontSize,
          THEME.detailFontSize,
          ctx
        )
      );
      const rowH = Math.max(132, ...measured.map((m) => m.height));
      rows.push({ items: rowItems, measured, rowH });
    }
    const availableH = Math.max(140, contentBottom - contentTop);
    const totalGridH =
      rows.reduce((acc, r) => acc + r.rowH, 0) + Math.max(0, rows.length - 1) * rowGap;
    let curY = contentTop + Math.max(0, Math.floor((availableH - totalGridH) / 2));

    for (const row of rows) {
      row.items.forEach((item, c) => {
        const m = row.measured[c];
        const x = THEME.safeMargin + c * (colW + colGap);
        positionedItems.push({
          item,
          x,
          y: curY,
          width: colW,
          height: row.rowH,
          badgeLines: m.badgeLines,
          labelLines: m.labelLines,
          detailLines: m.detailLines,
          badgeFontSize: THEME.badgeFontSize,
          labelFontSize: THEME.labelFontSize,
          detailFontSize: THEME.detailFontSize,
        });
        boundingBoxes.push({
          id: item.id,
          kind: "card",
          x,
          y: curY,
          width: colW,
          height: row.rowH,
          font_size: THEME.detailFontSize,
        });
        fontSizes.push(THEME.badgeFontSize, THEME.labelFontSize, THEME.detailFontSize);
      });
      curY += row.rowH + rowGap;
    }
  } else if (scene.template === "process_diagram") {
    const count = Math.max(1, scene.items.length);
    const arrowGap = count > 1 ? 34 : 0;
    const cardW = Math.floor((innerW - arrowGap * (count - 1)) / count);
    const measured = scene.items.map((item) =>
      measureColumnCard(
        item,
        cardW,
        THEME.badgeFontSize,
        THEME.labelFontSize,
        THEME.detailFontSize,
        ctx
      )
    );
    const maxCardH = Math.max(140, ...measured.map((m) => m.height));
    const availableH = Math.max(140, contentBottom - contentTop);
    const cardY = contentTop + Math.max(0, Math.floor((availableH - maxCardH) / 2));

    scene.items.forEach((item, idx) => {
      const m = measured[idx];
      const x = THEME.safeMargin + idx * (cardW + arrowGap);
      positionedItems.push({
        item,
        x,
        y: cardY,
        width: cardW,
        height: maxCardH,
        badgeLines: m.badgeLines,
        labelLines: m.labelLines,
        detailLines: m.detailLines,
        badgeFontSize: THEME.badgeFontSize,
        labelFontSize: THEME.labelFontSize,
        detailFontSize: THEME.detailFontSize,
      });
      boundingBoxes.push({
        id: item.id,
        kind: "card",
        x,
        y: cardY,
        width: cardW,
        height: maxCardH,
        font_size: THEME.detailFontSize,
      });
      fontSizes.push(THEME.badgeFontSize, THEME.labelFontSize, THEME.detailFontSize);
    });
  } else if (innerW < 820) {
    // Portrait timeline: vertical spine on left, milestones stacked cleanly
    const spineGutter = 44;
    const cardW = Math.max(220, innerW - spineGutter);
    const cardX = THEME.safeMargin + spineGutter;
    const gap = 16;
    const measured = scene.items.map((item) => measureConceptCard(item, cardW, ctx));
    const availableH = Math.max(160, contentBottom - contentTop);
    const totalH =
      measured.reduce((acc, m) => acc + m.height, 0) + Math.max(0, measured.length - 1) * gap;
    let curY = contentTop + Math.max(0, Math.floor((availableH - totalH) / 2));

    scene.items.forEach((item, idx) => {
      const m = measured[idx];
      positionedItems.push({
        item,
        x: cardX,
        y: curY,
        width: cardW,
        height: m.height,
        badgeLines: m.badgeLines,
        labelLines: m.labelLines,
        detailLines: m.detailLines,
        badgeFontSize: THEME.badgeFontSize,
        labelFontSize: THEME.labelFontSize,
        detailFontSize: THEME.detailFontSize,
      });
      boundingBoxes.push({
        id: item.id,
        kind: "card",
        x: cardX,
        y: curY,
        width: cardW,
        height: m.height,
        font_size: THEME.detailFontSize,
      });
      fontSizes.push(THEME.badgeFontSize, THEME.labelFontSize, THEME.detailFontSize);
      curY += m.height + gap;
    });
  } else {
    // Landscape timeline
    const count = Math.max(1, scene.items.length);
    const colGap = 22;
    const cardW = Math.floor((innerW - colGap * (count - 1)) / count);
    const spineY = contentTop + 56;
    const cardY = spineY + 28;
    const measured = scene.items.map((item) =>
      measureColumnCard(
        item,
        cardW,
        THEME.badgeFontSize,
        THEME.labelFontSize,
        THEME.detailFontSize,
        ctx
      )
    );
    const maxCardH = Math.max(140, ...measured.map((m) => m.height));

    scene.items.forEach((item, idx) => {
      const m = measured[idx];
      const x = THEME.safeMargin + idx * (cardW + colGap);
      positionedItems.push({
        item,
        x,
        y: cardY,
        width: cardW,
        height: maxCardH,
        badgeLines: m.badgeLines,
        labelLines: m.labelLines,
        detailLines: m.detailLines,
        badgeFontSize: THEME.badgeFontSize,
        labelFontSize: THEME.labelFontSize,
        detailFontSize: THEME.detailFontSize,
      });
      boundingBoxes.push({
        id: item.id,
        kind: "card",
        x,
        y: cardY,
        width: cardW,
        height: maxCardH,
        font_size: THEME.detailFontSize,
      });
      fontSizes.push(THEME.badgeFontSize, THEME.labelFontSize, THEME.detailFontSize);
    });
  }

  return {
    width,
    height,
    contentTop,
    contentBottom,
    titleLines,
    subtitleLines,
    headerBottom,
    effectiveLayout,
    visualBox,
    positionedItems,
    boundingBoxes,
    minFontSize: Math.min(...fontSizes),
  };
}

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function auditSceneLayout(
  scene: SceneSpec,
  width: number = THEME.width,
  height: number = THEME.height,
  ctx?: TextMeasureContext
): LayoutMetrics {
  const layout = computeSceneLayout(scene, width, height, ctx);
  const boxes = layout.boundingBoxes;
  let maxOverlapCount = 0;
  let outOfBoundsCount = 0;

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const maxBottom =
      b.kind === "card" ? height - THEME.captionZoneHeight : height - 8;
    if (
      b.x < 16 ||
      b.y < 12 ||
      b.x + b.width > width - 16 ||
      b.y + b.height > maxBottom
    ) {
      outOfBoundsCount += 1;
    }
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(b, boxes[j])) {
        maxOverlapCount += 1;
      }
    }
  }

  return {
    min_font_size: layout.minFontSize,
    max_overlap_count: maxOverlapCount,
    out_of_bounds_count: outOfBoundsCount,
    bounding_boxes: boxes,
  };
}

function splitNarrationForParts(
  scene: SceneSpec,
  itemGroups: SceneItem[][]
): SceneSpec[] {
  const totalParts = itemGroups.length;
  const baseId = scene.base_scene_id || scene.scene_id;
  const sentences = scene.narration_sentences;
  const usedSentences = new Set<number>();

  return itemGroups.map((group, partIdx) => {
    const partSentences: string[] = [];
    const cueRemap = new Map<number, number>();

    for (const item of group) {
      if (
        item.cue_index !== null &&
        item.cue_index !== undefined &&
        item.cue_index >= 0 &&
        item.cue_index < sentences.length
      ) {
        const origIdx = item.cue_index;
        if (!cueRemap.has(origIdx)) {
          cueRemap.set(origIdx, partSentences.length);
          partSentences.push(sentences[origIdx]);
          usedSentences.add(origIdx);
        }
      }
    }

    // Attach any remaining unmapped sentences to the final part
    if (partIdx === totalParts - 1) {
      sentences.forEach((s, idx) => {
        if (!usedSentences.has(idx)) {
          partSentences.push(s);
          usedSentences.add(idx);
        }
      });
    }

    if (partSentences.length === 0) {
      if (sentences.length > 0) {
        const start = Math.floor((partIdx * sentences.length) / totalParts);
        const end = Math.max(
          start + 1,
          Math.floor(((partIdx + 1) * sentences.length) / totalParts)
        );
        partSentences.push(...sentences.slice(start, Math.min(end, sentences.length)));
      } else {
        for (const item of group) {
          partSentences.push(`${item.label}. ${item.detail}`);
        }
      }
    }

    const remappedItems: SceneItem[] = group.map((item, localIdx) => {
      if (
        item.cue_index !== null &&
        item.cue_index !== undefined &&
        cueRemap.has(item.cue_index)
      ) {
        return { ...item, cue_index: cueRemap.get(item.cue_index)! };
      }
      return {
        ...item,
        cue_index: Math.min(localIdx, Math.max(0, partSentences.length - 1)),
      };
    });

    const dropHeroRepeat =
      partIdx > 0 && scene.visual?.kind === "kinetic_title";
    return {
      ...scene,
      scene_id: totalParts === 1 ? baseId : `${baseId}__p${partIdx + 1}`,
      base_scene_id: baseId,
      part_index: partIdx + 1,
      part_total: totalParts,
      narration_sentences: partSentences,
      items: remappedItems,
      visual: dropHeroRepeat ? null : scene.visual,
      visual_layout: dropHeroRepeat ? null : scene.visual_layout,
    };
  });
}

/**
 * Automatically splits overflowing scenes across readable continuation scenes
 * without shrinking typography below `THEME.minFontSize` (18px).
 */
export function paginateScene(
  scene: SceneSpec,
  width: number = THEME.width,
  height: number = THEME.height,
  ctx?: TextMeasureContext
): SceneSpec[] {
  if (scene.items.length <= 1) {
    return [
      {
        ...scene,
        base_scene_id: scene.base_scene_id || scene.scene_id,
        part_index: 1,
        part_total: 1,
      },
    ];
  }

  const innerW = width - THEME.safeMargin * 2;
  const { headerBottom } = computeHeader(
    { ...scene, part_index: 1, part_total: 2 },
    width,
    ctx
  );
  const contentTop = headerBottom + 10;
  const contentBottom = height - THEME.captionZoneHeight - 12;
  const availableH = Math.max(180, contentBottom - contentTop);

  const groups: SceneItem[][] = [];
  const effectiveLayout = resolveVisualMode(scene);

  if (effectiveLayout !== "cards") {
    const gap = 12;
    const isLandscape = innerW >= 820;
    const colGap = 24;
    const itemsW =
      effectiveLayout === "hero"
        ? isLandscape && scene.items.length >= 2
          ? Math.floor((innerW - 18) / 2)
          : innerW
        : isLandscape
          ? innerW - colGap - Math.floor((innerW - colGap) * 0.55)
          : innerW;
    const itemBudgetH =
      effectiveLayout === "hero"
        ? Math.max(120, Math.floor(availableH * 0.34) - 14)
        : isLandscape
          ? availableH
          : Math.max(140, availableH - Math.floor(availableH * 0.42) - 16);

    if (effectiveLayout === "hero" && isLandscape) {
      let currentGroup: SceneItem[] = [];
      for (const item of scene.items) {
        const candidate = [...currentGroup, item];
        const rowsH = (() => {
          let total = 0;
          for (let i = 0; i < candidate.length; i += 2) {
            const pair = candidate.slice(i, i + 2);
            const h = Math.max(88, ...pair.map((p) => measureCompactPointCard(p, itemsW, ctx).height));
            total += (i === 0 ? 0 : gap) + h;
          }
          return total;
        })();
        if (currentGroup.length > 0 && rowsH > itemBudgetH) {
          groups.push(currentGroup);
          currentGroup = [item];
        } else {
          currentGroup = candidate;
        }
      }
      if (currentGroup.length > 0) groups.push(currentGroup);
    } else {
      let currentGroup: SceneItem[] = [];
      let currentH = 0;
      for (const item of scene.items) {
        const m = measureCompactPointCard(item, itemsW, ctx);
        const nextH = currentGroup.length === 0 ? m.height : currentH + gap + m.height;
        if (currentGroup.length > 0 && nextH > itemBudgetH) {
          groups.push(currentGroup);
          currentGroup = [item];
          currentH = m.height;
        } else {
          currentGroup.push(item);
          currentH = nextH;
        }
      }
      if (currentGroup.length > 0) groups.push(currentGroup);
    }
  } else if (scene.template === "concept_reveal" || scene.template === "recap_ladder") {
    const gap = 14;
    let currentGroup: SceneItem[] = [];
    let currentH = 0;

    for (const item of scene.items) {
      const m = measureConceptCard(item, innerW, ctx);
      const nextH =
        currentGroup.length === 0 ? m.height : currentH + gap + m.height;
      if (currentGroup.length > 0 && nextH > availableH) {
        groups.push(currentGroup);
        currentGroup = [item];
        currentH = m.height;
      } else {
        currentGroup.push(item);
        currentH = nextH;
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
  } else if (scene.template === "comparison_grid") {
    const cols = innerW >= 820 ? 2 : 1;
    const colGap = 20;
    const rowGap = 16;
    const colW = Math.floor((innerW - colGap * (cols - 1)) / cols);
    const measureGroupHeight = (items: SceneItem[]): number => {
      let total = 0;
      for (let i = 0; i < items.length; i += cols) {
        const row = items.slice(i, i + cols);
        const rowH = Math.max(
          132,
          ...row.map(
            (c) =>
              measureColumnCard(
                c,
                colW,
                THEME.badgeFontSize,
                THEME.labelFontSize,
                THEME.detailFontSize,
                ctx
              ).height
          )
        );
        total += (i === 0 ? 0 : rowGap) + rowH;
      }
      return total;
    };

    let currentGroup: SceneItem[] = [];
    for (const item of scene.items) {
      const candidate = [...currentGroup, item];
      if (currentGroup.length > 0 && measureGroupHeight(candidate) > availableH) {
        groups.push(currentGroup);
        currentGroup = [item];
      } else {
        currentGroup = candidate;
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
  } else if (scene.template === "timeline" && innerW < 820) {
    // Portrait vertical timeline pagination
    const spineGutter = 44;
    const cardW = Math.max(220, innerW - spineGutter);
    const gap = 16;
    let currentGroup: SceneItem[] = [];
    let currentH = 0;

    for (const item of scene.items) {
      const m = measureConceptCard(item, cardW, ctx);
      const nextH =
        currentGroup.length === 0 ? m.height : currentH + gap + m.height;
      if (currentGroup.length > 0 && nextH > availableH) {
        groups.push(currentGroup);
        currentGroup = [item];
        currentH = m.height;
      } else {
        currentGroup.push(item);
        currentH = nextH;
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
  } else {
    // process_diagram or landscape timeline: horizontal cards with minimum comfortable width >= 330px
    const gap = scene.template === "process_diagram" ? 34 : 22;
    const maxColsByWidth = Math.max(
      1,
      Math.min(3, Math.floor((innerW + gap) / (330 + gap)))
    );
    let currentGroup: SceneItem[] = [];

    for (const item of scene.items) {
      const candidate = [...currentGroup, item];
      if (currentGroup.length > 0 && candidate.length > maxColsByWidth) {
        groups.push(currentGroup);
        currentGroup = [item];
        continue;
      }
      // Verify measured height fits comfortably at candidate column width
      const cardW = Math.floor(
        (innerW - gap * (candidate.length - 1)) / candidate.length
      );
      const spineReserve = scene.template === "timeline" ? 84 : 0;
      const maxColH = Math.max(
        ...candidate.map(
          (c) =>
            measureColumnCard(
              c,
              cardW,
              THEME.badgeFontSize,
              THEME.labelFontSize,
              THEME.detailFontSize,
              ctx
            ).height
        )
      );
      if (currentGroup.length > 0 && maxColH + spineReserve > availableH) {
        groups.push(currentGroup);
        currentGroup = [item];
      } else {
        currentGroup = candidate;
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
  }

  return splitNarrationForParts(scene, groups);
}

export function paginateScenes(
  scenes: SceneSpec[],
  width: number = THEME.width,
  height: number = THEME.height,
  ctx?: TextMeasureContext
): SceneSpec[] {
  return scenes.flatMap((s) => paginateScene(s, width, height, ctx));
}
