import type { KnowledgeGraphSnapshot } from "./tauriApi";

export const OBSIDIAN_CLUSTER_COLORS = [
  "#34d399", // Emerald
  "#38bdf8", // Cyan
  "#a78bfa", // Violet
  "#fbbf24", // Amber
  "#f472b6", // Pink
  "#2dd4bf", // Teal
  "#fb923c", // Orange
  "#60a5fa", // Blue
  "#c084fc", // Purple
  "#f87171", // Coral
] as const;

export interface ObsidianNodeElement {
  data: {
    id: string;
    label: string;
    summary: string;
    degree: number;
    size: number;
    color: string;
    borderColor: string;
    clusterId: string;
    clusterLabel: string;
    isHub: boolean;
  };
}

export interface ObsidianEdgeElement {
  data: {
    id: string;
    source: string;
    target: string;
    relation: string;
    label: string;
  };
}

export interface ObsidianLegendItem {
  clusterId: string;
  label: string;
  color: string;
  count: number;
}

export interface ObsidianGraphModel {
  nodes: ObsidianNodeElement[];
  edges: ObsidianEdgeElement[];
  legend: ObsidianLegendItem[];
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function truncateLabel(text: string, maxLen = 22): string {
  const clean = text.trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

function formatClusterLabel(clusterId: string, hubLabel: string | undefined, index: number): string {
  if (hubLabel && hubLabel.trim()) {
    return truncateLabel(hubLabel, 22);
  }
  const clean = clusterId.replace(/^(?:lecture|lec)-/i, "").trim();
  const isUuidOrGeneric =
    clusterId.startsWith("group-") ||
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i.test(clean) ||
    /^[0-9a-f-]{12,}$/i.test(clean);

  if (clusterId.startsWith("group-") || isUuidOrGeneric) {
    return `Subject ${index + 1}`;
  }
  return truncateLabel(clean, 22);
}

export function buildObsidianGraph(snapshot: KnowledgeGraphSnapshot): ObsidianGraphModel {
  const concepts = snapshot.concepts ?? [];
  const validIds = new Set(concepts.map((c) => c.id));

  const seenEdgeKeys = new Set<string>();
  const validEdges = (snapshot.edges ?? []).filter((e) => {
    if (
      e.from_concept_id === e.to_concept_id ||
      !validIds.has(e.from_concept_id) ||
      !validIds.has(e.to_concept_id)
    ) {
      return false;
    }
    const pairKey = `${e.from_concept_id}->${e.to_concept_id}:${e.relation}`;
    if (seenEdgeKeys.has(pairKey)) return false;
    seenEdgeKeys.add(pairKey);
    return true;
  });

  const degreeMap = new Map<string, number>();
  for (const id of validIds) degreeMap.set(id, 0);
  for (const e of validEdges) {
    degreeMap.set(e.from_concept_id, (degreeMap.get(e.from_concept_id) ?? 0) + 1);
    degreeMap.set(e.to_concept_id, (degreeMap.get(e.to_concept_id) ?? 0) + 1);
  }

  // Assign connected components fallback so unlinked or single-lecture notes still cluster cleanly
  const adj = new Map<string, string[]>();
  for (const id of validIds) adj.set(id, []);
  for (const e of validEdges) {
    adj.get(e.from_concept_id)?.push(e.to_concept_id);
    adj.get(e.to_concept_id)?.push(e.from_concept_id);
  }

  const componentMap = new Map<string, string>();
  let compIdx = 0;
  for (const c of concepts) {
    if (componentMap.has(c.id)) continue;
    const compId = `group-${compIdx++}`;
    const queue = [c.id];
    componentMap.set(c.id, compId);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nxt of adj.get(cur) ?? []) {
        if (!componentMap.has(nxt)) {
          componentMap.set(nxt, compId);
          queue.push(nxt);
        }
      }
    }
  }

  const conceptClusters = concepts.map(
    (c, idx) => c.links?.[0]?.lecture_id?.trim() || componentMap.get(c.id) || `group-${idx % 5}`
  );

  // Pick each cluster's highest-degree concept label so UUID subjects read cleanly
  const clusterHubLabel = new Map<string, { label: string; degree: number }>();
  concepts.forEach((c, idx) => {
    const cid = conceptClusters[idx];
    const deg = degreeMap.get(c.id) ?? 0;
    const prev = clusterHubLabel.get(cid);
    if (!prev || deg > prev.degree) {
      clusterHubLabel.set(cid, { label: c.label, degree: deg });
    }
  });

  const clusterColorMap = new Map<string, string>();
  const clusterStats = new Map<string, { label: string; color: string; count: number }>();
  const maxDegree = Math.max(0, ...degreeMap.values());

  const nodes: ObsidianNodeElement[] = concepts.map((c, idx) => {
    const degree = degreeMap.get(c.id) ?? 0;
    const rawCluster = conceptClusters[idx];
    let color = clusterColorMap.get(rawCluster);
    if (!color) {
      const slot = clusterColorMap.size;
      const colorIdx =
        slot < OBSIDIAN_CLUSTER_COLORS.length
          ? slot
          : hashString(rawCluster) % OBSIDIAN_CLUSTER_COLORS.length;
      color = OBSIDIAN_CLUSTER_COLORS[colorIdx];
      clusterColorMap.set(rawCluster, color);
    }

    const existing = clusterStats.get(rawCluster);
    if (existing) {
      existing.count += 1;
    } else {
      clusterStats.set(rawCluster, {
        label: formatClusterLabel(rawCluster, clusterHubLabel.get(rawCluster)?.label, clusterStats.size),
        color,
        count: 1,
      });
    }

    const size = Math.round(Math.min(34, 12 + Math.sqrt(degree) * 6.5));
    const isHub = degree >= 3 || (concepts.length > 1 && degree === maxDegree && degree > 0);
    const clusterLabel = clusterStats.get(rawCluster)!.label;

    return {
      data: {
        id: c.id,
        label: c.label,
        summary: c.summary,
        degree,
        size,
        color,
        borderColor: isHub ? "#f8fafc" : "#0b0f17",
        clusterId: rawCluster,
        clusterLabel,
        isHub,
      },
    };
  });

  const edges: ObsidianEdgeElement[] = validEdges.map((e) => ({
    data: {
      id: e.id,
      source: e.from_concept_id,
      target: e.to_concept_id,
      relation: e.relation,
      label: e.relation.replace(/_/g, " "),
    },
  }));

  const legend: ObsidianLegendItem[] = Array.from(clusterStats.entries())
    .map(([clusterId, info]) => ({
      clusterId,
      label: info.label,
      color: info.color,
      count: info.count,
    }))
    .sort((a, b) => b.count - a.count);

  return { nodes, edges, legend };
}

export function filterObsidianGraph(
  model: ObsidianGraphModel,
  opts: {
    subjectId?: string;
    focusId?: string;
    localDepth?: "all" | 1 | 2;
    hubsOnly?: boolean;
  }
): ObsidianGraphModel {
  let candidateNodes = model.nodes;
  if (opts.subjectId && opts.subjectId !== "all") {
    candidateNodes = candidateNodes.filter((n) => n.data.clusterId === opts.subjectId);
  }

  let keptIds = new Set(candidateNodes.map((n) => n.data.id));
  const adj = new Map<string, string[]>();
  for (const id of keptIds) adj.set(id, []);
  for (const e of model.edges) {
    if (keptIds.has(e.data.source) && keptIds.has(e.data.target)) {
      adj.get(e.data.source)?.push(e.data.target);
      adj.get(e.data.target)?.push(e.data.source);
    }
  }

  if ((opts.localDepth === 1 || opts.localDepth === 2) && opts.focusId && keptIds.has(opts.focusId)) {
    const reached = new Set<string>([opts.focusId]);
    let frontier = [opts.focusId];
    for (let hop = 0; hop < opts.localDepth; hop++) {
      const nextFrontier: string[] = [];
      for (const cur of frontier) {
        for (const nb of adj.get(cur) ?? []) {
          if (!reached.has(nb)) {
            reached.add(nb);
            nextFrontier.push(nb);
          }
        }
      }
      frontier = nextFrontier;
      if (!frontier.length) break;
    }
    keptIds = reached;
  }

  if (opts.hubsOnly) {
    const focusNeighbors = new Set<string>(opts.focusId ? adj.get(opts.focusId) ?? [] : []);
    keptIds = new Set(
      candidateNodes
        .filter(
          (n) =>
            keptIds.has(n.data.id) &&
            (n.data.isHub || n.data.id === opts.focusId || focusNeighbors.has(n.data.id))
        )
        .map((n) => n.data.id)
    );
  }

  const nodes = candidateNodes.filter((n) => keptIds.has(n.data.id));
  const edges = model.edges.filter(
    (e) => keptIds.has(e.data.source) && keptIds.has(e.data.target)
  );

  return { nodes, edges, legend: model.legend };
}

export function computeClusteredPositions(
  nodes: ObsidianNodeElement[],
  edges: ObsidianEdgeElement[]
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  if (!nodes.length) return positions;

  const clusters = new Map<string, ObsidianNodeElement[]>();
  for (const n of nodes) {
    const list = clusters.get(n.data.clusterId);
    if (list) list.push(n);
    else clusters.set(n.data.clusterId, [n]);
  }

  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.data.id, []);
  for (const e of edges) {
    adj.get(e.data.source)?.push(e.data.target);
    adj.get(e.data.target)?.push(e.data.source);
  }

  const sortedClusters = Array.from(clusters.entries())
    .map(([clusterId, list]) => {
      const radius = Math.max(95, Math.ceil(Math.sqrt(list.length) * 64));
      return { clusterId, list, radius };
    })
    .sort((a, b) => b.list.length - a.list.length);

  // Pack unrelated subject islands into non-overlapping shelf rows
  const totalArea = sortedClusters.reduce((acc, c) => acc + Math.pow(c.radius * 2 + 120, 2), 0);
  const rowBudget = Math.max(700, Math.ceil(Math.sqrt(totalArea) * 1.25));

  interface PlacedIsland {
    list: ObsidianNodeElement[];
    radius: number;
    cx: number;
    cy: number;
  }
  const islands: PlacedIsland[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let maxRowWidth = 0;

  for (const cluster of sortedClusters) {
    const diameter = cluster.radius * 2;
    const gap = 120;
    if (cursorX > 0 && cursorX + diameter > rowBudget) {
      maxRowWidth = Math.max(maxRowWidth, cursorX - gap);
      cursorX = 0;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }
    const cx = cursorX + cluster.radius;
    const cy = cursorY + cluster.radius;
    islands.push({ list: cluster.list, radius: cluster.radius, cx, cy });
    cursorX += diameter + gap;
    rowHeight = Math.max(rowHeight, diameter);
  }
  maxRowWidth = Math.max(maxRowWidth, cursorX);
  const totalHeight = cursorY + rowHeight;

  // Center the galaxy around origin
  const offsetX = maxRowWidth / 2;
  const offsetY = totalHeight / 2;

  for (const island of islands) {
    const cx = island.cx - offsetX;
    const cy = island.cy - offsetY;
    const sorted = [...island.list].sort(
      (a, b) => b.data.degree - a.data.degree || a.data.label.localeCompare(b.data.label)
    );
    const islandIds = new Set(sorted.map((n) => n.data.id));
    const hub = sorted[0];
    positions[hub.data.id] = { x: cx, y: cy };

    if (sorted.length === 1) continue;

    // BFS depth from hub within this subject island so dense subtopics fan into concentric rings
    const depthMap = new Map<string, number>([[hub.data.id, 0]]);
    const queue = [hub.data.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const d = depthMap.get(cur)!;
      for (const nb of adj.get(cur) ?? []) {
        if (islandIds.has(nb) && !depthMap.has(nb)) {
          depthMap.set(nb, d + 1);
          queue.push(nb);
        }
      }
    }

    const innerRing: ObsidianNodeElement[] = [];
    const outerRing: ObsidianNodeElement[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const node = sorted[i];
      const hop = depthMap.get(node.data.id) ?? 2;
      if (hop <= 1 && innerRing.length < 10) {
        innerRing.push(node);
      } else {
        outerRing.push(node);
      }
    }

    const r1 = innerRing.length > 0 ? Math.max(76, Math.min(island.radius * 0.56, 76 + innerRing.length * 8)) : 0;
    innerRing.forEach((n, idx) => {
      const angle = (idx / innerRing.length) * Math.PI * 2 - Math.PI / 2;
      positions[n.data.id] = {
        x: Math.round(cx + Math.cos(angle) * r1),
        y: Math.round(cy + Math.sin(angle) * r1),
      };
    });

    const outerRadiusBase = Math.max(r1 + 78, island.radius * 0.92);
    outerRing.forEach((n, idx) => {
      const subRing = Math.floor(idx / 16);
      const countInSub = Math.min(16, outerRing.length - subRing * 16);
      const posInSub = idx % 16;
      const angle = (posInSub / Math.max(1, countInSub)) * Math.PI * 2 + subRing * 0.35;
      const r = outerRadiusBase + subRing * 68;
      positions[n.data.id] = {
        x: Math.round(cx + Math.cos(angle) * r),
        y: Math.round(cy + Math.sin(angle) * r),
      };
    });
  }

  return positions;
}
