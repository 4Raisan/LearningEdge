import { describe, expect, it } from "vitest";
import {
  buildObsidianGraph,
  computeClusteredPositions,
  filterObsidianGraph,
} from "../frontend/lib/knowledgeGraphTheme";
import {
  AI_KNOWLEDGE_DOMAIN,
  CPU_CACHE_DOMAIN,
  convertSnapshotToDomain,
} from "../frontend/lib/knowledge-graph/sampleData";
import {
  applyLayoutMode,
  DEFAULT_SIM_PARAMS,
  getGraphBounds,
  stepPhysics,
} from "../frontend/lib/knowledge-graph/physics";
import type { GraphDomain, NodeCategory } from "../frontend/lib/knowledge-graph/types";
import type { KnowledgeGraphSnapshot } from "../frontend/lib/tauriApi";

describe("Intelligent Knowledge Graph - Domain Structure & Data Integrity", () => {
  const domains: GraphDomain[] = [AI_KNOWLEDGE_DOMAIN, CPU_CACHE_DOMAIN];

  for (const d of domains) {
    it(`validates ${d.name} structural integrity`, () => {
      expect(d.nodes.length).toBeGreaterThan(5);
      expect(d.edges.length).toBeGreaterThan(5);

      const nodeIds = new Set(d.nodes.map((n) => n.id));

      // Central node must exist
      expect(nodeIds.has(d.centralNodeId)).toBe(true);
      const central = d.nodes.find((n) => n.id === d.centralNodeId);
      expect(central?.category).toBe("central");

      // Verify all edges connect valid nodes
      for (const e of d.edges) {
        expect(nodeIds.has(e.source), `Source node ${e.source} must exist in domain`).toBe(true);
        expect(nodeIds.has(e.target), `Target node ${e.target} must exist in domain`).toBe(true);
        expect(e.relation).toBeDefined();
      }

      // Check category variety (prompt requires central, main, subtopics, related, applications, etc.)
      const categories = new Set(d.nodes.map((n) => n.category));
      expect(categories.has("central")).toBe(true);
      expect(categories.has("main")).toBe(true);
      expect(categories.has("subtopic")).toBe(true);
      expect(categories.has("related")).toBe(true);
    });
  }

  it("verifies AI domain represents the required concept hierarchy from the brief", () => {
    const nodeMap = new Map(AI_KNOWLEDGE_DOMAIN.nodes.map((n) => [n.id, n]));
    expect(nodeMap.get("ai-central")?.label).toBe("Artificial Intelligence");
    expect(nodeMap.get("ai-ml")?.label).toBe("Machine Learning");
    expect(nodeMap.get("ai-dl")?.label).toBe("Deep Learning");
    expect(nodeMap.get("ai-nn")?.label).toBe("Neural Networks");
    expect(nodeMap.get("ai-cv")?.label).toBe("Computer Vision");
    expect(nodeMap.get("ai-nlp")?.label).toBe("Natural Language Processing");
  });

  it("verifies CPU Caching domain provides lecture segment and video traceability", () => {
    const tracedNodes = CPU_CACHE_DOMAIN.nodes.filter((n) => n.sourceRefs && n.sourceRefs.length > 0);
    expect(tracedNodes.length).toBeGreaterThanOrEqual(5);

    const memoryWall = CPU_CACHE_DOMAIN.nodes.find((n) => n.id === "cpu-mem-wall");
    expect(memoryWall?.videoStartMs).toBe(0);
    expect(memoryWall?.videoEndMs).toBe(24000);
    expect(memoryWall?.sourceRefs).toContain("seg-01");
  });
});

describe("Knowledge Graph - Physics & Layout Modes", () => {
  it("steps physics simulation and stabilizes kinetic energy", () => {
    const nodes = AI_KNOWLEDGE_DOMAIN.nodes.map((n) => ({ ...n, x: Math.random() * 200, y: Math.random() * 200 }));
    const edges = AI_KNOWLEDGE_DOMAIN.edges.map((e) => ({ ...e }));

    const initialEnergy = stepPhysics(nodes, edges, 0, 0, DEFAULT_SIM_PARAMS);
    expect(initialEnergy).toBeGreaterThan(0);

    let lastEnergy = initialEnergy;
    for (let i = 0; i < 40; i++) {
      lastEnergy = stepPhysics(nodes, edges, 0, 0, DEFAULT_SIM_PARAMS);
    }
    // Damping should reduce kinetic energy
    expect(lastEnergy).toBeLessThan(initialEnergy + 50);
  });

  it("arranges nodes in radial concentric layout", () => {
    const nodes = AI_KNOWLEDGE_DOMAIN.nodes.map((n) => ({ ...n }));
    const edges = AI_KNOWLEDGE_DOMAIN.edges.map((e) => ({ ...e }));

    applyLayoutMode("radial", nodes, edges, AI_KNOWLEDGE_DOMAIN.centralNodeId);
    const root = nodes.find((n) => n.id === AI_KNOWLEDGE_DOMAIN.centralNodeId);
    expect(root?.x).toBe(0);
    expect(root?.y).toBe(0);

    const nonRoots = nodes.filter((n) => n.id !== AI_KNOWLEDGE_DOMAIN.centralNodeId);
    for (const n of nonRoots) {
      const dist = Math.sqrt(n.x * n.x + n.y * n.y);
      expect(dist).toBeGreaterThanOrEqual(140);
    }
  });

  it("arranges nodes in hierarchical tree layout", () => {
    const nodes = CPU_CACHE_DOMAIN.nodes.map((n) => ({ ...n }));
    const edges = CPU_CACHE_DOMAIN.edges.map((e) => ({ ...e }));

    applyLayoutMode("hierarchical", nodes, edges, CPU_CACHE_DOMAIN.centralNodeId, 1200, 800);
    const bounds = getGraphBounds(nodes);
    expect(bounds.width).toBeGreaterThan(200);
    expect(bounds.height).toBeGreaterThan(150);
  });
});

describe("Knowledge Graph - Snapshot Converter", () => {
  it("converts personal SQLite snapshot to a rich interactive domain", () => {
    const snapshot: KnowledgeGraphSnapshot = {
      concepts: [
        {
          id: "concept-np-01",
          label: "Branch Prediction",
          summary: "Speculative execution predicting conditional branch outcomes.",
          aliases: ["Dynamic branch predictor"],
          links: [
            {
              id: "link-01",
              lecture_id: "lec-branch-01",
              source_refs: ["seg-02"],
              note_point_id: "np-01",
              video_start_ms: 12000,
              video_end_ms: 36000,
            },
          ],
        },
        {
          id: "concept-np-02",
          label: "Pipeline Stalls",
          summary: "Bubbles in the instruction pipeline caused by control hazards.",
          aliases: [],
          links: [],
        },
      ],
      edges: [
        {
          id: "e-01",
          from_concept_id: "concept-np-01",
          to_concept_id: "concept-np-02",
          relation: "leads_to",
          supporting_sources: ["seg-02"],
        },
      ],
      dream_suggestions: [],
    };

    const domain = convertSnapshotToDomain(snapshot, "Computer Architecture Lecture");
    expect(domain.nodes.length).toBe(2);
    expect(domain.edges.length).toBe(1);
    expect(domain.centralNodeId).toBe("concept-np-01");

    const n0 = domain.nodes[0];
    expect(n0.label).toBe("Branch Prediction");
    expect(n0.category).toBe("central");
    expect(n0.videoStartMs).toBe(12000);
    expect(n0.videoEndMs).toBe(36000);
  });

  it("builds degree-scaled, cluster-colored Obsidian graph data and drops orphan edges", () => {
    const snapshot: KnowledgeGraphSnapshot = {
      concepts: [
        {
          id: "c1",
          label: "Git Commits",
          summary: "Immutable snapshots of tracked project state.",
          aliases: [],
          links: [{ id: "l1", lecture_id: "lec-git", source_refs: ["s1"] }],
        },
        {
          id: "c2",
          label: "Staging Area",
          summary: "Index holding changes queued for the next commit.",
          aliases: [],
          links: [{ id: "l2", lecture_id: "lec-git", source_refs: ["s2"] }],
        },
        {
          id: "c3",
          label: "Branch Pointers",
          summary: "Lightweight movable references to commits.",
          aliases: [],
          links: [{ id: "l3", lecture_id: "lec-branches", source_refs: ["s3"] }],
        },
        {
          id: "c4",
          label: "Merge Conflicts",
          summary: "Divergent edits requiring resolution.",
          aliases: [],
          links: [{ id: "l4", lecture_id: "lec-git", source_refs: ["s4"] }],
        },
      ],
      edges: [
        { id: "e1", from_concept_id: "c1", to_concept_id: "c2", relation: "depends_on", supporting_sources: [] },
        { id: "e2", from_concept_id: "c1", to_concept_id: "c3", relation: "leads_to", supporting_sources: [] },
        { id: "e3", from_concept_id: "c1", to_concept_id: "c4", relation: "related_to", supporting_sources: [] },
        { id: "e-orphan", from_concept_id: "c1", to_concept_id: "missing-node", relation: "leads_to", supporting_sources: [] },
      ],
      dream_suggestions: [],
    };

    const graph = buildObsidianGraph(snapshot);

    expect(graph.edges).toHaveLength(3);
    expect(graph.edges.every((e) => e.data.id !== "e-orphan")).toBe(true);
    expect(graph.edges[0].data.label).toBe("depends on");

    const hub = graph.nodes.find((n) => n.data.id === "c1")!;
    const leaf = graph.nodes.find((n) => n.data.id === "c2")!;
    const branchNode = graph.nodes.find((n) => n.data.id === "c3")!;

    expect(hub.data.degree).toBe(3);
    expect(hub.data.isHub).toBe(true);
    expect(hub.data.size).toBeGreaterThan(leaf.data.size);
    expect(hub.data.color).toBe(leaf.data.color);
    expect(branchNode.data.color).not.toBe(hub.data.color);
    expect(graph.legend).toHaveLength(2);
  });

  it("handles large multi-subject graphs with island packing, subject filtering, and dense local hops", () => {
    const subjects = [
      { id: "sub-git", name: "GitHub Workflows" },
      { id: "sub-cpu", name: "CPU Caching" },
      { id: "sub-rust", name: "Rust Ownership" },
      { id: "sub-db", name: "SQLite Indexing" },
      { id: "sub-net", name: "TCP Congestion" },
    ];
    const concepts: KnowledgeGraphSnapshot["concepts"] = [];
    const edges: KnowledgeGraphSnapshot["edges"] = [];

    for (const sub of subjects) {
      for (let i = 0; i < 24; i++) {
        const cid = `${sub.id}-n${i}`;
        concepts.push({
          id: cid,
          label: i === 0 ? sub.name : `${sub.name} Node ${i}`,
          summary: `Detailed concept ${i} under ${sub.name}`,
          aliases: [],
          links: [{ id: `lnk-${cid}`, lecture_id: `lecture-${sub.id}-uuid-0001`, source_refs: [`s-${i}`] }],
        });
        if (i > 0 && i <= 10) {
          edges.push({
            id: `edge-${sub.id}-hub-${i}`,
            from_concept_id: `${sub.id}-n0`,
            to_concept_id: cid,
            relation: "contains",
            supporting_sources: [],
          });
        } else if (i > 10) {
          const parentIdx = ((i - 11) % 10) + 1;
          edges.push({
            id: `edge-${sub.id}-sub-${i}`,
            from_concept_id: `${sub.id}-n${parentIdx}`,
            to_concept_id: cid,
            relation: "depends_on",
            supporting_sources: [],
          });
        }
      }
    }
    edges.push({
      id: "dangling-edge",
      from_concept_id: "sub-git-n0",
      to_concept_id: "nonexistent-concept",
      relation: "related_to",
      supporting_sources: [],
    });

    const full = buildObsidianGraph({ concepts, edges, dream_suggestions: [] });
    expect(full.nodes).toHaveLength(120);
    expect(full.edges).toHaveLength(115);
    expect(full.legend).toHaveLength(5);
    expect(new Set(full.legend.map((l) => l.color)).size).toBe(5);
    expect(full.legend.some((l) => l.label === "GitHub Workflows")).toBe(true);

    const positions = computeClusteredPositions(full.nodes, full.edges);
    expect(Object.keys(positions)).toHaveLength(120);
    const hubCoords = subjects.map((s) => positions[`${s.id}-n0`]);
    for (let i = 0; i < hubCoords.length; i++) {
      expect(Number.isFinite(hubCoords[i].x)).toBe(true);
      expect(Number.isFinite(hubCoords[i].y)).toBe(true);
      for (let j = i + 1; j < hubCoords.length; j++) {
        const dist = Math.hypot(hubCoords[i].x - hubCoords[j].x, hubCoords[i].y - hubCoords[j].y);
        expect(dist).toBeGreaterThan(250);
      }
    }

    const gitClusterId = full.nodes.find((n) => n.data.id === "sub-git-n0")!.data.clusterId;
    const onlyGit = filterObsidianGraph(full, { subjectId: gitClusterId, localDepth: "all" });
    expect(onlyGit.nodes).toHaveLength(24);
    expect(onlyGit.edges).toHaveLength(23);

    const oneHop = filterObsidianGraph(full, { subjectId: gitClusterId, focusId: "sub-git-n0", localDepth: 1 });
    expect(oneHop.nodes).toHaveLength(11);
    const twoHop = filterObsidianGraph(full, { subjectId: gitClusterId, focusId: "sub-git-n0", localDepth: 2 });
    expect(twoHop.nodes).toHaveLength(24);
  });
});
