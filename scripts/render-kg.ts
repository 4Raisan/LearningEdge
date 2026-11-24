import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs/promises";
import path from "node:path";
import {
  AI_KNOWLEDGE_DOMAIN,
  CPU_CACHE_DOMAIN,
} from "../frontend/lib/knowledge-graph/sampleData";
import {
  CATEGORY_STYLES,
  MASTERED_STYLE,
  type GraphDomain,
  type GraphEdge,
  type GraphNode,
} from "../frontend/lib/knowledge-graph/types";

const ARTIFACT_DIR = "C:/Users/ASUS/.gemini/antigravity-cli/brain/d3ed9855-c714-440f-9406-8bd0c9bec0a0";

async function renderFullAppUI(
  domain: GraphDomain,
  selectedNodeId: string,
  outputPath: string
) {
  const width = 1680;
  const height = 980;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // App Shell Background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // 1. TOPBAR
  const topbarH = 68;
  ctx.fillStyle = "#080c16";
  ctx.fillRect(0, 0, width, topbarH);
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, topbarH);
  ctx.lineTo(width, topbarH);
  ctx.stroke();

  // Logo & Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("LearningEdge", 24, 34);

  ctx.fillStyle = "#64748b";
  ctx.font = "12px 'Segoe UI', Inter, sans-serif";
  ctx.fillText(
    "Local-First Lecture Notes, Verified Storyboards & Intelligent Knowledge Graph",
    24,
    52
  );

  // Tabs
  const tabs = [
    { label: "Lecture to Video", active: false },
    { label: "Pipeline & Traceability", active: false },
    { label: "Konva Preview", active: false },
    { label: "Providers & Presets", active: false },
    { label: "Knowledge Graph & Dreaming", active: true },
  ];

  let tabX = width - 24;
  for (let i = tabs.length - 1; i >= 0; i--) {
    const t = tabs[i];
    ctx.font = t.active ? "bold 13px 'Segoe UI', Inter, sans-serif" : "13px 'Segoe UI', Inter, sans-serif";
    const textW = ctx.measureText(t.label).width;
    const btnW = textW + 24;
    const btnH = 34;
    tabX -= btnW;

    if (t.active) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(tabX, 17, btnW, btnH, 8);
      ctx.fill();

      ctx.fillStyle = "#000000";
      ctx.fillText(t.label, tabX + 12, 38);
    } else {
      ctx.fillStyle = "#0d1322";
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath();
      ctx.roundRect(tabX, 17, btnW, btnH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.fillText(t.label, tabX + 12, 38);
    }
    tabX -= 8;
  }

  // 2. TOOLBAR
  const toolbarY = topbarH + 14;
  const toolbarH = 46;
  const contentPad = 24;
  const contentW = width - contentPad * 2;

  ctx.fillStyle = "#0a0f1d";
  ctx.strokeStyle = "#1e293b";
  ctx.beginPath();
  ctx.roundRect(contentPad, toolbarY, contentW, toolbarH, 10);
  ctx.fill();
  ctx.stroke();

  // Search box inside toolbar
  const searchBoxW = 340;
  ctx.fillStyle = "#111827";
  ctx.strokeStyle = "#334155";
  ctx.beginPath();
  ctx.roundRect(contentPad + 10, toolbarY + 7, searchBoxW, 32, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.font = "12px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("🔍 Search concepts, mechanisms, applications...", contentPad + 22, toolbarY + 28);

  // Layout mode buttons
  const layoutBtns = ["✦ Force Layout", "Tree Flow", "Radial Orbit"];
  let layX = contentPad + searchBoxW + 24;
  for (let i = 0; i < layoutBtns.length; i++) {
    const isAct = i === 0;
    const lText = layoutBtns[i];
    ctx.font = "12px 'Segoe UI', Inter, sans-serif";
    const lW = ctx.measureText(lText).width + 18;
    if (isAct) {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.roundRect(layX, toolbarY + 8, lW, 30, 6);
      ctx.fill();
      ctx.fillStyle = "#082f49";
      ctx.font = "bold 12px 'Segoe UI', Inter, sans-serif";
      ctx.fillText(lText, layX + 9, toolbarY + 27);
    } else {
      ctx.fillStyle = "#111827";
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath();
      ctx.roundRect(layX, toolbarY + 8, lW, 30, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(lText, layX + 9, toolbarY + 27);
    }
    layX += lW + 6;
  }

  // Physics indicator
  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(layX + 10, toolbarY + 23, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("Live Physics Stabilized", layX + 20, toolbarY + 27);

  // Zoom controls on right
  const zoomControls = ["-", "+", "Fit View", "1:1"];
  let zX = contentPad + contentW - 10;
  for (let i = zoomControls.length - 1; i >= 0; i--) {
    const zt = zoomControls[i];
    ctx.font = "12px 'Segoe UI', Inter, sans-serif";
    const zw = ctx.measureText(zt).width + 16;
    zX -= zw;
    ctx.fillStyle = "#111827";
    ctx.strokeStyle = "#1e293b";
    ctx.beginPath();
    ctx.roundRect(zX, toolbarY + 8, zw, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(zt, zX + 8, toolbarY + 27);
    zX -= 6;
  }

  // 3. MAIN 3-SECTION AREA
  const mainY = toolbarY + toolbarH + 12;
  const mainH = height - mainY - 24;
  const leftW = 310;
  const rightW = 340;
  const centerW = contentW - leftW - rightW - 24;
  const leftX = contentPad;
  const centerX = leftX + leftW + 12;
  const rightX = centerX + centerW + 12;

  // Render LEFT SIDEBAR
  renderLeftSidebar(ctx, domain, leftX, mainY, leftW, mainH);

  // Render CENTER CANVAS
  renderCenterCanvas(
    ctx,
    domain,
    selectedNodeId,
    centerX,
    mainY,
    centerW,
    mainH
  );

  // Render RIGHT SIDEBAR
  renderRightSidebar(ctx, domain, selectedNodeId, rightX, mainY, rightW, mainH);

  const buffer = canvas.toBuffer("image/png");
  await fs.writeFile(outputPath, buffer);
  console.log(`Saved screenshot to ${outputPath}`);
}

function renderLeftSidebar(
  ctx: any,
  domain: GraphDomain,
  x: number,
  y: number,
  w: number,
  h: number
) {
  ctx.fillStyle = "#0a0f1d";
  ctx.strokeStyle = "#1e293b";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();

  let curY = y + 20;
  const pad = 16;

  // Domain header
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 11px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("KNOWLEDGE DOMAIN", x + pad, curY);
  curY += 12;

  // Domain cards
  const domains = [
    { id: "domain-ai", name: "Artificial Intelligence & Neural Systems", active: domain.id === "domain-ai" },
    { id: "domain-cpu", name: "CPU Caching & Memory Architecture", active: domain.id === "domain-cpu" },
    { id: "domain-personal", name: "Personal Lecture Graph (SQLite)", active: false },
  ];

  for (const d of domains) {
    curY += 8;
    ctx.fillStyle = d.active ? "#13233a" : "#111827";
    ctx.strokeStyle = d.active ? "#38bdf8" : "#1f2937";
    ctx.beginPath();
    ctx.roundRect(x + pad, curY, w - pad * 2, 44, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = d.active ? "#38bdf8" : "#64748b";
    ctx.font = "14px 'Segoe UI', Inter, sans-serif";
    ctx.fillText("✦", x + pad + 10, curY + 24);

    ctx.fillStyle = d.active ? "#ffffff" : "#cbd5e1";
    ctx.font = d.active ? "bold 12px 'Segoe UI', Inter, sans-serif" : "12px 'Segoe UI', Inter, sans-serif";
    ctx.fillText(d.name, x + pad + 28, curY + 24);
    curY += 46;
  }

  // Mastery Progress Box
  curY += 14;
  ctx.fillStyle = "#111827";
  ctx.strokeStyle = "#1f2937";
  ctx.beginPath();
  ctx.roundRect(x + pad, curY, w - pad * 2, 88, 10);
  ctx.fill();
  ctx.stroke();

  const masteredCount = domain.nodes.filter((n) => n.mastered).length;
  const pct = Math.round((masteredCount / domain.nodes.length) * 100);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 11px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("MASTERY PROGRESS", x + pad + 12, curY + 22);

  ctx.fillStyle = "#10b981";
  ctx.font = "bold 12px 'Segoe UI', Inter, sans-serif";
  ctx.fillText(`${masteredCount}/${domain.nodes.length} (${pct}%)`, x + w - pad - 80, curY + 22);

  // Progress bar
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.roundRect(x + pad + 12, curY + 32, w - pad * 2 - 24, 7, 4);
  ctx.fill();

  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.roundRect(x + pad + 12, curY + 32, (w - pad * 2 - 24) * (pct / 100), 7, 4);
  ctx.fill();

  // Filter pills
  const pills = ["All", `Mastered (${masteredCount})`, "Learning"];
  let pX = x + pad + 12;
  for (let i = 0; i < pills.length; i++) {
    const pill = pills[i];
    ctx.font = "10px 'Segoe UI', Inter, sans-serif";
    const pw = ctx.measureText(pill).width + 14;
    ctx.fillStyle = i === 0 ? "#ffffff" : "#1f2937";
    ctx.beginPath();
    ctx.roundRect(pX, curY + 50, pw, 22, 5);
    ctx.fill();
    ctx.fillStyle = i === 0 ? "#000000" : "#94a3b8";
    ctx.fillText(pill, pX + 7, curY + 65);
    pX += pw + 6;
  }
  curY += 92;

  // Categories Header
  curY += 16;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 11px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("CATEGORIES & TYPES", x + pad, curY);
  curY += 12;

  const cats = Object.entries(CATEGORY_STYLES);
  for (const [key, cStyle] of cats) {
    const count = domain.nodes.filter((n) => n.category === key).length;
    curY += 4;
    ctx.fillStyle = cStyle.color;
    ctx.beginPath();
    ctx.arc(x + pad + 8, curY + 10, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "12px 'Segoe UI', Inter, sans-serif";
    ctx.fillText(cStyle.name, x + pad + 20, curY + 14);

    ctx.fillStyle = "#64748b";
    ctx.font = "11px 'Segoe UI', Inter, sans-serif";
    ctx.fillText(String(count), x + w - pad - 20, curY + 14);

    curY += 20;
  }

  // Dreaming section
  curY += 16;
  ctx.fillStyle = "#111827";
  ctx.strokeStyle = "#1f2937";
  ctx.beginPath();
  ctx.roundRect(x + pad, curY, w - pad * 2, 70, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fbbf24";
  ctx.font = "13px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("✨", x + pad + 10, curY + 24);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("Dreaming & Synthesis", x + pad + 28, curY + 24);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 11px 'Segoe UI', Inter, sans-serif";
  ctx.beginPath();
  ctx.roundRect(x + pad + 10, curY + 36, w - pad * 2 - 20, 24, 6);
  ctx.fill();

  ctx.fillStyle = "#082f49";
  ctx.fillText("⚡ Run Autonomous Dreaming", x + pad + 24, curY + 52);
}

function renderCenterCanvas(
  ctx: any,
  domain: GraphDomain,
  selectedNodeId: string,
  x: number,
  y: number,
  w: number,
  h: number
) {
  // Center background
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = "#070b14";
  ctx.fillRect(x, y, w, h);

  // Subtle grid
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  const gridSize = 40;
  ctx.beginPath();
  for (let gx = x; gx < x + w; gx += gridSize) {
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
  }
  for (let gy = y; gy < y + h; gy += gridSize) {
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
  }
  ctx.stroke();

  // Grid point accents
  ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
  for (let gx = x; gx < x + w; gx += gridSize * 2) {
    for (let gy = y; gy < y + h; gy += gridSize * 2) {
      ctx.fillRect(gx - 1, gy - 1, 2, 2);
    }
  }

  // Node position mapping (world to screen centered in canvas)
  const cx = x + w / 2;
  const cy = y + h / 2;
  const scale = 1.05;

  const nodeMap = new Map<string, { x: number; y: number; node: GraphNode }>();
  for (const n of domain.nodes) {
    nodeMap.set(n.id, {
      x: cx + n.x * scale,
      y: cy + n.y * scale,
      node: n,
    });
  }

  // Connected nodes & edges to selected node
  const connectedNodes = new Set<string>();
  const connectedEdges = new Set<string>();
  connectedNodes.add(selectedNodeId);

  for (const e of domain.edges) {
    if (e.source === selectedNodeId || e.target === selectedNodeId) {
      connectedNodes.add(e.source);
      connectedNodes.add(e.target);
      connectedEdges.add(e.id);
    }
  }

  // 1. Draw Edges
  for (const edge of domain.edges) {
    const sPos = nodeMap.get(edge.source);
    const tPos = nodeMap.get(edge.target);
    if (!sPos || !tPos) continue;

    const isConn = connectedEdges.has(edge.id);
    const dx = tPos.x - sPos.x;
    const dy = tPos.y - sPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 10) continue;

    const ux = dx / dist;
    const uy = dy / dist;

    const sRad = sPos.node.radius;
    const tRad = tPos.node.radius;

    const sx = sPos.x + ux * sRad;
    const sy = sPos.y + uy * sRad;
    const tx = tPos.x - ux * tRad;
    const ty = tPos.y - uy * tRad;

    ctx.save();
    if (isConn) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#00f0ff";
      ctx.shadowBlur = 10;
    } else {
      ctx.strokeStyle = "rgba(100, 116, 139, 0.35)";
      ctx.lineWidth = 1.2;
    }

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Arrow
    const arrowSize = 6;
    ctx.fillStyle = isConn ? "#38bdf8" : "rgba(100, 116, 139, 0.4)";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - arrowSize * ux - 3 * -uy, ty - arrowSize * uy - 3 * ux);
    ctx.lineTo(tx - arrowSize * ux + 3 * -uy, ty - arrowSize * uy + 3 * ux);
    ctx.closePath();
    ctx.fill();

    // Pulse dot on connected edge
    if (isConn) {
      const px = sx + (tx - sx) * 0.55;
      const py = sy + (ty - sy) * 0.55;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Label
      if (edge.label) {
        ctx.font = "bold 10px 'Segoe UI', Inter, sans-serif";
        const lw = ctx.measureText(edge.label).width;
        ctx.fillStyle = "rgba(7, 11, 20, 0.9)";
        ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(px - lw / 2 - 4, py - 16, lw + 8, 16, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e0f2fe";
        ctx.fillText(edge.label, px - lw / 2, py - 4);
      }
    }

    ctx.restore();
  }

  // 2. Draw Nodes
  for (const n of domain.nodes) {
    const pos = nodeMap.get(n.id);
    if (!pos) continue;

    const isSel = n.id === selectedNodeId;
    const isConn = connectedNodes.has(n.id);
    const style = n.mastered ? MASTERED_STYLE : (CATEGORY_STYLES[n.category] ?? CATEGORY_STYLES.main);
    const rad = n.radius;

    ctx.save();

    // Outer glow
    const glowRad = rad * (isSel ? 2.2 : isConn ? 1.6 : 1.3);
    const glowGrad = ctx.createRadialGradient(pos.x, pos.y, rad * 0.6, pos.x, pos.y, glowRad);
    glowGrad.addColorStop(0, style.glowColor);
    glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, glowRad, 0, Math.PI * 2);
    ctx.fill();

    // Selection outer pulsing ring
    if (isSel) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rad + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Node body gradient
    const bodyGrad = ctx.createRadialGradient(pos.x - rad * 0.3, pos.y - rad * 0.3, rad * 0.1, pos.x, pos.y, rad);
    bodyGrad.addColorStop(0, style.bgGradient[0]);
    bodyGrad.addColorStop(1, style.bgGradient[1]);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = isSel ? "#ffffff" : style.borderColor;
    ctx.lineWidth = isSel ? 3 : 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Core center dot
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Mastered check badge
    if (n.mastered) {
      const bx = pos.x + rad * 0.7;
      const by = pos.y - rad * 0.7;
      ctx.fillStyle = "#10b981";
      ctx.strokeStyle = "#070b14";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx - 2.5, by);
      ctx.lineTo(bx - 0.5, by + 2);
      ctx.lineTo(bx + 3, by - 2);
      ctx.stroke();
    }

    // Node text label
    ctx.font = `${n.importance >= 4 || n.category === "central" ? "bold " : ""}11px 'Segoe UI', Inter, sans-serif`;
    const tw = ctx.measureText(n.label).width;
    const labelY = pos.y + rad + 6;

    ctx.fillStyle = "rgba(7, 11, 20, 0.88)";
    ctx.beginPath();
    ctx.roundRect(pos.x - tw / 2 - 4, labelY - 2, tw + 8, 15, 3);
    ctx.fill();

    ctx.fillStyle = isSel ? "#ffffff" : style.color;
    ctx.fillText(n.label, pos.x - tw / 2, labelY + 10);

    ctx.restore();
  }

  // Radar Minimap in bottom right
  const mw = 150;
  const mh = 100;
  const mx = x + w - mw - 16;
  const my = y + h - mh - 16;

  ctx.fillStyle = "rgba(10, 15, 29, 0.9)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.font = "bold 9px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("GRAPH RADAR", mx + 10, my + 14);

  // Mini dots
  for (const n of domain.nodes) {
    const miniX = mx + mw / 2 + (n.x / 480) * 50;
    const miniY = my + mh / 2 + (n.y / 380) * 35;
    const style = n.mastered ? MASTERED_STYLE : (CATEGORY_STYLES[n.category] ?? CATEGORY_STYLES.main);
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(miniX, miniY, n.category === "central" ? 3 : 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function renderRightSidebar(
  ctx: any,
  domain: GraphDomain,
  selectedNodeId: string,
  x: number,
  y: number,
  w: number,
  h: number
) {
  ctx.fillStyle = "#0a0f1d";
  ctx.strokeStyle = "#1e293b";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();

  const node = domain.nodes.find((n) => n.id === selectedNodeId) ?? domain.nodes[0];
  if (!node) return;

  const style = node.mastered ? MASTERED_STYLE : (CATEGORY_STYLES[node.category] ?? CATEGORY_STYLES.main);
  let curY = y + 20;
  const pad = 18;

  // Category badge
  ctx.fillStyle = style.badgeBg;
  ctx.strokeStyle = style.borderColor;
  ctx.beginPath();
  ctx.roundRect(x + pad, curY, 110, 22, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = style.badgeText;
  ctx.font = "bold 10px 'Segoe UI', Inter, sans-serif";
  ctx.fillText(style.name.toUpperCase(), x + pad + 10, curY + 15);

  // Importance stars
  let starX = x + w - pad - 60;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < node.importance ? "#fbbf24" : "#334155";
    ctx.font = "12px 'Segoe UI', Inter, sans-serif";
    ctx.fillText("★", starX + i * 11, curY + 15);
  }

  // Node Title
  curY += 34;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px 'Segoe UI', Inter, sans-serif";
  ctx.fillText(node.label, x + pad, curY);

  // Mastery button
  curY += 14;
  ctx.fillStyle = node.mastered ? "rgba(16, 185, 129, 0.15)" : "#111827";
  ctx.strokeStyle = node.mastered ? "#10b981" : "#334155";
  ctx.beginPath();
  ctx.roundRect(x + pad, curY, w - pad * 2, 32, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = node.mastered ? "#34d399" : "#94a3b8";
  ctx.font = "bold 11px 'Segoe UI', Inter, sans-serif";
  ctx.fillText(node.mastered ? "✓ Mastered Concept" : "○ Mark as Mastered", x + pad + 16, curY + 20);

  // Core Overview
  curY += 46;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 11px 'Segoe UI', Inter, sans-serif";
  ctx.fillText("CORE OVERVIEW", x + pad, curY);

  curY += 16;
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "12px 'Segoe UI', Inter, sans-serif";
  wrapAndFillText(ctx, node.summary, x + pad, curY, w - pad * 2, 18);

  // Description
  curY += 56;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px 'Segoe UI', Inter, sans-serif";
  wrapAndFillText(ctx, node.description, x + pad, curY, w - pad * 2, 17);

  // Tags
  if (node.tags && node.tags.length > 0) {
    curY += 54;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 11px 'Segoe UI', Inter, sans-serif";
    ctx.fillText("CONCEPT TAGS", x + pad, curY);
    curY += 14;
    let tx = x + pad;
    for (const tag of node.tags) {
      ctx.font = "10px 'Segoe UI', Inter, sans-serif";
      const tw = ctx.measureText(`#${tag}`).width + 12;
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.roundRect(tx, curY, tw, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`#${tag}`, tx + 6, curY + 14);
      tx += tw + 6;
    }
  }

  // Applications
  if (node.applications && node.applications.length > 0) {
    curY += 34;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 11px 'Segoe UI', Inter, sans-serif";
    ctx.fillText("REAL-WORLD APPLICATIONS", x + pad, curY);
    curY += 14;
    for (const app of node.applications) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "11px 'Segoe UI', Inter, sans-serif";
      ctx.fillText(`• ${app}`, x + pad + 6, curY);
      curY += 16;
    }
  }

  // Traceability Box
  if (node.sourceRefs && node.sourceRefs.length > 0) {
    curY += 14;
    ctx.fillStyle = "#111827";
    ctx.strokeStyle = "#1f2937";
    ctx.beginPath();
    ctx.roundRect(x + pad, curY, w - pad * 2, 84, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 10px 'Segoe UI', Inter, sans-serif";
    ctx.fillText("LECTURE TRACEABILITY", x + pad + 10, curY + 16);

    ctx.fillStyle = "#64748b";
    ctx.font = "11px 'Segoe UI', Inter, sans-serif";
    ctx.fillText("Sources:", x + pad + 10, curY + 32);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(node.sourceRefs.join(", "), x + pad + 65, curY + 32);

    if (node.videoStartMs !== undefined && node.videoEndMs !== undefined) {
      ctx.fillStyle = "#64748b";
      ctx.fillText("Video:", x + pad + 10, curY + 48);
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`00:${Math.floor(node.videoStartMs / 1000).toString().padStart(2, "0")} – 00:${Math.floor(node.videoEndMs / 1000).toString().padStart(2, "0")}`, x + pad + 65, curY + 48);

      ctx.fillStyle = "#0284c7";
      ctx.beginPath();
      ctx.roundRect(x + pad + 10, curY + 58, w - pad * 2 - 20, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px 'Segoe UI', Inter, sans-serif";
      ctx.fillText("▶ Play Segment in Portal", x + pad + 30, curY + 72);
    }
  }
}

function wrapAndFillText(ctx: any, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const w of words) {
    const testLine = line + w + " ";
    const testW = ctx.measureText(testLine).width;
    if (testW > maxW && line !== "") {
      ctx.fillText(line, x, curY);
      line = w + " ";
      curY += lineH;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, curY);
}

async function main() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });

  const aiOutput = path.join(ARTIFACT_DIR, "ai-knowledge-graph.png");
  await renderFullAppUI(AI_KNOWLEDGE_DOMAIN, "ai-dl", aiOutput);

  const cpuOutput = path.join(ARTIFACT_DIR, "cpu-caching-knowledge-graph.png");
  await renderFullAppUI(CPU_CACHE_DOMAIN, "cpu-mem-wall", cpuOutput);

  console.log("Completed generating visual knowledge graph renders.");
}

main().catch(console.error);
