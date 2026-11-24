import { describe, expect, it } from "vitest";
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
});
