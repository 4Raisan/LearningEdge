<script lang="ts">
  import {
    CATEGORY_STYLES,
    MASTERED_STYLE,
    type GraphDomain,
    type GraphNode,
    type NodeCategory,
  } from "./types";
  import type { DreamSuggestion } from "../tauriApi";

  let {
    domains = [],
    selectedDomainId = $bindable("domain-ai"),
    nodes = [],
    selectedCategories = $bindable(new Set<NodeCategory>()),
    masteryFilter = $bindable<"all" | "mastered" | "learning">("all"),
    dreamSuggestions = [],
    isTauri = false,
    onSelectDomain,
    onTriggerDreaming,
    onReviewDream,
    onMergeConcepts,
  }: {
    domains: GraphDomain[];
    selectedDomainId: string;
    nodes: GraphNode[];
    selectedCategories: Set<NodeCategory>;
    masteryFilter: "all" | "mastered" | "learning";
    dreamSuggestions?: DreamSuggestion[];
    isTauri?: boolean;
    onSelectDomain?: (domainId: string) => void;
    onTriggerDreaming?: () => void;
    onReviewDream?: (id: string, accept: boolean) => void;
    onMergeConcepts?: (keepId: string, mergeId: string) => void;
  } = $props();

  let isDreamingOpen = $state(false);
  let isMergeOpen = $state(false);
  let mergeKeepId = $state("");
  let mergeDropId = $state("");

  // Category counts
  let categoryCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes) {
      counts[n.category] = (counts[n.category] || 0) + 1;
    }
    return counts;
  });

  // Mastery statistics
  let totalVisible = $derived(nodes.length);
  let masteredCount = $derived(nodes.filter((n) => n.mastered).length);
  let masteryPercent = $derived(
    totalVisible > 0 ? Math.round((masteredCount / totalVisible) * 100) : 0
  );

  function toggleCategory(cat: NodeCategory) {
    const next = new Set(selectedCategories);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    selectedCategories = next;
  }

  function selectAllCategories() {
    selectedCategories = new Set<NodeCategory>([
      "central",
      "main",
      "subtopic",
      "related",
      "supporting",
      "definition",
      "example",
      "application",
    ]);
  }

  function clearAllCategories() {
    selectedCategories = new Set<NodeCategory>();
  }

  function handleMergeSubmit() {
    if (!mergeKeepId || !mergeDropId || mergeKeepId === mergeDropId) return;
    onMergeConcepts?.(mergeKeepId, mergeDropId);
    mergeKeepId = "";
    mergeDropId = "";
  }
</script>

<aside class="sidebar">
  <!-- Topic Domain Selector -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Knowledge Domain</span>
      <span class="badge-count">{domains.length} available</span>
    </div>
    <div class="domain-list">
      {#each domains as d}
        <button
          class="domain-card"
          class:active={selectedDomainId === d.id}
          onclick={() => {
            selectedDomainId = d.id;
            onSelectDomain?.(d.id);
          }}
        >
          <div class="domain-title">
            <span class="domain-icon">✦</span>
            <strong>{d.name}</strong>
          </div>
          <div class="domain-desc">{d.description}</div>
        </button>
      {/each}
    </div>
  </div>

  <!-- Mastery Progress Widget -->
  <div class="section progress-box">
    <div class="section-header">
      <span class="section-title">Mastery Progress</span>
      <span class="mastery-score">{masteredCount} / {totalVisible} ({masteryPercent}%)</span>
    </div>
    <div class="progress-bar-bg">
      <div
        class="progress-bar-fill"
        style="width: {masteryPercent}%;"
      ></div>
    </div>
    <div class="mastery-filters">
      <button
        class="filter-pill"
        class:active={masteryFilter === "all"}
        onclick={() => (masteryFilter = "all")}
      >
        All Concepts
      </button>
      <button
        class="filter-pill mastered"
        class:active={masteryFilter === "mastered"}
        onclick={() => (masteryFilter = "mastered")}
      >
        Mastered ({masteredCount})
      </button>
      <button
        class="filter-pill learning"
        class:active={masteryFilter === "learning"}
        onclick={() => (masteryFilter = "learning")}
      >
        Learning ({totalVisible - masteredCount})
      </button>
    </div>
  </div>

  <!-- Category Filter Controls -->
  <div class="section">
    <div class="section-header">
      <span class="section-title">Categories & Types</span>
      <div class="header-actions">
        <button class="text-link" onclick={selectAllCategories}>All</button>
        <span class="sep">·</span>
        <button class="text-link" onclick={clearAllCategories}>None</button>
      </div>
    </div>

    <div class="category-list">
      {#each (Object.keys(CATEGORY_STYLES) as NodeCategory[]) as cat}
        {@const style = CATEGORY_STYLES[cat]}
        {@const count = categoryCounts[cat] || 0}
        {@const isChecked = selectedCategories.size === 0 || selectedCategories.has(cat)}
        <button
          class="cat-row"
          class:inactive={!isChecked}
          onclick={() => toggleCategory(cat)}
        >
          <span
            class="cat-dot"
            style="background: {style.color}; box-shadow: 0 0 8px {style.color};"
          ></span>
          <span class="cat-label">{style.name}</span>
          <span class="cat-count">{count}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Dreaming & Graph Discovery -->
  <div class="section">
    <button
      class="accordion-header"
      onclick={() => (isDreamingOpen = !isDreamingOpen)}
    >
      <div class="header-left">
        <span class="dream-star">✨</span>
        <span class="section-title">Dreaming & Synthesis</span>
      </div>
      <span class="badge-count">{dreamSuggestions.length}</span>
    </button>

    {#if isDreamingOpen}
      <div class="dreaming-body">
        <p class="muted-note">
          Autonomous graph reasoning searching across lectures for latent connections and gaps.
        </p>
        <button class="btn-action" onclick={() => onTriggerDreaming?.()}>
          <span>Run Dreaming Algorithm</span>
        </button>

        {#if dreamSuggestions.length > 0}
          <div class="dream-list">
            {#each dreamSuggestions as sug}
              <div class="dream-item">
                <div class="dream-header">
                  <strong>{sug.title}</strong>
                  <span class="dream-badge {sug.status}">{sug.status}</span>
                </div>
                <p class="dream-rationale">{sug.rationale}</p>
                {#if sug.status === "pending"}
                  <div class="dream-actions">
                    <button
                      class="btn-sm accept"
                      onclick={() => onReviewDream?.(sug.id, true)}
                    >
                      Accept
                    </button>
                    <button
                      class="btn-sm dismiss"
                      onclick={() => onReviewDream?.(sug.id, false)}
                    >
                      Dismiss
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">No pending dreaming suggestions.</div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Concept Consolidation & Merge -->
  <div class="section">
    <button
      class="accordion-header"
      onclick={() => (isMergeOpen = !isMergeOpen)}
    >
      <div class="header-left">
        <span class="merge-icon">⚯</span>
        <span class="section-title">Merge Concepts</span>
      </div>
      <span class="chevron">{isMergeOpen ? "▲" : "▼"}</span>
    </button>

    {#if isMergeOpen}
      <div class="merge-body">
        <p class="muted-note">Merge duplicate or overlapping concepts while preserving links.</p>
        <select class="select-field" bind:value={mergeKeepId}>
          <option value="">Keep primary concept...</option>
          {#each nodes as n}
            <option value={n.id}>{n.label}</option>
          {/each}
        </select>
        <select class="select-field" bind:value={mergeDropId}>
          <option value="">Merge duplicate concept...</option>
          {#each nodes as n}
            {#if n.id !== mergeKeepId}
              <option value={n.id}>{n.label}</option>
            {/if}
          {/each}
        </select>
        <button
          class="btn-action secondary"
          disabled={!mergeKeepId || !mergeDropId || mergeKeepId === mergeDropId}
          onclick={handleMergeSubmit}
        >
          Consolidate & Merge
        </button>
      </div>
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    width: 310px;
    background: #0a0f1d;
    border: 1px solid #1e293b;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    box-sizing: border-box;
    overflow-y: auto;
    max-height: calc(100vh - 120px);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 14px;
  }

  .section:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #e2e8f0;
  }

  .badge-count {
    font-size: 11px;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 7px;
    border-radius: 999px;
  }

  .domain-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .domain-card {
    text-align: left;
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .domain-card:hover {
    border-color: #38bdf8;
    background: #1e293b;
  }

  .domain-card.active {
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(15, 23, 42, 0.9));
    border-color: #38bdf8;
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.2);
  }

  .domain-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #ffffff;
  }

  .domain-icon {
    color: #38bdf8;
    font-size: 12px;
  }

  .domain-desc {
    font-size: 11px;
    color: #94a3b8;
    margin-top: 4px;
    line-height: 1.4;
  }

  .progress-box {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 10px;
    padding: 12px;
  }

  .mastery-score {
    font-size: 12px;
    font-weight: 700;
    color: #10b981;
  }

  .progress-bar-bg {
    width: 100%;
    height: 6px;
    background: #1e293b;
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #10b981, #34d399);
    border-radius: 999px;
    transition: width 0.3s ease;
    box-shadow: 0 0 8px #10b981;
  }

  .mastery-filters {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }

  .filter-pill {
    flex: 1;
    background: transparent;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 4px 6px;
    font-size: 11px;
    color: #94a3b8;
    text-align: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .filter-pill:hover {
    color: #ffffff;
    border-color: #64748b;
  }

  .filter-pill.active {
    background: #ffffff;
    color: #000000;
    border-color: #ffffff;
    font-weight: 700;
  }

  .filter-pill.mastered.active {
    background: #10b981;
    color: #022c1b;
    border-color: #10b981;
  }

  .header-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .text-link {
    background: transparent;
    border: none;
    color: #38bdf8;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }

  .text-link:hover {
    text-decoration: underline;
  }

  .sep {
    color: #64748b;
    font-size: 11px;
  }

  .category-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cat-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 6px 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
    text-align: left;
  }

  .cat-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .cat-row.inactive {
    opacity: 0.35;
  }

  .cat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cat-label {
    flex: 1;
    font-size: 12px;
    color: #ffffff;
  }

  .cat-count {
    font-size: 11px;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.06);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .accordion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    width: 100%;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dream-star,
  .merge-icon {
    color: #fbbf24;
    font-size: 14px;
  }

  .chevron {
    color: #64748b;
    font-size: 10px;
  }

  .dreaming-body,
  .merge-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }

  .muted-note {
    font-size: 11px;
    color: #94a3b8;
    margin: 0;
    line-height: 1.4;
  }

  .btn-action {
    background: #38bdf8;
    color: #082f49;
    font-weight: 700;
    border: none;
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-action:hover {
    background: #7dd3fc;
  }

  .btn-action.secondary {
    background: #1e293b;
    color: #ffffff;
    border: 1px solid #334155;
  }

  .btn-action.secondary:hover:not(:disabled) {
    background: #334155;
  }

  .btn-action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dream-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 220px;
    overflow-y: auto;
  }

  .dream-item {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 6px;
    padding: 8px;
  }

  .dream-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #ffffff;
  }

  .dream-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 999px;
  }
  .dream-badge.pending { background: #451a03; color: #fbbf24; }
  .dream-badge.accepted { background: #064e3b; color: #34d399; }
  .dream-badge.dismissed { background: #334155; color: #94a3b8; }

  .dream-rationale {
    font-size: 11px;
    color: #94a3b8;
    margin: 4px 0 6px;
  }

  .dream-actions {
    display: flex;
    gap: 6px;
  }

  .btn-sm {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 6px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
  }
  .btn-sm.accept { background: #10b981; color: #022c1b; }
  .btn-sm.dismiss { background: #334155; color: #cbd5e1; }

  .empty-state {
    font-size: 11px;
    color: #64748b;
    font-style: italic;
    padding: 6px 0;
  }

  .select-field {
    width: 100%;
    background: #111827;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 6px 8px;
    color: #ffffff;
    font-size: 12px;
  }
</style>
