<script lang="ts">
  import { onMount } from "svelte";
  import KnowledgeGraphCanvas from "./KnowledgeGraphCanvas.svelte";
  import GraphToolbar from "./GraphToolbar.svelte";
  import LeftSidebar from "./LeftSidebar.svelte";
  import RightSidebar from "./RightSidebar.svelte";
  import {
    AI_KNOWLEDGE_DOMAIN,
    CPU_CACHE_DOMAIN,
    convertSnapshotToDomain,
  } from "./sampleData";
  import { applyLayoutMode } from "./physics";
  import type {
    GraphDomain,
    GraphEdge,
    GraphNode,
    LayoutMode,
    NodeCategory,
  } from "./types";
  import {
    invokeTauri,
    isTauriRuntime,
    type KnowledgeGraphSnapshot,
    type DreamSuggestion,
  } from "../tauriApi";

  let {
    kgSnapshot = null as KnowledgeGraphSnapshot | null,
    onNavigateToVideo,
  }: {
    kgSnapshot?: KnowledgeGraphSnapshot | null;
    onNavigateToVideo?: (lectureId: string, startMs?: number) => void;
  } = $props();

  let canvasRef: ReturnType<typeof KnowledgeGraphCanvas> | null = $state(null);
  let isTauri = $state(isTauriRuntime());
  let isFullscreen = $state(false);

  // Domains
  let defaultDomains = [AI_KNOWLEDGE_DOMAIN, CPU_CACHE_DOMAIN];
  let personalVaultDomain = $derived(
    kgSnapshot && kgSnapshot.concepts.length > 0
      ? convertSnapshotToDomain(kgSnapshot, "Personal Lecture Graph")
      : null
  );

  let domains = $derived<GraphDomain[]>([
    ...defaultDomains,
    ...(personalVaultDomain ? [personalVaultDomain] : []),
  ]);

  let selectedDomainId = $state("domain-ai");
  let activeDomain = $derived(
    domains.find((d) => d.id === selectedDomainId) ?? domains[0]
  );

  // Active nodes & edges
  let currentNodes = $state<GraphNode[]>([]);
  let currentEdges = $state<GraphEdge[]>([]);

  // Selection & Hover
  let selectedNodeId = $state<string | null>(null);
  let hoveredNodeId = $state<string | null>(null);
  let selectedNode = $derived(
    currentNodes.find((n) => n.id === selectedNodeId) ?? null
  );

  // Controls & Filter state
  let layoutMode = $state<LayoutMode>("force");
  let isSimulating = $state(true);
  let selectedCategories = $state<Set<NodeCategory>>(new Set<NodeCategory>());
  let masteryFilter = $state<"all" | "mastered" | "learning">("all");
  let dreamSuggestions = $state<DreamSuggestion[]>([]);

  // Initialize or switch domain
  function loadDomain(domain: GraphDomain) {
    // Deep clone to allow mutable physics state without mutating static data
    currentNodes = domain.nodes.map((n) => ({ ...n }));
    currentEdges = domain.edges.map((e) => ({ ...e }));
    selectedNodeId = domain.centralNodeId ?? currentNodes[0]?.id ?? null;

    // Apply layout positions
    applyLayoutMode(layoutMode, currentNodes, currentEdges, domain.centralNodeId);

    // Initial camera fit
    setTimeout(() => {
      canvasRef?.fitToView();
    }, 60);
  }

  // Handle Domain Change
  $effect(() => {
    if (activeDomain) {
      loadDomain(activeDomain);
    }
  });

  // Handle Filtering (categories & mastery)
  $effect(() => {
    const hasCategoryFilter = selectedCategories.size > 0;
    for (const node of currentNodes) {
      let visible = true;

      // Category check
      if (hasCategoryFilter && !selectedCategories.has(node.category)) {
        visible = false;
      }

      // Mastery check
      if (masteryFilter === "mastered" && !node.mastered) {
        visible = false;
      } else if (masteryFilter === "learning" && node.mastered) {
        visible = false;
      }

      node.hidden = !visible;
    }
  });

  // Layout mode switcher
  function handleLayoutChange(mode: LayoutMode) {
    layoutMode = mode;
    if (mode !== "force") {
      isSimulating = false;
    } else {
      isSimulating = true;
    }
    applyLayoutMode(mode, currentNodes, currentEdges, activeDomain?.centralNodeId);
    setTimeout(() => {
      canvasRef?.fitToView();
    }, 60);
  }

  // Node selection from search or list
  function handleSelectNode(node: GraphNode) {
    selectedNodeId = node.id;
    canvasRef?.focusOnNode(node.id, 1.35);
  }

  // Toggle mastery
  function handleToggleMastered(nodeId: string) {
    const target = currentNodes.find((n) => n.id === nodeId);
    if (target) {
      target.mastered = !target.mastered;
    }
  }

  // Dreaming trigger
  async function handleTriggerDreaming() {
    if (isTauri) {
      try {
        const sugs = await invokeTauri<DreamSuggestion[]>("run_dreaming");
        dreamSuggestions = sugs;
      } catch (err) {
        console.error("Dreaming error:", err);
      }
    } else {
      // Browser preview simulated dreaming suggestions
      const mockSuggestions: DreamSuggestion[] = [
        {
          id: "sug-" + Date.now(),
          kind: "candidate_connection",
          title: "Connect Transformer Attention with Associative Cache Lookup",
          rationale: "Both mechanisms project high-dimensional queries against key manifolds to retrieve content addressed representations.",
          supporting_sources: ["seg-04", "attention-paper"],
          status: "pending",
        },
        {
          id: "sug-" + (Date.now() + 1),
          kind: "knowledge_gap",
          title: "Explore Quantization & Speculative Execution Gaps",
          rationale: "Evaluating INT4 weight quantization against L1/L2 memory latency bottlenecks.",
          supporting_sources: ["seg-05"],
          status: "pending",
        },
      ];
      dreamSuggestions = [...mockSuggestions, ...dreamSuggestions];
    }
  }

  async function handleReviewDream(suggestionId: string, accept: boolean) {
    if (isTauri) {
      try {
        await invokeTauri("review_dream_suggestion", { suggestionId, accept });
        const kg = await invokeTauri<KnowledgeGraphSnapshot>("get_knowledge_graph");
        dreamSuggestions = kg.dream_suggestions;
      } catch (err) {
        console.error("Review dream error:", err);
      }
    } else {
      dreamSuggestions = dreamSuggestions.map((s) =>
        s.id === suggestionId ? { ...s, status: accept ? "accepted" : "dismissed" } : s
      );
    }
  }

  async function handleMergeConcepts(keepId: string, mergeId: string) {
    if (isTauri) {
      try {
        await invokeTauri("merge_kg_concepts", { keepId, mergeId });
        const kg = await invokeTauri<KnowledgeGraphSnapshot>("get_knowledge_graph");
        kgSnapshot = kg;
      } catch (err) {
        console.error("Merge error:", err);
      }
    } else {
      // Browser preview merge
      const keep = currentNodes.find((n) => n.id === keepId);
      const merge = currentNodes.find((n) => n.id === mergeId);
      if (keep && merge) {
        keep.summary += ` [Merged with: ${merge.label}]`;
        currentEdges = currentEdges.map((e) => ({
          ...e,
          source: e.source === mergeId ? keepId : e.source,
          target: e.target === mergeId ? keepId : e.target,
        }));
        currentNodes = currentNodes.filter((n) => n.id !== mergeId);
      }
    }
  }

  onMount(() => {
    if (kgSnapshot?.dream_suggestions) {
      dreamSuggestions = kgSnapshot.dream_suggestions;
    }
  });
</script>

<div class="kg-container" class:fullscreen={isFullscreen}>
  <!-- Top Control Toolbar -->
  <GraphToolbar
    nodes={currentNodes}
    {layoutMode}
    {isSimulating}
    {isFullscreen}
    onSearchSelect={handleSelectNode}
    onZoomIn={() => canvasRef?.zoomIn()}
    onZoomOut={() => canvasRef?.zoomOut()}
    onResetView={() => canvasRef?.resetView()}
    onFitToView={() => canvasRef?.fitToView()}
    onChangeLayout={handleLayoutChange}
    onToggleSimulation={() => (isSimulating = !isSimulating)}
    onToggleFullscreen={() => (isFullscreen = !isFullscreen)}
  />

  <!-- Three-Section Layout -->
  <div class="main-layout">
    <!-- LEFT SIDEBAR -->
    <LeftSidebar
      {domains}
      bind:selectedDomainId
      nodes={currentNodes}
      bind:selectedCategories
      bind:masteryFilter
      {dreamSuggestions}
      {isTauri}
      onSelectDomain={(id) => (selectedDomainId = id)}
      onTriggerDreaming={handleTriggerDreaming}
      onReviewDream={handleReviewDream}
      onMergeConcepts={handleMergeConcepts}
    />

    <!-- CENTER CANVAS AREA -->
    <main class="canvas-area">
      <KnowledgeGraphCanvas
        bind:this={canvasRef}
        bind:nodes={currentNodes}
        bind:edges={currentEdges}
        bind:selectedNodeId
        bind:hoveredNodeId
        {layoutMode}
        {isSimulating}
        onSelectNode={handleSelectNode}
        onDeselect={() => (selectedNodeId = null)}
      />
    </main>

    <!-- RIGHT SIDEBAR INSPECTOR -->
    <RightSidebar
      {selectedNode}
      allNodes={currentNodes}
      edges={currentEdges}
      {currentDomain}
      onSelectNode={handleSelectNode}
      onToggleMastered={handleToggleMastered}
      onFocusNode={(id) => canvasRef?.focusOnNode(id, 1.4)}
      {onNavigateToVideo}
    />
  </div>
</div>

<style>
  .kg-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    min-height: calc(100vh - 120px);
    box-sizing: border-box;
  }

  .kg-container.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    background: #000000;
    padding: 14px;
    min-height: 100vh;
  }

  .main-layout {
    display: flex;
    gap: 14px;
    flex: 1;
    min-height: 600px;
    height: calc(100vh - 180px);
  }

  .canvas-area {
    flex: 1;
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: #070b14;
    border: 1px solid #1e293b;
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.6);
  }

  @media (max-width: 1100px) {
    .main-layout {
      flex-direction: column;
      height: auto;
    }
    .canvas-area {
      min-height: 500px;
    }
  }
</style>
