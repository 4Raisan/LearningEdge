<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    CATEGORY_STYLES,
    MASTERED_STYLE,
    type GraphEdge,
    type GraphNode,
    type LayoutMode,
  } from "./types";
  import {
    DEFAULT_SIM_PARAMS,
    getGraphBounds,
    stepPhysics,
  } from "./physics";

  let {
    nodes = $bindable<GraphNode[]>([]),
    edges = $bindable<GraphEdge[]>([]),
    selectedNodeId = $bindable<string | null>(null),
    hoveredNodeId = $bindable<string | null>(null),
    layoutMode = "force" as LayoutMode,
    isSimulating = true,
    onSelectNode,
    onDeselect,
  }: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    selectedNodeId: string | null;
    hoveredNodeId: string | null;
    layoutMode?: LayoutMode;
    isSimulating?: boolean;
    onSelectNode?: (node: GraphNode) => void;
    onDeselect?: () => void;
  } = $props();

  let canvasContainer: HTMLDivElement | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);
  let minimapCanvas: HTMLCanvasElement | null = $state(null);

  // Camera state
  let cameraX = $state(0);
  let cameraY = $state(0);
  let cameraZoom = $state(1.0);

  // Target camera for smooth animations
  let targetCameraX = 0;
  let targetCameraY = 0;
  let targetCameraZoom = 1.0;
  let isCameraAnimating = false;

  // Interaction state
  let isDraggingCanvas = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let draggedNode: GraphNode | null = null;
  let hasDraggedMoved = false;

  // Animation frame id & timer
  let animFrameId: number | null = null;
  let animTime = 0;

  // Highlighted set derived from selected or hovered node
  let activeFocusId = $derived(hoveredNodeId ?? selectedNodeId);
  let connectedNodeIds = $derived.by(() => {
    if (!activeFocusId) return new Set<string>();
    const set = new Set<string>();
    set.add(activeFocusId);
    for (const e of edges) {
      if (e.source === activeFocusId) set.add(e.target);
      if (e.target === activeFocusId) set.add(e.source);
    }
    return set;
  });

  let connectedEdgeIds = $derived.by(() => {
    if (!activeFocusId) return new Set<string>();
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source === activeFocusId || e.target === activeFocusId) {
        set.add(e.id);
      }
    }
    return set;
  });

  // World to Screen coordinates
  function worldToScreen(wx: number, wy: number, width: number, height: number) {
    return {
      x: width / 2 + (wx - cameraX) * cameraZoom,
      y: height / 2 + (wy - cameraY) * cameraZoom,
    };
  }

  // Screen to World coordinates
  function screenToWorld(sx: number, sy: number, width: number, height: number) {
    return {
      x: cameraX + (sx - width / 2) / cameraZoom,
      y: cameraY + (sy - height / 2) / cameraZoom,
    };
  }

  // Find node under screen position
  function findNodeAt(sx: number, sy: number, width: number, height: number): GraphNode | null {
    const { x: wx, y: wy } = screenToWorld(sx, sy, width, height);
    // Search in reverse so top-drawn nodes match first
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.hidden) continue;
      const dx = wx - n.x;
      const dy = wy - n.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= n.radius + 6 / cameraZoom) {
        return n;
      }
    }
    return null;
  }

  // Smooth camera controls
  export function focusOnNode(nodeId: string, zoom: number = 1.35) {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;
    targetCameraX = target.x;
    targetCameraY = target.y;
    targetCameraZoom = zoom;
    isCameraAnimating = true;
  }

  export function fitToView() {
    if (!canvas) return;
    const bounds = getGraphBounds(nodes);
    const padding = 120;
    const availWidth = Math.max(300, canvas.clientWidth - padding * 2);
    const availHeight = Math.max(300, canvas.clientHeight - padding * 2);

    const zoomX = availWidth / Math.max(200, bounds.width);
    const zoomY = availHeight / Math.max(200, bounds.height);
    const fitZoom = Math.min(1.8, Math.max(0.3, Math.min(zoomX, zoomY)));

    targetCameraX = bounds.centerX;
    targetCameraY = bounds.centerY;
    targetCameraZoom = fitZoom;
    isCameraAnimating = true;
  }

  export function resetView() {
    targetCameraX = 0;
    targetCameraY = 0;
    targetCameraZoom = 1.0;
    isCameraAnimating = true;
  }

  export function zoomIn() {
    targetCameraZoom = Math.min(3.0, cameraZoom * 1.3);
    targetCameraX = cameraX;
    targetCameraY = cameraY;
    isCameraAnimating = true;
  }

  export function zoomOut() {
    targetCameraZoom = Math.max(0.25, cameraZoom / 1.3);
    targetCameraX = cameraX;
    targetCameraY = cameraY;
    isCameraAnimating = true;
  }

  // Mouse event handlers
  function handleMouseDown(e: MouseEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const hit = findNodeAt(sx, sy, canvas.clientWidth, canvas.clientHeight);
    if (hit) {
      draggedNode = hit;
      draggedNode.fixed = true;
      hasDraggedMoved = false;
    } else {
      isDraggingCanvas = true;
      dragStartX = sx;
      dragStartY = sy;
      hasDraggedMoved = false;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (draggedNode) {
      hasDraggedMoved = true;
      const worldPos = screenToWorld(sx, sy, width, height);
      draggedNode.x = worldPos.x;
      draggedNode.y = worldPos.y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
      return;
    }

    if (isDraggingCanvas) {
      hasDraggedMoved = true;
      const dx = (sx - dragStartX) / cameraZoom;
      const dy = (sy - dragStartY) / cameraZoom;
      cameraX -= dx;
      cameraY -= dy;
      targetCameraX = cameraX;
      targetCameraY = cameraY;
      dragStartX = sx;
      dragStartY = sy;
      return;
    }

    // Hover state
    const hit = findNodeAt(sx, sy, width, height);
    if (hit) {
      canvas.style.cursor = "pointer";
      hoveredNodeId = hit.id;
    } else {
      canvas.style.cursor = isDraggingCanvas ? "grabbing" : "default";
      hoveredNodeId = null;
    }
  }

  function handleMouseUp(e: MouseEvent) {
    if (!canvas) return;
    if (draggedNode) {
      if (!hasDraggedMoved) {
        // Normal click on node
        selectedNodeId = draggedNode.id;
        onSelectNode?.(draggedNode);
      }
      // Unfix after drag so physics can settle gently unless it's central
      if (draggedNode.category !== "central") {
        draggedNode.fixed = false;
      }
      draggedNode = null;
    } else if (isDraggingCanvas) {
      if (!hasDraggedMoved) {
        // Click on background deselects
        selectedNodeId = null;
        onDeselect?.();
      }
      isDraggingCanvas = false;
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    const mouseWorldBefore = screenToWorld(sx, sy, width, height);
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.min(3.5, Math.max(0.2, cameraZoom * zoomFactor));

    cameraZoom = newZoom;
    targetCameraZoom = newZoom;

    // Keep mouse pointer centered on the same world coordinates
    cameraX = mouseWorldBefore.x - (sx - width / 2) / cameraZoom;
    cameraY = mouseWorldBefore.y - (sy - height / 2) / cameraZoom;
    targetCameraX = cameraX;
    targetCameraY = cameraY;
  }

  function handleDblClick(e: MouseEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = findNodeAt(sx, sy, canvas.clientWidth, canvas.clientHeight);
    if (hit) {
      focusOnNode(hit.id, 1.4);
    } else {
      fitToView();
    }
  }

  // Draw loop
  function renderFrame() {
    animTime += 0.02;

    // Smooth camera transition
    if (isCameraAnimating) {
      const lerpFactor = 0.14;
      cameraX += (targetCameraX - cameraX) * lerpFactor;
      cameraY += (targetCameraY - cameraY) * lerpFactor;
      cameraZoom += (targetCameraZoom - cameraZoom) * lerpFactor;

      if (
        Math.abs(targetCameraX - cameraX) < 0.5 &&
        Math.abs(targetCameraY - cameraY) < 0.5 &&
        Math.abs(targetCameraZoom - cameraZoom) < 0.005
      ) {
        cameraX = targetCameraX;
        cameraY = targetCameraY;
        cameraZoom = targetCameraZoom;
        isCameraAnimating = false;
      }
    }

    // Step physics if simulation active
    if (isSimulating && layoutMode === "force") {
      stepPhysics(nodes, edges, 0, 0, DEFAULT_SIM_PARAMS);
    }

    drawMainCanvas();
    drawMinimap();

    animFrameId = requestAnimationFrame(renderFrame);
  }

  function drawMainCanvas() {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const clientW = canvas.clientWidth;
    const clientH = canvas.clientHeight;

    // Clear background
    ctx.save();
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, width, height);

    // Subtle background grid
    drawBackgroundGrid(ctx, clientW, clientH);

    // Build quick node lookup map
    const nodeMap = new Map<string, GraphNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    // 1. Draw Edges
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target || source.hidden || target.hidden) continue;

      const isConnected = connectedEdgeIds.has(edge.id);
      const isDimmed = activeFocusId !== null && !isConnected;

      drawEdge(ctx, edge, source, target, clientW, clientH, isConnected, isDimmed);
    }

    // 2. Draw Nodes
    for (const node of nodes) {
      if (node.hidden) continue;

      const isSelected = selectedNodeId === node.id;
      const isHovered = hoveredNodeId === node.id;
      const isConnected = connectedNodeIds.has(node.id);
      const isDimmed = activeFocusId !== null && !isConnected && !isSelected;

      drawNode(ctx, node, clientW, clientH, isSelected, isHovered, isConnected, isDimmed);
    }

    ctx.restore();
  }

  function drawBackgroundGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gridSize = 60 * cameraZoom;
    if (gridSize < 14) return; // Too small, don't draw

    const startX = ((width / 2 - cameraX * cameraZoom) % gridSize + gridSize) % gridSize;
    const startY = ((height / 2 - cameraY * cameraZoom) % gridSize + gridSize) % gridSize;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = startX; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = startY; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Dot accents at intersections
    ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
    for (let x = startX; x < width; x += gridSize * 2) {
      for (let y = startY; y < height; y += gridSize * 2) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    ctx.restore();
  }

  function drawEdge(
    ctx: CanvasRenderingContext2D,
    edge: GraphEdge,
    source: GraphNode,
    target: GraphNode,
    width: number,
    height: number,
    isConnected: boolean,
    isDimmed: boolean
  ) {
    const sPos = worldToScreen(source.x, source.y, width, height);
    const tPos = worldToScreen(target.x, target.y, width, height);

    const dx = tPos.x - sPos.x;
    const dy = tPos.y - sPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) return;

    const unitX = dx / dist;
    const unitY = dy / dist;

    // Edge endpoints trimmed at node borders
    const sRadiusScreen = source.radius * cameraZoom;
    const tRadiusScreen = target.radius * cameraZoom;

    const startX = sPos.x + unitX * sRadiusScreen;
    const startY = sPos.y + unitY * sRadiusScreen;
    const endX = tPos.x - unitX * tRadiusScreen;
    const endY = tPos.y - unitY * tRadiusScreen;

    ctx.save();

    let strokeColor = "rgba(100, 116, 139, 0.35)";
    let lineWidth = Math.max(1, 1.2 * cameraZoom);

    if (isConnected) {
      strokeColor = "#38bdf8";
      lineWidth = Math.max(2, 2.5 * cameraZoom);
      ctx.shadowColor = "#00f0ff";
      ctx.shadowBlur = 8 * cameraZoom;
    } else if (isDimmed) {
      strokeColor = "rgba(51, 65, 85, 0.12)";
      lineWidth = 0.8;
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Directional arrow head
    if (cameraZoom > 0.4 && !isDimmed) {
      const arrowSize = Math.max(5, 7 * cameraZoom);
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * unitX - (arrowSize * 0.5) * -unitY,
        endY - arrowSize * unitY - (arrowSize * 0.5) * unitX
      );
      ctx.lineTo(
        endX - arrowSize * unitX + (arrowSize * 0.5) * -unitY,
        endY - arrowSize * unitY + (arrowSize * 0.5) * unitX
      );
      ctx.closePath();
      ctx.fill();
    }

    // Animated energy pulses along connected edges
    if (isConnected) {
      const speed = 0.5;
      const pulseT = ((animTime * speed) % 1 + 1) % 1;
      const px = startX + (endX - startX) * pulseT;
      const py = startY + (endY - startY) * pulseT;

      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2.5, 3.5 * cameraZoom), 0, Math.PI * 2);
      ctx.fill();
    }

    // Edge relationship label (when zoomed in or connected)
    if (edge.label && (cameraZoom > 0.95 || (isConnected && cameraZoom > 0.65)) && !isDimmed) {
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const fontSize = Math.max(9, Math.min(12, 10 * cameraZoom));

      ctx.font = `600 ${fontSize}px Inter, Segoe UI, sans-serif`;
      const textWidth = ctx.measureText(edge.label).width;

      ctx.fillStyle = "rgba(7, 11, 20, 0.85)";
      ctx.strokeStyle = isConnected ? "rgba(56, 189, 248, 0.6)" : "rgba(100, 116, 139, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(midX - textWidth / 2 - 5, midY - fontSize / 2 - 3, textWidth + 10, fontSize + 6, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isConnected ? "#e0f2fe" : "#94a3b8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(edge.label, midX, midY);
    }

    ctx.restore();
  }

  function drawNode(
    ctx: CanvasRenderingContext2D,
    node: GraphNode,
    width: number,
    height: number,
    isSelected: boolean,
    isHovered: boolean,
    isConnected: boolean,
    isDimmed: boolean
  ) {
    const pos = worldToScreen(node.x, node.y, width, height);
    const radius = node.radius * cameraZoom;

    // Viewport culling
    if (
      pos.x + radius + 100 < 0 ||
      pos.x - radius - 100 > width ||
      pos.y + radius + 100 < 0 ||
      pos.y - radius - 100 > height
    ) {
      return;
    }

    const style = node.mastered ? MASTERED_STYLE : (CATEGORY_STYLES[node.category] ?? CATEGORY_STYLES.main);

    ctx.save();
    ctx.globalAlpha = isDimmed ? 0.2 : 1.0;

    // 1. Outer Neon Glow
    if (!isDimmed) {
      const glowMultiplier = isSelected ? 2.2 : isHovered ? 1.6 : 1.0;
      const glowRadius = radius * (1.3 + (isSelected ? 0.3 * Math.sin(animTime * 3) : 0));

      const glowGrad = ctx.createRadialGradient(pos.x, pos.y, radius * 0.7, pos.x, pos.y, glowRadius * glowMultiplier);
      glowGrad.addColorStop(0, style.glowColor);
      glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, glowRadius * glowMultiplier, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Selection Ring
    if (isSelected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, 2.5 * cameraZoom);
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 14 * cameraZoom;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 5 * cameraZoom + Math.sin(animTime * 4) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. Node Body (Radial Gradient)
    const bodyGrad = ctx.createRadialGradient(
      pos.x - radius * 0.3,
      pos.y - radius * 0.3,
      radius * 0.1,
      pos.x,
      pos.y,
      radius
    );
    bodyGrad.addColorStop(0, style.bgGradient[0]);
    bodyGrad.addColorStop(1, style.bgGradient[1]);

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = isSelected || isHovered ? "#ffffff" : style.borderColor;
    ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : Math.max(1.5, 2 * cameraZoom);

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. Center glyph or icon dot
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.max(3, 4.5 * cameraZoom), 0, Math.PI * 2);
    ctx.fill();

    // 5. Mastered badge indicator (green check circle)
    if (node.mastered && cameraZoom > 0.5) {
      const bX = pos.x + radius * 0.7;
      const bY = pos.y - radius * 0.7;
      const bRad = Math.max(4, 6 * cameraZoom);

      ctx.fillStyle = "#10b981";
      ctx.strokeStyle = "#070b14";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bX, bY, bRad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Checkmark tick
      if (cameraZoom > 0.7) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bX - 2.5, bY);
        ctx.lineTo(bX - 0.5, bY + 2);
        ctx.lineTo(bX + 3, bY - 2);
        ctx.stroke();
      }
    }

    // 6. Label rendering
    const showLabel = cameraZoom > 0.45 || isSelected || isHovered || node.category === "central" || node.category === "main";
    if (showLabel && !isDimmed) {
      const fontSize = Math.max(10, Math.min(15, 12 * cameraZoom));
      ctx.font = `${node.importance >= 4 || node.category === "central" ? "700" : "500"} ${fontSize}px Inter, Segoe UI, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const labelY = pos.y + radius + 6 * cameraZoom;

      // Label background pill
      const metrics = ctx.measureText(node.label);
      const textW = metrics.width;
      const textH = fontSize + 4;

      ctx.fillStyle = "rgba(7, 11, 20, 0.85)";
      ctx.beginPath();
      ctx.roundRect(pos.x - textW / 2 - 4, labelY - 2, textW + 8, textH, 4);
      ctx.fill();

      // Label text
      ctx.fillStyle = isSelected ? "#ffffff" : isHovered ? "#e0f2fe" : style.color;
      ctx.fillText(node.label, pos.x, labelY);
    }

    ctx.restore();
  }

  // Draw minimap in the corner
  function drawMinimap() {
    if (!minimapCanvas || !canvas) return;
    const mctx = minimapCanvas.getContext("2d");
    if (!mctx) return;

    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;

    mctx.clearRect(0, 0, mw, mh);

    // Dark semi-transparent background with border
    mctx.fillStyle = "rgba(10, 15, 29, 0.92)";
    mctx.fillRect(0, 0, mw, mh);

    const bounds = getGraphBounds(nodes);
    const scale = Math.min((mw - 20) / bounds.width, (mh - 20) / bounds.height);

    const toMinimap = (wx: number, wy: number) => ({
      x: mw / 2 + (wx - bounds.centerX) * scale,
      y: mh / 2 + (wy - bounds.centerY) * scale,
    });

    // Draw miniature edges
    mctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    mctx.lineWidth = 0.8;
    const nodeMap = new Map<string, GraphNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    for (const e of edges) {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t || s.hidden || t.hidden) continue;
      const sp = toMinimap(s.x, s.y);
      const tp = toMinimap(t.x, t.y);
      mctx.beginPath();
      mctx.moveTo(sp.x, sp.y);
      mctx.lineTo(tp.x, tp.y);
      mctx.stroke();
    }

    // Draw miniature nodes
    for (const n of nodes) {
      if (n.hidden) continue;
      const mp = toMinimap(n.x, n.y);
      const style = n.mastered ? MASTERED_STYLE : (CATEGORY_STYLES[n.category] ?? CATEGORY_STYLES.main);
      mctx.fillStyle = style.color;
      mctx.beginPath();
      mctx.arc(mp.x, mp.y, n.category === "central" ? 3.5 : 2, 0, Math.PI * 2);
      mctx.fill();
    }

    // Draw current viewport window rectangle
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const tlWorld = screenToWorld(0, 0, cw, ch);
    const brWorld = screenToWorld(cw, ch, cw, ch);

    const tlMinimap = toMinimap(tlWorld.x, tlWorld.y);
    const brMinimap = toMinimap(brWorld.x, brWorld.y);

    mctx.strokeStyle = "#38bdf8";
    mctx.lineWidth = 1.5;
    mctx.strokeRect(
      tlMinimap.x,
      tlMinimap.y,
      Math.max(8, brMinimap.x - tlMinimap.x),
      Math.max(8, brMinimap.y - tlMinimap.y)
    );
  }

  // Window resize handler
  function resizeCanvas() {
    if (!canvas || !canvasContainer) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }

  onMount(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    animFrameId = requestAnimationFrame(renderFrame);
    // Initial fit
    setTimeout(fitToView, 120);
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", resizeCanvas);
    }
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
    }
  });
</script>

<div class="canvas-wrapper" bind:this={canvasContainer}>
  <canvas
    bind:this={canvas}
    class="main-canvas"
    onmousedown={handleMouseDown}
    onmousemove={handleMouseMove}
    onmouseup={handleMouseUp}
    onwheel={handleWheel}
    ondblclick={handleDblClick}
  ></canvas>

  <!-- Minimap HUD -->
  <div class="minimap-panel">
    <canvas bind:this={minimapCanvas} width="160" height="110" class="minimap-canvas"></canvas>
    <div class="minimap-caption">Graph Radar</div>
  </div>
</div>

<style>
  .canvas-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 540px;
    background: #070b14;
    overflow: hidden;
    user-select: none;
    border-radius: 12px;
  }

  .main-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: default;
  }

  .minimap-panel {
    position: absolute;
    bottom: 16px;
    right: 16px;
    background: rgba(10, 15, 29, 0.85);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .minimap-canvas {
    border-radius: 6px;
    display: block;
  }

  .minimap-caption {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #64748b;
  }
</style>
