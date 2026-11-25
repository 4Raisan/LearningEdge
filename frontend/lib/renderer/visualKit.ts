// Motion graphics visual kit ported from Qoder Motion Studio for Konva & headless Canvas rendering.

export interface MotionPalette {
  name: string;
  bgStart: string;
  bgEnd: string;
  gridLine: string;
  blobPrimary: string;
  blobSecondary: string;
  blobWarm: string;
  particle: string;
  accentPrimary: string;
  accentSecondary: string;
  accentWarm: string;
  surface: string;
  surfaceActive: string;
  border: string;
  borderActive: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  badgeText: string;
  captionBg: string;
}

export const MOTION_PALETTES: Record<string, MotionPalette> = {
  night: {
    name: "night",
    bgStart: "#090d1a",
    bgEnd: "#0f172a",
    gridLine: "rgba(148, 163, 184, 0.06)",
    blobPrimary: "rgba(56, 189, 248, 0.14)",
    blobSecondary: "rgba(129, 140, 248, 0.13)",
    blobWarm: "rgba(251, 191, 36, 0.08)",
    particle: "rgba(125, 211, 252, 0.34)",
    accentPrimary: "#38bdf8",
    accentSecondary: "#818cf8",
    accentWarm: "#fbbf24",
    surface: "rgba(15, 23, 42, 0.84)",
    surfaceActive: "rgba(23, 37, 68, 0.94)",
    border: "rgba(148, 163, 184, 0.24)",
    borderActive: "#38bdf8",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#94a3b8",
    badgeText: "#082f49",
    captionBg: "rgba(9, 13, 26, 0.88)",
  },
  light: {
    name: "light",
    bgStart: "#f8fafc",
    bgEnd: "#eef2f6",
    gridLine: "rgba(15, 23, 42, 0.05)",
    blobPrimary: "rgba(2, 132, 199, 0.09)",
    blobSecondary: "rgba(79, 70, 229, 0.08)",
    blobWarm: "rgba(217, 119, 6, 0.06)",
    particle: "rgba(2, 132, 199, 0.22)",
    accentPrimary: "#0284c7",
    accentSecondary: "#4f46e5",
    accentWarm: "#d97706",
    surface: "rgba(255, 255, 255, 0.94)",
    surfaceActive: "#ffffff",
    border: "rgba(15, 23, 42, 0.14)",
    borderActive: "#0284c7",
    textPrimary: "#0f172a",
    textSecondary: "#334155",
    textMuted: "#64748b",
    badgeText: "#ffffff",
    captionBg: "rgba(15, 23, 42, 0.88)",
  },
  forest: {
    name: "forest",
    bgStart: "#071410",
    bgEnd: "#0d221c",
    gridLine: "rgba(167, 243, 208, 0.06)",
    blobPrimary: "rgba(52, 211, 153, 0.14)",
    blobSecondary: "rgba(45, 212, 191, 0.12)",
    blobWarm: "rgba(251, 191, 36, 0.08)",
    particle: "rgba(110, 231, 183, 0.34)",
    accentPrimary: "#34d399",
    accentSecondary: "#2dd4bf",
    accentWarm: "#fbbf24",
    surface: "rgba(10, 28, 22, 0.86)",
    surfaceActive: "rgba(16, 46, 37, 0.94)",
    border: "rgba(110, 231, 183, 0.22)",
    borderActive: "#34d399",
    textPrimary: "#ecfdf5",
    textSecondary: "#bbf7d0",
    textMuted: "#86efac",
    badgeText: "#052e16",
    captionBg: "rgba(6, 18, 14, 0.90)",
  },
};

export function resolvePalette(themeName?: string): MotionPalette {
  const key = (themeName ?? "night").toLowerCase();
  return MOTION_PALETTES[key] ?? MOTION_PALETTES.night;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 3);
}

export function easeOutExpo(t: number): number {
  const u = clamp01(t);
  return u >= 1 ? 1 : 1 - Math.pow(2, -10 * u);
}

export function easeOutBack(t: number): number {
  const u = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

export function progressWindow(timeMs: number, startMs: number, durationMs: number): number {
  if (durationMs <= 0) return timeMs >= startMs ? 1 : 0;
  return clamp01((timeMs - startMs) / durationMs);
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

const bgCache = new Map<string, HTMLCanvasElement>();
const blobSpriteCache = new Map<string, HTMLCanvasElement[]>();

export function createOffscreenCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  const CanvasCtor = (
    ctx.canvas as unknown as { constructor?: new (width: number, height: number) => unknown }
  )?.constructor;
  if (typeof CanvasCtor === "function") {
    try {
      const c = new CanvasCtor(w, h) as HTMLCanvasElement;
      if (typeof c?.getContext === "function") {
        c.width = w;
        c.height = h;
        return c;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function getCachedBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: MotionPalette,
): HTMLCanvasElement | null {
  const key = `${palette.name}:${width}x${height}`;
  const hit = bgCache.get(key);
  if (hit) return hit;
  const off = createOffscreenCanvas(ctx, width, height);
  if (!off) return null;
  const octx = off.getContext("2d");
  if (!octx) return null;
  const grad = octx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, palette.bgStart);
  grad.addColorStop(1, palette.bgEnd);
  octx.fillStyle = grad;
  octx.fillRect(0, 0, width, height);
  bgCache.set(key, off);
  return off;
}

function getCachedBlobSprites(
  ctx: CanvasRenderingContext2D,
  palette: MotionPalette,
): HTMLCanvasElement[] | null {
  const hit = blobSpriteCache.get(palette.name);
  if (hit) return hit;
  const colors = [palette.blobPrimary, palette.blobSecondary];
  const sprites: HTMLCanvasElement[] = [];
  const size = 128;
  const half = size / 2;
  for (const color of colors) {
    const off = createOffscreenCanvas(ctx, size, size);
    if (!off) return null;
    const octx = off.getContext("2d");
    if (!octx) return null;
    const rg = octx.createRadialGradient(half, half, 0, half, half, half);
    rg.addColorStop(0, color);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    octx.fillStyle = rg;
    octx.fillRect(0, 0, size, size);
    sprites.push(off);
  }
  blobSpriteCache.set(palette.name, sprites);
  return sprites;
}

export function drawMotionBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  palette: MotionPalette,
): void {
  const t = timeMs / 1000;
  const cachedBg = getCachedBackground(ctx, width, height, palette);
  if (cachedBg) {
    ctx.drawImage(cachedBg, 0, 0);
  } else {
    ctx.fillStyle = palette.bgStart;
    ctx.fillRect(0, 0, width, height);
  }

  // Two ambient moving glow blobs using pre-baked radial sprites
  const blobs = [
    {
      cx: width * (0.22 + 0.06 * Math.sin(t * 0.35)),
      cy: height * (0.26 + 0.05 * Math.cos(t * 0.28)),
      r: Math.min(width, height) * 0.32,
      color: palette.blobPrimary,
    },
    {
      cx: width * (0.8 + 0.05 * Math.cos(t * 0.31)),
      cy: height * (0.74 + 0.06 * Math.sin(t * 0.24)),
      r: Math.min(width, height) * 0.3,
      color: palette.blobSecondary,
    },
  ];

  const sprites = getCachedBlobSprites(ctx, palette);
  if (sprites) {
    blobs.forEach((blob, idx) => {
      ctx.drawImage(sprites[idx], blob.cx - blob.r, blob.cy - blob.r, blob.r * 2, blob.r * 2);
    });
  } else {
    for (const blob of blobs) {
      const rg = ctx.createRadialGradient(blob.cx, blob.cy, 0, blob.cx, blob.cy, blob.r);
      rg.addColorStop(0, blob.color);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(blob.cx - blob.r, blob.cy - blob.r, blob.r * 2, blob.r * 2);
    }
  }

  // Slow drifting hairline grid (single vectorized path)
  const cell = Math.max(64, Math.round(Math.min(width, height) / 11));
  const ox = (t * 8) % cell;
  const oy = (t * 5) % cell;
  ctx.save();
  ctx.strokeStyle = palette.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -cell + ox; x < width + cell; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = -cell + oy; y < height + cell; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();

  // Pulsing ambient particles
  ctx.save();
  const particleCount = 22;
  for (let i = 0; i < particleCount; i++) {
    const seedA = Math.sin(i * 12.9898) * 43758.5453;
    const fx = seedA - Math.floor(seedA);
    const seedB = Math.sin(i * 78.233 + 1.7) * 24634.6345;
    const fy = seedB - Math.floor(seedB);
    const px = ((fx * width + t * (7 + (i % 5) * 2.2)) % (width + 40)) - 20;
    const py = ((fy * height - t * (4 + (i % 3) * 1.8) + height * 4) % (height + 40)) - 20;
    const pulse = 0.45 + 0.55 * Math.sin(t * (1.8 + (i % 4) * 0.45) + i * 1.1);
    const radius = 1.5 + (i % 3) * 0.85;
    ctx.globalAlpha = 0.24 + 0.46 * pulse;
    ctx.fillStyle = i % 7 === 0 ? palette.accentWarm : palette.particle;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export type VectorIconName =
  | "brain"
  | "zap"
  | "lock"
  | "unlock"
  | "key"
  | "layers"
  | "check"
  | "x"
  | "alert"
  | "arrowR"
  | "arrowDown"
  | "database"
  | "cpu"
  | "globe"
  | "clock"
  | "sparkles"
  | "target";

export function pickIconForText(text: string, fallbackIndex = 0): VectorIconName {
  const t = text.toLowerCase();
  if (/lock|encrypt|auth|secret|credential|secure|guard|permission/.test(t)) return "lock";
  if (/unlock|open|release|unstage|reset/.test(t)) return "unlock";
  if (/key|token|hash|sign|id/.test(t)) return "key";
  if (/cache|storage|db|database|memory|table|commit|snapshot|repo|index/.test(t)) return "database";
  if (/cpu|engine|worker|compute|process|execute|runtime|stage|render/.test(t)) return "cpu";
  if (/network|web|cloud|api|remote|global|http|url/.test(t)) return "globe";
  if (/time|history|timeline|decade|latency|duration|ms|second|evolution/.test(t)) return "clock";
  if (/warn|caveat|qualification|error|risk|bug|conflict|fail/.test(t)) return "alert";
  if (/verify|check|pass|valid|coverage|done|accept|true/.test(t)) return "check";
  if (/reject|miss|omit|never|avoid|block|wrong/.test(t)) return "x";
  if (/fast|speed|spark|insight|energy|quick|instant/.test(t)) return "zap";
  if (/layer|stack|structure|graph|module|branch/.test(t)) return "layers";
  if (/goal|target|focus|objective|recap|takeaway|core/.test(t)) return "target";
  if (/concept|idea|theory|learn|reason|mental|why/.test(t)) return "brain";
  if (/example|practice|analog|story|imagine/.test(t)) return "sparkles";
  const cycle: VectorIconName[] = ["brain", "layers", "cpu", "sparkles", "target", "zap"];
  return cycle[Math.abs(fallbackIndex) % cycle.length];
}

export function drawVectorIcon(
  ctx: CanvasRenderingContext2D,
  name: VectorIconName,
  cx: number,
  cy: number,
  size: number,
  color: string,
  progress = 1,
): void {
  const s = size / 24;
  const p = clamp01(progress);
  if (p <= 0.01) return;

  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha *= Math.min(1, p * 1.4);

  if (p < 0.99) {
    ctx.setLineDash([72]);
    ctx.lineDashOffset = 72 * (1 - easeOutCubic(p));
  }

  ctx.beginPath();
  switch (name) {
    case "brain":
      ctx.arc(9.5, 9, 4.2, Math.PI * 0.5, Math.PI * 1.85);
      ctx.arc(14.5, 9, 4.2, Math.PI * 1.15, Math.PI * 0.5);
      ctx.moveTo(12, 5.5);
      ctx.lineTo(12, 18.5);
      ctx.moveTo(7.5, 13.5);
      ctx.quadraticCurveTo(6.5, 17, 10, 18);
      ctx.moveTo(16.5, 13.5);
      ctx.quadraticCurveTo(17.5, 17, 14, 18);
      break;
    case "zap":
      ctx.moveTo(13, 2);
      ctx.lineTo(4, 14);
      ctx.lineTo(11.5, 14);
      ctx.lineTo(10.5, 22);
      ctx.lineTo(20, 10);
      ctx.lineTo(12.5, 10);
      ctx.closePath();
      break;
    case "lock":
      ctx.rect(5, 11, 14, 9);
      ctx.moveTo(8, 11);
      ctx.arc(12, 8.5, 4, Math.PI, 0);
      ctx.moveTo(12, 14.5);
      ctx.lineTo(12, 17);
      break;
    case "unlock":
      ctx.rect(5, 11, 14, 9);
      ctx.moveTo(8, 11);
      ctx.arc(12, 8, 4, Math.PI, 1.85 * Math.PI);
      break;
    case "key":
      ctx.arc(8, 14, 4, 0, Math.PI * 2);
      ctx.moveTo(11.2, 11.2);
      ctx.lineTo(20, 4);
      ctx.lineTo(21, 7);
      ctx.moveTo(17, 6.5);
      ctx.lineTo(19, 8.5);
      break;
    case "layers":
      ctx.moveTo(12, 3);
      ctx.lineTo(21, 8);
      ctx.lineTo(12, 13);
      ctx.lineTo(3, 8);
      ctx.closePath();
      ctx.moveTo(3, 12.5);
      ctx.lineTo(12, 17.5);
      ctx.lineTo(21, 12.5);
      ctx.moveTo(3, 17);
      ctx.lineTo(12, 21.5);
      ctx.lineTo(21, 17);
      break;
    case "check":
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.moveTo(8, 12.5);
      ctx.lineTo(11, 15.5);
      ctx.lineTo(16.5, 9.5);
      break;
    case "x":
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.moveTo(9, 9);
      ctx.lineTo(15, 15);
      ctx.moveTo(15, 9);
      ctx.lineTo(9, 15);
      break;
    case "alert":
      ctx.moveTo(12, 3);
      ctx.lineTo(21, 19);
      ctx.lineTo(3, 19);
      ctx.closePath();
      ctx.moveTo(12, 9.5);
      ctx.lineTo(12, 14);
      ctx.moveTo(12, 16.5);
      ctx.lineTo(12, 16.8);
      break;
    case "arrowR":
      ctx.moveTo(4, 12);
      ctx.lineTo(19, 12);
      ctx.moveTo(14, 7);
      ctx.lineTo(19, 12);
      ctx.lineTo(14, 17);
      break;
    case "arrowDown":
      ctx.moveTo(12, 4);
      ctx.lineTo(12, 19);
      ctx.moveTo(7, 14);
      ctx.lineTo(12, 19);
      ctx.lineTo(17, 14);
      break;
    case "database":
      ctx.ellipse(12, 6, 7.5, 2.8, 0, 0, Math.PI * 2);
      ctx.moveTo(4.5, 6);
      ctx.lineTo(4.5, 18);
      ctx.ellipse(12, 18, 7.5, 2.8, 0, 0, Math.PI);
      ctx.moveTo(19.5, 6);
      ctx.lineTo(19.5, 18);
      ctx.moveTo(4.5, 12);
      ctx.ellipse(12, 12, 7.5, 2.8, 0, 0, Math.PI);
      break;
    case "cpu":
      ctx.rect(7, 7, 10, 10);
      ctx.rect(10, 10, 4, 4);
      ctx.moveTo(9, 3);
      ctx.lineTo(9, 7);
      ctx.moveTo(15, 3);
      ctx.lineTo(15, 7);
      ctx.moveTo(9, 17);
      ctx.lineTo(9, 21);
      ctx.moveTo(15, 17);
      ctx.lineTo(15, 21);
      ctx.moveTo(3, 12);
      ctx.lineTo(7, 12);
      ctx.moveTo(17, 12);
      ctx.lineTo(21, 12);
      break;
    case "globe":
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.moveTo(3.5, 12);
      ctx.lineTo(20.5, 12);
      ctx.ellipse(12, 12, 4.2, 9, 0, 0, Math.PI * 2);
      break;
    case "clock":
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.moveTo(12, 7);
      ctx.lineTo(12, 12);
      ctx.lineTo(16, 14);
      break;
    case "sparkles":
      ctx.moveTo(12, 3);
      ctx.lineTo(13.8, 9.2);
      ctx.lineTo(20, 11);
      ctx.lineTo(13.8, 12.8);
      ctx.lineTo(12, 19);
      ctx.lineTo(10.2, 12.8);
      ctx.lineTo(4, 11);
      ctx.lineTo(10.2, 9.2);
      ctx.closePath();
      break;
    case "target":
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.moveTo(17, 12);
      ctx.arc(12, 12, 5, 0, Math.PI * 2);
      ctx.moveTo(13.8, 12);
      ctx.arc(12, 12, 1.8, 0, Math.PI * 2);
      break;
  }
  ctx.stroke();
  ctx.restore();
}

export function drawConnector(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  revealProgress: number,
  timeMs: number,
  lineColor: string,
  packetColor: string,
): void {
  const p = easeOutCubic(revealProgress);
  if (p <= 0.02) return;

  const ex = lerp(x1, x2, p);
  const ey = lerp(y1, y2, p);

  ctx.save();
  // Soft base connector track
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.6;
  ctx.globalAlpha = 0.52 * p;
  ctx.setLineDash([7, 7]);
  ctx.lineDashOffset = -(timeMs / 1000) * 34;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // Solid arrowhead at the end when mostly revealed
  if (p > 0.72) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 9;
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.9 * ((p - 0.72) / 0.28);
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - len * Math.cos(angle - Math.PI / 6), ey - len * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(ex - len * Math.cos(angle + Math.PI / 6), ey - len * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  // Continuously traveling light packet along the connector
  const travel = ((timeMs / 1400) % 1) * p;
  const px = lerp(x1, x2, travel);
  const py = lerp(y1, y2, travel);
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = packetColor;
  ctx.beginPath();
  ctx.arc(px, py, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawKineticLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  introProgress: number,
): void {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  ctx.save();
  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.fillStyle = color;

  if (introProgress >= 0.99 || words.length <= 1) {
    const u = easeOutExpo(introProgress);
    ctx.globalAlpha = u;
    ctx.fillText(text, x, y + (1 - u) * 10);
    ctx.restore();
    return;
  }

  let cursorX = x;
  const spaceW = ctx.measureText(" ").width;
  const step = 0.45 / Math.max(1, words.length - 1);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const start = i * step * 0.6;
    const wp = easeOutBack(clamp01((introProgress - start) / 0.55));
    ctx.globalAlpha = clamp01(wp);
    ctx.fillText(word, cursorX, y + (1 - wp) * 10);
    cursorX += ctx.measureText(word).width + spaceW;
  }
  ctx.restore();
}

export function drawGlobalProgressBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  sceneIndex: number,
  sceneTotal: number,
  timeMs: number,
  sceneDurationMs: number,
  palette: MotionPalette,
): void {
  const safeTotal = Math.max(1, sceneTotal);
  const sceneFrac = sceneDurationMs > 0 ? clamp01(timeMs / sceneDurationMs) : 1;
  const overall = clamp01((sceneIndex + sceneFrac) / safeTotal);

  ctx.save();
  ctx.fillStyle = palette.border;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(0, 0, width, 4);

  const grad = ctx.createLinearGradient(0, 0, Math.max(8, width * overall), 0);
  grad.addColorStop(0, palette.accentPrimary);
  grad.addColorStop(0.7, palette.accentSecondary);
  grad.addColorStop(1, palette.accentWarm);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width * overall, 4);
  ctx.restore();
}
