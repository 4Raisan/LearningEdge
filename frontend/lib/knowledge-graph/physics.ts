import type { GraphEdge, GraphNode, LayoutMode } from "./types";

export interface SimulationParams {
  repulsion: number;       // Repulsion strength between nodes
  springLength: number;    // Desired resting distance of edges
  springStrength: number;  // Spring tension
  damping: number;         // Velocity friction (0..1)
  centerStrength: number;  // Gravity toward center
  minDistance: number;     // Avoid division by zero
  maxVelocity: number;     // Velocity clamp
}

export const DEFAULT_SIM_PARAMS: SimulationParams = {
  repulsion: 4200,
  springLength: 130,
  springStrength: 0.05,
  damping: 0.88,
  centerStrength: 0.015,
  minDistance: 30,
  maxVelocity: 15,
};

/**
 * Executes a single physics step on the node list based on active edges.
 * Returns the kinetic energy (sum of velocities) to detect when the graph has settled.
 */
export function stepPhysics(
  nodes: GraphNode[],
  edges: GraphEdge[],
  centerX: number = 0,
  centerY: number = 0,
  params: SimulationParams = DEFAULT_SIM_PARAMS
): number {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) {
    if (!n.hidden) nodeMap.set(n.id, n);
  }

  // 1. Repulsion between all pairs of nodes (Barnes-Hut or pair-wise for N < 200)
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (a.hidden) continue;

    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (b.hidden) continue;

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) {
        dx = (Math.random() - 0.5) * 2;
        dy = (Math.random() - 0.5) * 2;
        dist = 1;
      }

      // Desired minimum distance based on node radii
      const minDist = a.radius + b.radius + 30;
      let force = params.repulsion / (dist * dist);

      // Extra anti-overlap push
      if (dist < minDist) {
        force += (minDist - dist) * 0.2;
      }

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!a.fixed) {
        a.vx -= fx;
        a.vy -= fy;
      }
      if (!b.fixed) {
        b.vx += fx;
        b.vy += fy;
      }
    }

    // 2. Centering force
    if (!a.fixed) {
      const cdx = centerX - a.x;
      const cdy = centerY - a.y;
      a.vx += cdx * params.centerStrength;
      a.vy += cdy * params.centerStrength;
    }
  }

  // 3. Spring attraction along edges
  for (const edge of edges) {
    if (edge.dimmed) continue;
    const s = nodeMap.get(edge.source);
    const t = nodeMap.get(edge.target);
    if (!s || !t || s.hidden || t.hidden) continue;

    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;

    // Ideal length adjusted by node sizes
    const targetLength = params.springLength + (s.radius + t.radius);
    const displacement = dist - targetLength;
    const force = displacement * params.springStrength;

    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    if (!s.fixed) {
      s.vx += fx;
      s.vy += fy;
    }
    if (!t.fixed) {
      t.vx -= fx;
      t.vy -= fy;
    }
  }

  // 4. Position update & velocity damping
  let totalEnergy = 0;
  for (const n of nodes) {
    if (n.hidden || n.fixed) continue;

    // Clamp max velocity
    const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
    if (speed > params.maxVelocity) {
      n.vx = (n.vx / speed) * params.maxVelocity;
      n.vy = (n.vy / speed) * params.maxVelocity;
    }

    n.x += n.vx;
    n.y += n.vy;

    n.vx *= params.damping;
    n.vy *= params.damping;

    totalEnergy += Math.abs(n.vx) + Math.abs(n.vy);
  }

  return totalEnergy;
}

/**
 * Arranges nodes according to selected LayoutMode.
 */
export function applyLayoutMode(
  mode: LayoutMode,
  nodes: GraphNode[],
  edges: GraphEdge[],
  centralNodeId?: string,
  width: number = 1000,
  height: number = 700
): void {
  const rootId = centralNodeId ?? nodes.find((n) => n.category === "central")?.id ?? nodes[0]?.id;
  if (!rootId) return;

  if (mode === "radial") {
    arrangeRadial(nodes, edges, rootId);
  } else if (mode === "hierarchical") {
    arrangeHierarchical(nodes, edges, rootId, width, height);
  } else {
    // Force: give a good initial circular distribution if they don't have one
    arrangeOrganicSeed(nodes, rootId);
  }
}

/**
 * Arranges nodes in concentric orbital rings around the central concept.
 */
function arrangeRadial(nodes: GraphNode[], edges: GraphEdge[], rootId: string): void {
  const root = nodes.find((n) => n.id === rootId);
  if (root) {
    root.x = 0;
    root.y = 0;
    root.fixed = true;
  }

  // Group nodes by depth from root
  const depthMap = calculateDepths(nodes, edges, rootId);

  // Group by depth
  const ringNodes = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    if (n.id === rootId) continue;
    const d = depthMap.get(n.id) ?? 2;
    if (!ringNodes.has(d)) ringNodes.set(d, []);
    ringNodes.get(d)!.push(n);
  }

  // Place rings
  const ringRadii: Record<number, number> = {
    1: 170, // Main concepts
    2: 300, // Subtopics
    3: 430, // Applications, definitions, examples
    4: 550, // Leaf supporting info
  };

  ringNodes.forEach((nodeList, depth) => {
    const radius = ringRadii[depth] ?? (150 + depth * 120);
    const count = nodeList.length;
    const angleStep = (2 * Math.PI) / count;
    const offsetAngle = (depth * 0.45); // slight stagger

    nodeList.forEach((n, idx) => {
      const theta = offsetAngle + idx * angleStep;
      n.x = Math.cos(theta) * radius;
      n.y = Math.sin(theta) * radius;
      n.vx = 0;
      n.vy = 0;
    });
  });
}

/**
 * Arranges nodes in a top-down hierarchical flow from central/prerequisites down to subtopics & applications.
 */
function arrangeHierarchical(
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootId: string,
  width: number,
  height: number
): void {
  const depthMap = calculateDepths(nodes, edges, rootId);
  const levels = new Map<number, GraphNode[]>();

  for (const n of nodes) {
    const d = depthMap.get(n.id) ?? 2;
    if (!levels.has(d)) levels.set(d, []);
    levels.get(d)!.push(n);
  }

  const sortedDepths = Array.from(levels.keys()).sort((a, b) => a - b);
  const rowHeight = 150;
  const startY = -(sortedDepths.length * rowHeight) / 2;

  sortedDepths.forEach((depth, dIdx) => {
    const row = levels.get(depth)!;
    const y = startY + dIdx * rowHeight;
    const count = row.length;
    const totalSpacing = Math.max(160, 900 / Math.max(1, count));
    const startX = -((count - 1) * totalSpacing) / 2;

    row.forEach((n, idx) => {
      n.x = startX + idx * totalSpacing;
      n.y = y;
      n.vx = 0;
      n.vy = 0;
    });
  });
}

/**
 * Seeds nodes in an organic cluster for force simulation.
 */
function arrangeOrganicSeed(nodes: GraphNode[], rootId: string): void {
  const root = nodes.find((n) => n.id === rootId);
  if (root) {
    root.x = 0;
    root.y = 0;
  }

  const others = nodes.filter((n) => n.id !== rootId);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // Golden spiral distribution

  others.forEach((n, i) => {
    const r = Math.sqrt(i + 1) * 75;
    const theta = (i + 1) * goldenAngle;
    n.x = Math.cos(theta) * r + (Math.random() - 0.5) * 20;
    n.y = Math.sin(theta) * r + (Math.random() - 0.5) * 20;
    n.vx = 0;
    n.vy = 0;
  });
}

/**
 * Calculates BFS depth from root node.
 */
function calculateDepths(
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootId: string
): Map<string, number> {
  const depths = new Map<string, number>();
  depths.set(rootId, 0);

  // Build adjacency
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }

  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currDepth = depths.get(curr)!;
    const neighbors = adj.get(curr) ?? [];

    for (const nb of neighbors) {
      if (!depths.has(nb)) {
        depths.set(nb, currDepth + 1);
        queue.push(nb);
      }
    }
  }

  // Any unreachable node gets fallback level based on category
  for (const n of nodes) {
    if (!depths.has(n.id)) {
      if (n.category === "central") depths.set(n.id, 0);
      else if (n.category === "main") depths.set(n.id, 1);
      else if (n.category === "subtopic") depths.set(n.id, 2);
      else depths.set(n.id, 3);
    }
  }

  return depths;
}

/**
 * Calculates graph bounding box for auto-fitting camera.
 */
export function getGraphBounds(nodes: GraphNode[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} {
  const visible = nodes.filter((n) => !n.hidden);
  if (visible.length === 0) {
    return { minX: -200, maxX: 200, minY: -200, maxY: 200, width: 400, height: 400, centerX: 0, centerY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of visible) {
    const pad = n.radius + 30;
    if (n.x - pad < minX) minX = n.x - pad;
    if (n.x + pad > maxX) maxX = n.x + pad;
    if (n.y - pad < minY) minY = n.y - pad;
    if (n.y + pad > maxY) maxY = n.y + pad;
  }

  const width = Math.max(100, maxX - minX);
  const height = Math.max(100, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return { minX, maxX, minY, maxY, width, height, centerX, centerY };
}
