<script lang="ts">
  import {
    CATEGORY_STYLES,
    MASTERED_STYLE,
    type GraphDomain,
    type GraphEdge,
    type GraphNode,
    type NodeCategory,
  } from "./types";

  let {
    selectedNode = null as GraphNode | null,
    allNodes = [],
    edges = [],
    currentDomain = null as GraphDomain | null,
    onSelectNode,
    onToggleMastered,
    onFocusNode,
    onNavigateToVideo,
  }: {
    selectedNode: GraphNode | null;
    allNodes: GraphNode[];
    edges: GraphEdge[];
    currentDomain: GraphDomain | null;
    onSelectNode?: (node: GraphNode) => void;
    onToggleMastered?: (nodeId: string) => void;
    onFocusNode?: (nodeId: string) => void;
    onNavigateToVideo?: (lectureId: string, startMs?: number) => void;
  } = $props();

  // Find incoming and outgoing edges for the selected node
  let nodeRelationships = $derived.by(() => {
    if (!selectedNode) return { incoming: [], outgoing: [], related: [] };

    const nodeMap = new Map<string, GraphNode>();
    for (const n of allNodes) nodeMap.set(n.id, n);

    const incoming: Array<{ edge: GraphEdge; node: GraphNode }> = [];
    const outgoing: Array<{ edge: GraphEdge; node: GraphNode }> = [];
    const related: Array<{ edge: GraphEdge; node: GraphNode }> = [];

    for (const e of edges) {
      if (e.target === selectedNode.id) {
        const src = nodeMap.get(e.source);
        if (src) {
          if (e.relation === "depends_on" || e.relation === "part_of") {
            incoming.push({ edge: e, node: src });
          } else {
            related.push({ edge: e, node: src });
          }
        }
      } else if (e.source === selectedNode.id) {
        const tgt = nodeMap.get(e.target);
        if (tgt) {
          if (e.relation === "leads_to" || e.relation === "contains") {
            outgoing.push({ edge: e, node: tgt });
          } else {
            related.push({ edge: e, node: tgt });
          }
        }
      }
    }

    return { incoming, outgoing, related };
  });

  function formatTimeMs(ms?: number): string {
    if (ms === undefined || ms === null) return "00:00";
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
</script>

<aside class="sidebar">
  {#if selectedNode}
    {@const style = selectedNode.mastered
      ? MASTERED_STYLE
      : CATEGORY_STYLES[selectedNode.category] ?? CATEGORY_STYLES.main}

    <!-- Header & Badge -->
    <div class="inspector-header">
      <div class="badge-row">
        <span
          class="cat-badge"
          style="background: {style.badgeBg}; color: {style.badgeText}; border-color: {style.borderColor};"
        >
          {style.name}
        </span>
        <div class="importance-stars" title="Importance Level {selectedNode.importance}/5">
          {#each Array(5) as _, i}
            <span class="star" class:filled={i < selectedNode.importance}>★</span>
          {/each}
        </div>
      </div>

      <h2 class="node-title">{selectedNode.label}</h2>

      <!-- Mastery toggle button -->
      <button
        class="mastery-toggle-btn"
        class:is-mastered={selectedNode.mastered}
        onclick={() => onToggleMastered?.(selectedNode.id)}
      >
        <span class="toggle-icon">{selectedNode.mastered ? "✓" : "○"}</span>
        <span>{selectedNode.mastered ? "Mastered Concept" : "Mark as Mastered"}</span>
      </button>
    </div>

    <!-- Summary & Comprehensive Description -->
    <div class="content-block">
      <h3 class="block-heading">Core Overview</h3>
      <p class="summary-text">{selectedNode.summary}</p>
      {#if selectedNode.description && selectedNode.description !== selectedNode.summary}
        <p class="detailed-text">{selectedNode.description}</p>
      {/if}
    </div>

    <!-- Tags & Sub-attributes -->
    {#if selectedNode.tags && selectedNode.tags.length > 0}
      <div class="content-block">
        <h3 class="block-heading">Key Concept Tags</h3>
        <div class="tag-cloud">
          {#each selectedNode.tags as t}
            <span class="tag-pill">#{t}</span>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Real-world Applications & Examples -->
    {#if selectedNode.applications && selectedNode.applications.length > 0}
      <div class="content-block">
        <h3 class="block-heading">Real-World Applications</h3>
        <ul class="bullet-list">
          {#each selectedNode.applications as app}
            <li>{app}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- Connected Knowledge Relationships -->
    <div class="content-block">
      <h3 class="block-heading">Knowledge Connections</h3>

      {#if nodeRelationships.incoming.length > 0}
        <div class="rel-group">
          <span class="rel-label">Prerequisites & Inputs:</span>
          <div class="rel-chips">
            {#each nodeRelationships.incoming as item}
              <button
                class="rel-chip"
                onclick={() => onSelectNode?.(item.node)}
                title={item.node.summary}
              >
                <span class="chip-dot" style="background: {CATEGORY_STYLES[item.node.category]?.color};"></span>
                <span>{item.node.label}</span>
                <span class="chip-rel">{item.edge.label || item.edge.relation}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if nodeRelationships.outgoing.length > 0}
        <div class="rel-group">
          <span class="rel-label">Downstream & Contains:</span>
          <div class="rel-chips">
            {#each nodeRelationships.outgoing as item}
              <button
                class="rel-chip"
                onclick={() => onSelectNode?.(item.node)}
                title={item.node.summary}
              >
                <span class="chip-dot" style="background: {CATEGORY_STYLES[item.node.category]?.color};"></span>
                <span>{item.node.label}</span>
                <span class="chip-rel">{item.edge.label || item.edge.relation}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if nodeRelationships.related.length > 0}
        <div class="rel-group">
          <span class="rel-label">Related Concepts:</span>
          <div class="rel-chips">
            {#each nodeRelationships.related as item}
              <button
                class="rel-chip"
                onclick={() => onSelectNode?.(item.node)}
                title={item.node.summary}
              >
                <span class="chip-dot" style="background: {CATEGORY_STYLES[item.node.category]?.color};"></span>
                <span>{item.node.label}</span>
                <span class="chip-rel">{item.edge.label || item.edge.relation}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if nodeRelationships.incoming.length === 0 && nodeRelationships.outgoing.length === 0 && nodeRelationships.related.length === 0}
        <p class="muted-note">No direct linked neighbors found in this subgraph view.</p>
      {/if}
    </div>

    <!-- Educational Traceability (LearningEdge Source & Video) -->
    {#if selectedNode.lectureId || selectedNode.notePointId || selectedNode.videoStartMs !== undefined}
      <div class="content-block trace-box">
        <h3 class="block-heading">Lecture Traceability</h3>
        {#if selectedNode.lectureId}
          <div class="trace-row">
            <span class="trace-label">Source Lecture:</span>
            <span class="trace-value">{selectedNode.lectureId}</span>
          </div>
        {/if}
        {#if selectedNode.notePointId}
          <div class="trace-row">
            <span class="trace-label">Note Point:</span>
            <span class="trace-value code">{selectedNode.notePointId}</span>
          </div>
        {/if}
        {#if selectedNode.sourceRefs && selectedNode.sourceRefs.length > 0}
          <div class="trace-row">
            <span class="trace-label">Source Segments:</span>
            <span class="trace-value">{selectedNode.sourceRefs.join(", ")}</span>
          </div>
        {/if}
        {#if selectedNode.videoStartMs !== undefined && selectedNode.videoEndMs !== undefined}
          <div class="trace-row">
            <span class="trace-label">Video Segment:</span>
            <span class="trace-value time">
              {formatTimeMs(selectedNode.videoStartMs)} – {formatTimeMs(selectedNode.videoEndMs)}
            </span>
          </div>
          <button
            class="video-jump-btn"
            onclick={() => onNavigateToVideo?.(selectedNode.lectureId || "", selectedNode.videoStartMs)}
          >
            ▶ Play Video Segment in Portal
          </button>
        {/if}
      </div>
    {/if}

    <!-- Quick action buttons -->
    <div class="action-footer">
      <button class="btn-focus" onclick={() => onFocusNode?.(selectedNode.id)}>
        <span>Center in Canvas</span>
      </button>
    </div>
  {:else}
    <!-- No Node Selected: Domain Summary View -->
    <div class="empty-inspector">
      <div class="empty-icon">✧</div>
      <h2 class="empty-title">{currentDomain?.name || "Knowledge Graph Overview"}</h2>
      <p class="empty-desc">
        {currentDomain?.description ||
          "Select any concept in the network to inspect detailed theory, prerequisite chains, and video references."}
      </p>

      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-value">{allNodes.length}</span>
          <span class="metric-label">Concepts</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{edges.length}</span>
          <span class="metric-label">Relationships</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">{allNodes.filter((n) => n.mastered).length}</span>
          <span class="metric-label">Mastered</span>
        </div>
      </div>

      <div class="quick-guide">
        <h4 class="guide-title">Interactive Navigation:</h4>
        <ul class="guide-list">
          <li><strong>Click:</strong> Inspect node relationships and theory.</li>
          <li><strong>Double-Click:</strong> Smoothly zoom and center camera.</li>
          <li><strong>Drag:</strong> Move nodes freely with spring damping.</li>
          <li><strong>Scroll Wheel:</strong> Zoom in and out across concepts.</li>
        </ul>
      </div>
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    width: 330px;
    background: #0a0f1d;
    border: 1px solid #1e293b;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px;
    box-sizing: border-box;
    overflow-y: auto;
    max-height: calc(100vh - 120px);
  }

  .inspector-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 14px;
  }

  .badge-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .cat-badge {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid;
  }

  .importance-stars {
    display: flex;
    gap: 2px;
  }

  .star {
    font-size: 13px;
    color: #334155;
  }

  .star.filled {
    color: #fbbf24;
    text-shadow: 0 0 6px rgba(251, 191, 36, 0.5);
  }

  .node-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.3;
  }

  .mastery-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #111827;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mastery-toggle-btn:hover {
    border-color: #10b981;
    color: #ffffff;
  }

  .mastery-toggle-btn.is-mastered {
    background: rgba(16, 185, 129, 0.15);
    border-color: #10b981;
    color: #34d399;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.25);
  }

  .toggle-icon {
    font-size: 14px;
  }

  .content-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .block-heading {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #94a3b8;
  }

  .summary-text {
    margin: 0;
    font-size: 13px;
    color: #e2e8f0;
    line-height: 1.5;
  }

  .detailed-text {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.5;
  }

  .tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag-pill {
    font-size: 11px;
    background: #1e293b;
    color: #38bdf8;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .bullet-list {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    color: #cbd5e1;
    line-height: 1.5;
  }

  .rel-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }

  .rel-label {
    font-size: 11px;
    color: #64748b;
    font-weight: 600;
  }

  .rel-chips {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rel-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    color: #ffffff;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .rel-chip:hover {
    background: #1e293b;
    border-color: #38bdf8;
  }

  .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chip-rel {
    margin-left: auto;
    font-size: 10px;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.05);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .trace-box {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 12px;
  }

  .trace-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    margin-bottom: 6px;
  }

  .trace-label {
    color: #64748b;
  }

  .trace-value {
    color: #e2e8f0;
    font-weight: 500;
  }

  .trace-value.code {
    font-family: monospace;
    color: #38bdf8;
  }

  .trace-value.time {
    color: #fbbf24;
    font-weight: 600;
  }

  .video-jump-btn {
    width: 100%;
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    border: none;
    border-radius: 6px;
    padding: 7px;
    cursor: pointer;
    margin-top: 4px;
    transition: all 0.15s ease;
  }

  .video-jump-btn:hover {
    background: #0284c7;
    box-shadow: 0 0 10px rgba(2, 132, 199, 0.4);
  }

  .action-footer {
    display: flex;
    gap: 8px;
    margin-top: auto;
    padding-top: 8px;
  }

  .btn-focus {
    width: 100%;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-focus:hover {
    background: #334155;
    border-color: #38bdf8;
  }

  .empty-inspector {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
    padding: 20px 0;
  }

  .empty-icon {
    font-size: 32px;
    color: #38bdf8;
    text-shadow: 0 0 16px rgba(56, 189, 248, 0.6);
  }

  .empty-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
  }

  .empty-desc {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.5;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    width: 100%;
    margin-top: 6px;
  }

  .metric-card {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 10px 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .metric-value {
    font-size: 16px;
    font-weight: 700;
    color: #ffffff;
  }

  .metric-label {
    font-size: 10px;
    color: #64748b;
    text-transform: uppercase;
  }

  .quick-guide {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 12px;
    width: 100%;
    text-align: left;
    margin-top: 8px;
    box-sizing: border-box;
  }

  .guide-title {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .guide-list {
    margin: 0;
    padding-left: 18px;
    font-size: 11px;
    color: #cbd5e1;
    line-height: 1.6;
  }

  .muted-note {
    font-size: 12px;
    color: #64748b;
    font-style: italic;
    margin: 0;
  }
</style>
