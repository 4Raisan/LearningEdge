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

export function easeInOutCubic(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export function seg(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  return clamp01((t - a) / (b - a));
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
  | "target"
  | "cloud"
  | "bolt"
  | "chart"
  | "person"
  | "phone"
  | "mail"
  | "search"
  | "star"
  | "shield"
  | "gear"
  | "router"
  | "house"
  | "server"
  | "git"
  | "packet"
  | "code"
  | "plus"
  | "arrow";

const VALID_ICONS = new Set<VectorIconName>([
  "brain",
  "zap",
  "lock",
  "unlock",
  "key",
  "layers",
  "check",
  "x",
  "alert",
  "arrowR",
  "arrowDown",
  "database",
  "cpu",
  "globe",
  "clock",
  "sparkles",
  "target",
  "cloud",
  "bolt",
  "chart",
  "person",
  "phone",
  "mail",
  "search",
  "star",
  "shield",
  "gear",
  "router",
  "house",
  "server",
  "git",
  "packet",
  "code",
  "plus",
  "arrow",
]);

const ICON_ALIASES: Record<string, VectorIconName> = {
  network: "globe",
  internet: "globe",
  web: "globe",
  laptop: "cpu",
  computer: "cpu",
  device: "cpu",
  client: "cpu",
  user: "person",
  team: "person",
  people: "person",
  home: "house",
  address: "house",
  building: "house",
  branch: "git",
  commit: "git",
  merge: "git",
  repo: "git",
  message: "mail",
  envelope: "mail",
  letter: "mail",
  email: "mail",
  warning: "alert",
  error: "alert",
  graph: "chart",
  stats: "chart",
  metrics: "chart",
  analytics: "chart",
  lightning: "bolt",
  fast: "bolt",
  security: "shield",
  settings: "gear",
  config: "gear",
  storage: "database",
  db: "database",
  data: "packet",
  box: "packet",
  package: "packet",
};

export function resolveIconName(
  explicit?: string | null,
  fallbackText = "",
  fallbackIndex = 0,
): VectorIconName {
  if (explicit) {
    const raw = explicit.trim();
    if (VALID_ICONS.has(raw as VectorIconName)) {
      return raw as VectorIconName;
    }
    const lower = raw.toLowerCase();
    if (VALID_ICONS.has(lower as VectorIconName)) {
      return lower as VectorIconName;
    }
    if (ICON_ALIASES[lower]) {
      return ICON_ALIASES[lower];
    }
  }
  return pickIconForText(fallbackText, fallbackIndex);
}

export function pickIconForText(text: string, fallbackIndex = 0): VectorIconName {
  const t = text.toLowerCase();
  if (/router|gateway|switch|hop|routing/.test(t)) return "router";
  if (/house|street|home|postal|mailbox|neighborhood/.test(t)) return "house";
  if (/server|host|backend|node|cluster|rack/.test(t)) return "server";
  if (/git|commit|branch|merge|rebase|pull request|push/.test(t)) return "git";
  if (/packet|payload|frame|datagram|parcel|bundle/.test(t)) return "packet";
  if (/code|script|function|syntax|program|compile/.test(t)) return "code";
  if (/cloud|saas|cdn|aws|azure|gcp/.test(t)) return "cloud";
  if (/shield|protect|firewall|defense|safe/.test(t)) return "shield";
  if (/gear|config|setting|mechanism|engine/.test(t)) return "gear";
  if (/chart|metric|percent|rate|ratio|benchmark|stat/.test(t)) return "chart";
  if (/person|user|developer|student|team|member|client/.test(t)) return "person";
  if (/mail|letter|send|deliver|post/.test(t)) return "mail";
  if (/search|lookup|find|query|discover|resolve/.test(t)) return "search";
  if (/lock|encrypt|auth|secret|credential|secure|guard|permission/.test(t)) return "lock";
  if (/unlock|open|release|unstage|reset/.test(t)) return "unlock";
  if (/key|token|hash|sign|id/.test(t)) return "key";
  if (/cache|storage|db|database|memory|table|snapshot|repo|index/.test(t)) return "database";
  if (/cpu|worker|compute|process|execute|runtime|stage|render/.test(t)) return "cpu";
  if (/network|web|api|remote|global|http|url|ip/.test(t)) return "globe";
  if (/time|history|timeline|decade|latency|duration|ms|second|evolution/.test(t)) return "clock";
  if (/warn|caveat|qualification|error|risk|bug|conflict|fail/.test(t)) return "alert";
  if (/verify|check|pass|valid|coverage|done|accept|true/.test(t)) return "check";
  if (/reject|miss|omit|never|avoid|block|wrong/.test(t)) return "x";
  if (/fast|speed|spark|insight|energy|quick|instant/.test(t)) return "zap";
  if (/layer|stack|structure|graph|module/.test(t)) return "layers";
  if (/goal|target|focus|objective|recap|takeaway|core/.test(t)) return "target";
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
    case "cloud":
      ctx.moveTo(7, 17);
      ctx.bezierCurveTo(3.8, 17, 3, 13.2, 5.8, 12);
      ctx.bezierCurveTo(5.6, 8.2, 9.2, 6, 12.6, 7.2);
      ctx.bezierCurveTo(15.2, 5.2, 19.6, 7, 19.4, 11);
      ctx.bezierCurveTo(21.8, 11.8, 21.4, 17, 17.5, 17);
      ctx.closePath();
      break;
    case "bolt":
      ctx.moveTo(13, 2);
      ctx.lineTo(4, 14);
      ctx.lineTo(11.5, 14);
      ctx.lineTo(10.5, 22);
      ctx.lineTo(20, 10);
      ctx.lineTo(12.5, 10);
      ctx.closePath();
      break;
    case "chart":
      ctx.moveTo(4, 4);
      ctx.lineTo(4, 20);
      ctx.lineTo(20, 20);
      ctx.moveTo(8, 20);
      ctx.lineTo(8, 14);
      ctx.moveTo(13, 20);
      ctx.lineTo(13, 9);
      ctx.moveTo(18, 20);
      ctx.lineTo(18, 11.5);
      break;
    case "person":
      ctx.arc(12, 7.5, 3.3, 0, Math.PI * 2);
      ctx.moveTo(5.5, 20);
      ctx.quadraticCurveTo(6.5, 13.5, 12, 13.5);
      ctx.quadraticCurveTo(17.5, 13.5, 18.5, 20);
      break;
    case "phone":
      ctx.rect(7, 3, 10, 18);
      ctx.moveTo(10.5, 17.5);
      ctx.lineTo(13.5, 17.5);
      break;
    case "mail":
      ctx.rect(3.5, 6, 17, 12);
      ctx.moveTo(3.5, 7);
      ctx.lineTo(12, 13);
      ctx.lineTo(20.5, 7);
      break;
    case "search":
      ctx.arc(10.5, 10.5, 6, 0, Math.PI * 2);
      ctx.moveTo(15, 15);
      ctx.lineTo(20, 20);
      break;
    case "star":
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 8.8 : 4;
        const sx = 12 + Math.cos(a) * r;
        const sy = 12 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      break;
    case "shield":
      ctx.moveTo(12, 3);
      ctx.lineTo(19, 6);
      ctx.lineTo(19, 12);
      ctx.quadraticCurveTo(19, 17.5, 12, 21);
      ctx.quadraticCurveTo(5, 17.5, 5, 12);
      ctx.lineTo(5, 6);
      ctx.closePath();
      break;
    case "gear":
      ctx.arc(12, 12, 3.6, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(12 + Math.cos(a) * 6, 12 + Math.sin(a) * 6);
        ctx.lineTo(12 + Math.cos(a) * 8.8, 12 + Math.sin(a) * 8.8);
      }
      break;
    case "router":
      ctx.rect(3.5, 12, 17, 7);
      ctx.moveTo(7, 12);
      ctx.lineTo(5.5, 5.5);
      ctx.moveTo(17, 12);
      ctx.lineTo(18.5, 5.5);
      ctx.moveTo(7.5, 15.5);
      ctx.lineTo(8.5, 15.5);
      ctx.moveTo(11.5, 15.5);
      ctx.lineTo(12.5, 15.5);
      ctx.moveTo(15.5, 15.5);
      ctx.lineTo(16.5, 15.5);
      break;
    case "house":
      ctx.moveTo(3.5, 11.5);
      ctx.lineTo(12, 4);
      ctx.lineTo(20.5, 11.5);
      ctx.moveTo(6, 10.5);
      ctx.lineTo(6, 20);
      ctx.lineTo(18, 20);
      ctx.lineTo(18, 10.5);
      ctx.rect(10, 14, 4, 6);
      break;
    case "server":
      ctx.rect(4.5, 4, 15, 6.5);
      ctx.rect(4.5, 13.5, 15, 6.5);
      ctx.moveTo(8, 7.2);
      ctx.lineTo(9.2, 7.2);
      ctx.moveTo(8, 16.8);
      ctx.lineTo(9.2, 16.8);
      break;
    case "git":
      ctx.arc(7, 6.5, 2.3, 0, Math.PI * 2);
      ctx.moveTo(9.3, 17.5);
      ctx.arc(7, 17.5, 2.3, 0, Math.PI * 2);
      ctx.moveTo(19.3, 9.5);
      ctx.arc(17, 9.5, 2.3, 0, Math.PI * 2);
      ctx.moveTo(7, 8.8);
      ctx.lineTo(7, 15.2);
      ctx.moveTo(7, 14);
      ctx.quadraticCurveTo(17, 14, 17, 11.8);
      break;
    case "packet":
      ctx.moveTo(12, 3);
      ctx.lineTo(20, 7.5);
      ctx.lineTo(20, 16.5);
      ctx.lineTo(12, 21);
      ctx.lineTo(4, 16.5);
      ctx.lineTo(4, 7.5);
      ctx.closePath();
      ctx.moveTo(4, 7.5);
      ctx.lineTo(12, 12);
      ctx.lineTo(20, 7.5);
      ctx.moveTo(12, 12);
      ctx.lineTo(12, 21);
      break;
    case "code":
      ctx.moveTo(8.5, 7);
      ctx.lineTo(3.5, 12);
      ctx.lineTo(8.5, 17);
      ctx.moveTo(15.5, 7);
      ctx.lineTo(20.5, 12);
      ctx.lineTo(15.5, 17);
      ctx.moveTo(13.5, 5.5);
      ctx.lineTo(10.5, 18.5);
      break;
    case "plus":
      ctx.moveTo(12, 5);
      ctx.lineTo(12, 19);
      ctx.moveTo(5, 12);
      ctx.lineTo(19, 12);
      break;
    case "arrow":
      ctx.moveTo(4, 12);
      ctx.lineTo(19, 12);
      ctx.moveTo(14, 7);
      ctx.lineTo(19, 12);
      ctx.lineTo(14, 17);
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

export function drawGlowNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1,
): void {
  if (alpha <= 0.01 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.5, r * 0.6), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawGlowRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1,
  lineWidth = 2.5,
): void {
  if (alpha <= 0.01 || r <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * 0.22;
  ctx.lineWidth = lineWidth * 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

export function drawGlowArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  a0: number,
  a1: number,
  color: string,
  alpha = 1,
  lineWidth = 4,
): void {
  if (alpha <= 0.01 || r <= 0 || Math.abs(a1 - a0) < 0.005) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.globalAlpha = alpha * 0.22;
  ctx.lineWidth = lineWidth * 2.4;
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

export type Point2D = readonly [number, number];

export function samplePolylinePoint(pts: readonly Point2D[], p: number): [number, number] {
  if (pts.length === 0) return [0, 0];
  if (pts.length === 1) return [pts[0][0], pts[0][1]];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lengths.push(d);
    total += d;
  }
  let dist = clamp01(p) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (dist <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] > 0 ? dist / lengths[i] : 0;
      return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
    }
    dist -= lengths[i];
  }
  return [pts[0][0], pts[0][1]];
}

export function drawPolylinePath(
  ctx: CanvasRenderingContext2D,
  pts: readonly Point2D[],
  progress: number,
  color: string,
  alpha = 1,
  width = 2.5,
  opts: { arrow?: boolean; dash?: number[]; march?: number } = {},
): void {
  const p = clamp01(progress);
  if (alpha <= 0.01 || p <= 0.01 || pts.length < 2) return;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lengths.push(d);
    total += d;
  }
  if (total <= 0.1) return;

  let dist = p * total;
  let end: [number, number] = [pts[pts.length - 1][0], pts[pts.length - 1][1]];
  let dir: [number, number] = [1, 0];

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (opts.dash) {
    ctx.setLineDash(opts.dash);
    ctx.lineDashOffset = opts.march ?? 0;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < lengths.length; i++) {
    dir = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
    if (dist >= lengths[i]) {
      ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
      dist -= lengths[i];
    } else {
      const k = lengths[i] > 0 ? dist / lengths[i] : 0;
      end = [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
      ctx.lineTo(end[0], end[1]);
      break;
    }
  }
  ctx.stroke();

  if (opts.arrow && p > 0.85) {
    const a = Math.atan2(dir[1], dir[0]);
    const headLen = 8 + width * 1.4;
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha * clamp01((p - 0.85) / 0.15);
    ctx.beginPath();
    ctx.moveTo(end[0], end[1]);
    ctx.lineTo(end[0] - Math.cos(a - 0.48) * headLen, end[1] - Math.sin(a - 0.48) * headLen);
    ctx.moveTo(end[0], end[1]);
    ctx.lineTo(end[0] - Math.cos(a + 0.48) * headLen, end[1] - Math.sin(a + 0.48) * headLen);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFlowPath(
  ctx: CanvasRenderingContext2D,
  pts: readonly Point2D[],
  timeSec: number,
  color: string,
  alpha = 1,
  width = 2.5,
): void {
  drawPolylinePath(ctx, pts, 1, color, alpha, width, {
    dash: [9, 11],
    march: -timeSec * 28,
  });
}

export function drawKineticMaskText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  timeSec: number,
  opts: {
    start?: number;
    stagger?: number;
    dur?: number;
    align?: CanvasTextAlign;
    alpha?: number;
  } = {},
): void {
  const { start = 0, stagger = 0.05, dur = 0.42, align = "left", alpha = 1 } = opts;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || alpha <= 0.01 || timeSec < start) return;

  ctx.save();
  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.fillStyle = color;

  const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
  const fontSize = sizeMatch ? Number(sizeMatch[1]) : 24;
  const clipH = Math.ceil(fontSize * 1.45);
  const spaceW = ctx.measureText(" ").width;
  const widths = words.map((w) => ctx.measureText(w).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, words.length - 1);

  let cursorX = align === "center" ? x - totalW / 2 : align === "right" ? x - totalW : x;
  ctx.textAlign = "left";

  for (let i = 0; i < words.length; i++) {
    const wp = easeOutExpo(seg(timeSec, start + i * stagger, start + i * stagger + dur));
    if (wp > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cursorX - 2, y - 2, widths[i] + 4, clipH);
      ctx.clip();
      ctx.globalAlpha = alpha * Math.min(1, wp * 1.4);
      ctx.fillText(words[i], cursorX, y + (1 - wp) * fontSize * 0.9);
      ctx.restore();
    }
    cursorX += widths[i] + spaceW;
  }
  ctx.restore();
}

export function drawWipeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  progress: number,
  align: CanvasTextAlign = "center",
  alpha = 1,
): void {
  const p = easeOutExpo(clamp01(progress));
  if (p <= 0.01 || alpha <= 0.01 || !text.trim()) return;
  ctx.save();
  ctx.font = font;
  const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
  const fontSize = sizeMatch ? Number(sizeMatch[1]) : 20;
  const w = ctx.measureText(text).width;
  const bx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.beginPath();
  ctx.rect(bx - 4, y - 2, (w + 10) * p, Math.ceil(fontSize * 1.45));
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawCountUp(
  ctx: CanvasRenderingContext2D,
  value: number,
  x: number,
  y: number,
  font: string,
  color: string,
  progress: number,
  opts: {
    prefix?: string;
    suffix?: string;
    decimals?: number;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    alpha?: number;
  } = {},
): void {
  const {
    prefix = "",
    suffix = "",
    decimals = 0,
    align = "center",
    baseline = "middle",
    alpha = 1,
  } = opts;
  const p = easeOutCubic(clamp01(progress));
  if (alpha <= 0.01) return;
  const current = value * p;
  const formatted =
    prefix +
    current.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) +
    suffix;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(formatted, x, y);
  ctx.restore();
}

export function drawChipLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  cx: number,
  cy: number,
  color: string,
  bgColor: string,
  alpha = 1,
  fontSize = 15,
  fontFamily = "Segoe UI, Inter, Arial, sans-serif",
): number {
  if (alpha <= 0.01 || !label.trim()) return 0;
  ctx.save();
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  const textW = ctx.measureText(label).width;
  const w = Math.min(340, textW + 26);
  const h = Math.max(28, fontSize + 13);
  ctx.globalAlpha = alpha;
  roundedRectPath(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 0.5, w - 18);
  ctx.restore();
  return w;
}

export function drawCallout(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  tx: number,
  ty: number,
  color: string,
  bgColor: string,
  progress: number,
  alpha = 1,
): void {
  const p = clamp01(progress);
  if (p <= 0.02 || alpha <= 0.01) return;
  drawPolylinePath(ctx, [[x, y], [tx, ty]], easeOutCubic(seg(p, 0, 0.6)), color, alpha * 0.85, 2, {
    arrow: true,
  });
  drawGlowRing(ctx, tx, ty, 8, color, alpha * seg(p, 0.5, 0.85), 2);
  drawChipLabel(ctx, label, x, y, color, bgColor, alpha * seg(p, 0.3, 0.75), 14);
}

export function drawHighlightRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  progress: number,
  alpha = 1,
): void {
  const p = clamp01(progress);
  if (p <= 0.02 || alpha <= 0.01) return;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const a = -Math.PI * 0.4 + (i / 40) * Math.PI * 2.06;
    const wob = 1 + 0.025 * Math.sin(a * 3 + 1);
    pts.push([x + Math.cos(a) * rx * wob, y + Math.sin(a) * ry * wob]);
  }
  drawPolylinePath(ctx, pts, easeInOutCubic(p), color, alpha, 2.8);
}

export function drawHighlightBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  progress: number,
  alpha = 1,
  r = 14,
): void {
  const p = clamp01(progress);
  if (p <= 0.02 || alpha <= 0.01) return;
  const rad = Math.min(r, w / 2, h / 2);
  const arcPts = (cx: number, cy: number, a0: number, a1: number): [number, number][] =>
    Array.from({ length: 6 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / 5;
      return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    });
  const pts: [number, number][] = [
    [x + rad, y],
    [x + w - rad, y],
    ...arcPts(x + w - rad, y + rad, -Math.PI / 2, 0),
    [x + w, y + h - rad],
    ...arcPts(x + w - rad, y + h - rad, 0, Math.PI / 2),
    [x + rad, y + h],
    ...arcPts(x + rad, y + h - rad, Math.PI / 2, Math.PI),
    [x, y + rad],
    ...arcPts(x + rad, y + rad, Math.PI, Math.PI * 1.5),
    [x + rad, y],
  ];
  drawPolylinePath(ctx, pts, easeInOutCubic(p), color, alpha, 2.6);
}

export function drawStickFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  color: string,
  pose: "idle" | "walk" | "point" | "cheer" | "sad" = "idle",
  timeSec = 0,
  alpha = 1,
): { head: [number, number]; hand: [number, number]; feet: [number, number] } | null {
  if (alpha <= 0.01 || h <= 0) return null;
  const lw = Math.max(2.2, h * 0.055);
  const r = h * 0.16;
  let hop = 0;
  let lean = 0;
  if (pose === "walk") hop = Math.abs(Math.sin(timeSec * 6.5)) * h * 0.025;
  if (pose === "cheer") hop = Math.abs(Math.sin(timeSec * 5)) * h * 0.06;
  if (pose === "sad") lean = h * 0.04;
  const yy = y - hop;
  const head: [number, number] = [x + lean, yy - h + r + (pose === "sad" ? h * 0.06 : 0)];
  const neck: [number, number] = [x + lean * 0.6, head[1] + r];
  const hip: [number, number] = [x, yy - h * 0.42];
  const sh: [number, number] = [x + lean * 0.4, neck[1] + h * 0.06];

  const strokes: [number, number][][] = [[neck, hip]];
  const swing = pose === "walk" ? Math.sin(timeSec * 6.5) : 0;
  if (pose === "walk") {
    strokes.push(
      [hip, [x + swing * h * 0.16, yy]],
      [hip, [x - swing * h * 0.16, yy]],
      [sh, [x - swing * h * 0.14, sh[1] + h * 0.22]],
      [sh, [x + swing * h * 0.14, sh[1] + h * 0.22]],
    );
  } else if (pose === "cheer") {
    strokes.push(
      [hip, [x - h * 0.12, yy]],
      [hip, [x + h * 0.12, yy]],
      [sh, [x - h * 0.22, sh[1] + h * 0.04], [x - h * 0.32, sh[1] - h * 0.28]],
      [sh, [x + h * 0.22, sh[1] + h * 0.04], [x + h * 0.32, sh[1] - h * 0.28]],
    );
  } else if (pose === "point") {
    strokes.push(
      [hip, [x - h * 0.1, yy]],
      [hip, [x + h * 0.1, yy]],
      [sh, [x - h * 0.12, sh[1] + h * 0.24]],
      [sh, [x + h * 0.28, sh[1] - h * 0.05]],
    );
  } else if (pose === "sad") {
    strokes.push(
      [hip, [x - h * 0.08, yy]],
      [hip, [x + h * 0.08, yy]],
      [sh, [x - h * 0.1, sh[1] + h * 0.28]],
      [sh, [x + h * 0.1, sh[1] + h * 0.28]],
    );
  } else {
    strokes.push(
      [hip, [x - h * 0.1, yy]],
      [hip, [x + h * 0.1, yy]],
      [sh, [x - h * 0.13, sh[1] + h * 0.24]],
      [sh, [x + h * 0.13, sh[1] + h * 0.24]],
    );
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.arc(head[0], head[1], r, 0, Math.PI * 2);
  ctx.stroke();
  for (const s of strokes) {
    drawPolylinePath(ctx, s, 1, color, alpha, lw);
  }
  ctx.restore();

  return {
    head,
    hand: pose === "point" ? [x + h * 0.28, sh[1] - h * 0.05] : [x + h * 0.13, sh[1] + h * 0.24],
    feet: [x, yy],
  };
}

export function drawLogoReveal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  ringColor: string,
  iconColor: string,
  timeSec: number,
  startSec = 0,
  iconName: VectorIconName = "sparkles",
): void {
  const dp = easeInOutCubic(seg(timeSec, startSec, startSec + 0.75));
  const gp = easeInOutCubic(seg(timeSec, startSec + 0.25, startSec + 1.0));
  if (dp <= 0.01) return;
  const settle = 1 + 0.04 * Math.sin(Math.PI * seg(timeSec, startSec + 1.0, startSec + 1.25));
  const breathe = timeSec > startSec + 1.25 ? 1 + 0.016 * Math.sin((timeSec - startSec) * 2.1) : 1;
  const sc = settle * breathe;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  drawGlowRing(ctx, 0, 0, r * 1.15, ringColor, dp * 0.35, 1.5);
  drawGlowArc(ctx, 0, 0, r, -Math.PI / 2, -Math.PI / 2 + dp * Math.PI * 2, ringColor, 0.95, 3);
  if (gp > 0.02) {
    drawVectorIcon(ctx, iconName, 0, 0, r * 1.05, iconColor, gp);
  }
  ctx.restore();
}

export interface BarChartItem {
  label: string;
  value: number;
  suffix?: string | null;
  accent?: string | null;
}

export function drawBarChart(
  ctx: CanvasRenderingContext2D,
  data: readonly BarChartItem[],
  box: { x: number; y: number; width: number; height: number },
  timeSec: number,
  startSec: number,
  palette: MotionPalette,
  fontFamily = "Segoe UI, Inter, Arial, sans-serif",
): void {
  if (data.length === 0) return;
  const maxVal = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const n = data.length;
  const padX = 24;
  const chartW = Math.max(120, box.width - padX * 2);
  const baseY = box.y + box.height - 34;
  const maxBarH = Math.max(60, box.height - 74);
  const slot = chartW / n;
  const barW = Math.min(72, slot * 0.56);
  const accents = [palette.accentPrimary, palette.accentSecondary, palette.accentWarm];

  ctx.save();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(box.x + padX, baseY);
  ctx.lineTo(box.x + padX + chartW, baseY);
  ctx.stroke();

  data.forEach((d, idx) => {
    const bp = easeOutCubic(seg(timeSec, startSec + idx * 0.1, startSec + idx * 0.1 + 0.55));
    const cx = box.x + padX + slot * (idx + 0.5);
    const barH = Math.max(4, (Math.abs(d.value) / maxVal) * maxBarH * bp);
    const col = d.accent || accents[idx % accents.length];

    if (bp > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, bp * 1.3);
      roundedRectPath(ctx, cx - barW / 2, baseY - barH, barW, barH, 6);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.25 + 0.55 * bp;
      ctx.fill();
      ctx.globalAlpha = Math.min(1, bp * 1.3);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();

      if (bp > 0.55) {
        const valText = `${Math.round(d.value * 10) / 10}${d.suffix ?? ""}`;
        ctx.save();
        ctx.globalAlpha = seg(bp, 0.55, 0.95);
        ctx.font = `700 16px ${fontFamily}`;
        ctx.fillStyle = col;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(valText, cx, baseY - barH - 6, slot - 6);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0.35, bp);
    ctx.font = `600 15px ${fontFamily}`;
    ctx.fillStyle = palette.textSecondary;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(d.label, cx, baseY + 8, slot - 8);
    ctx.restore();
  });
  ctx.restore();
}

export function drawDonutGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fraction: number,
  progress: number,
  color: string,
  trackColor: string,
  width = 12,
): void {
  const frac = clamp01(fraction);
  const p = easeOutCubic(clamp01(progress));
  drawGlowRing(ctx, cx, cy, r, trackColor, 0.45, width);
  if (p > 0.01 && frac > 0) {
    drawGlowArc(
      ctx,
      cx,
      cy,
      r,
      -Math.PI / 2,
      -Math.PI / 2 + frac * p * Math.PI * 2,
      color,
      0.95,
      width,
    );
  }
}
