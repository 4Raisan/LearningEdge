<script lang="ts">
  import type { GraphNode, LayoutMode } from "./types";

  let {
    nodes = [],
    layoutMode = "force" as LayoutMode,
    isSimulating = true,
    isFullscreen = false,
    onSearchSelect,
    onZoomIn,
    onZoomOut,
    onResetView,
    onFitToView,
    onChangeLayout,
    onToggleSimulation,
    onToggleFullscreen,
  }: {
    nodes: GraphNode[];
    layoutMode: LayoutMode;
    isSimulating: boolean;
    isFullscreen: boolean;
    onSearchSelect?: (node: GraphNode) => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onResetView?: () => void;
    onFitToView?: () => void;
    onChangeLayout?: (mode: LayoutMode) => void;
    onToggleSimulation?: () => void;
    onToggleFullscreen?: () => void;
  } = $props();

  let searchQuery = $state("");
  let isSearchFocused = $state(false);

  let searchResults = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter(
        (n) =>
          !n.hidden &&
          (n.label.toLowerCase().includes(q) ||
            n.summary.toLowerCase().includes(q) ||
            n.category.toLowerCase().includes(q) ||
            (n.aliases && n.aliases.some((a) => a.toLowerCase().includes(q))))
      )
      .slice(0, 8);
  });

  function selectResult(node: GraphNode) {
    searchQuery = "";
    isSearchFocused = false;
    onSearchSelect?.(node);
  }
</script>

<div class="toolbar">
  <!-- Search input with autocomplete dropdown -->
  <div class="search-container">
    <div class="search-box">
      <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clip-rule="evenodd"
        />
      </svg>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search concepts, mechanisms, applications..."
        class="search-input"
        onfocus={() => (isSearchFocused = true)}
        onblur={() => setTimeout(() => (isSearchFocused = false), 200)}
      />
      {#if searchQuery}
        <button class="clear-btn" onclick={() => (searchQuery = "")}>✕</button>
      {/if}
    </div>

    {#if isSearchFocused && searchResults.length > 0}
      <div class="search-dropdown">
        {#each searchResults as r}
          <button class="search-item" onclick={() => selectResult(r)}>
            <div class="item-title">
              <span class="badge-dot {r.category}"></span>
              <strong>{r.label}</strong>
              <span class="item-category">{r.category}</span>
            </div>
            <div class="item-summary">{r.summary}</div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Layout selector -->
  <div class="btn-group">
    <button
      class="tool-btn"
      class:active={layoutMode === "force"}
      onclick={() => onChangeLayout?.("force")}
      title="Organic Force-Directed Layout"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
        <path d="M10 2a2 2 0 100 4 2 2 0 000-4zM4 9a2 2 0 100 4 2 2 0 000-4zM16 9a2 2 0 100 4 2 2 0 000-4zM10 14a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
      <span>Force</span>
    </button>
    <button
      class="tool-btn"
      class:active={layoutMode === "hierarchical"}
      onclick={() => onChangeLayout?.("hierarchical")}
      title="Hierarchical Tree Flow"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
        <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm2 5a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm3 5a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
      </svg>
      <span>Tree</span>
    </button>
    <button
      class="tool-btn"
      class:active={layoutMode === "radial"}
      onclick={() => onChangeLayout?.("radial")}
      title="Concentric Orbital Layout"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-3a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
      </svg>
      <span>Radial</span>
    </button>
  </div>

  <!-- Physics simulation freeze/unfreeze -->
  {#if layoutMode === "force"}
    <button
      class="tool-btn"
      class:active={isSimulating}
      onclick={() => onToggleSimulation?.()}
      title={isSimulating ? "Pause Physics Simulation" : "Resume Physics Simulation"}
    >
      <span class="sim-dot" class:running={isSimulating}></span>
      <span>{isSimulating ? "Live Physics" : "Frozen"}</span>
    </button>
  {/if}

  <!-- Zoom & View controls -->
  <div class="btn-group">
    <button class="tool-btn icon-only" onclick={() => onZoomIn?.()} title="Zoom In (+)">
      <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
      </svg>
    </button>
    <button class="tool-btn icon-only" onclick={() => onZoomOut?.()} title="Zoom Out (-)">
      <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
        <path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" />
      </svg>
    </button>
    <button class="tool-btn" onclick={() => onFitToView?.()} title="Fit All Nodes in View">
      <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
        <path d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zM16 3a1 1 0 011 1v3a1 1 0 11-2 0V5h-2a1 1 0 110-2h3zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zM16 17a1 1 0 001-1v-3a1 1 0 10-2 0v2h-2a1 1 0 100 2h3z" />
      </svg>
      <span>Fit</span>
    </button>
    <button class="tool-btn" onclick={() => onResetView?.()} title="Reset to Center (100%)">
      <span>1:1</span>
    </button>
  </div>

  <!-- Fullscreen toggle -->
  <button
    class="tool-btn icon-only"
    class:active={isFullscreen}
    onclick={() => onToggleFullscreen?.()}
    title="Toggle Fullscreen Canvas"
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
      {#if isFullscreen}
        <path fill-rule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06L5.44 6.5H3a.75.75 0 000 1.5h4.5A.75.75 0 008.25 7.25V2.75a.75.75 0 00-1.5 0v2.44L3.28 2.22zm13.44 0a.75.75 0 00-1.06 0l-3.44 3.44V3.22a.75.75 0 00-1.5 0v4.5c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-2.44l3.44-3.44a.75.75 0 000-1.06zM7.25 11.75a.75.75 0 00-.75.75v2.44l-3.44-3.44a.75.75 0 00-1.06 1.06l3.44 3.44H3a.75.75 0 000 1.5h4.5a.75.75 0 00.75-.75v-4.5a.75.75 0 00-.75-.75zm5.5 0a.75.75 0 00-.75.75v4.5c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-2.44l3.44-3.44a.75.75 0 00-1.06-1.06l-3.44 3.44V12.5a.75.75 0 00-.75-.75z" clip-rule="evenodd" />
      {:else}
        <path fill-rule="evenodd" d="M3.25 3A.75.75 0 002.5 3.75v4a.75.75 0 001.5 0v-2.44l3.72 3.72a.75.75 0 001.06-1.06L5.06 4.25h2.44a.75.75 0 000-1.5h-4.25zM16.75 3a.75.75 0 01.75.75v4.25a.75.75 0 01-1.5 0V5.56l-3.72 3.72a.75.75 0 01-1.06-1.06l3.72-3.72h-2.44a.75.75 0 010-1.5h4.25zM7.78 12.22a.75.75 0 010 1.06l-3.72 3.72h2.44a.75.75 0 010 1.5h-4.25a.75.75 0 01-.75-.75v-4.25a.75.75 0 011.5 0v2.44l3.72-3.72a.75.75 0 011.06 0zm4.44 0a.75.75 0 011.06 0l3.72 3.72v-2.44a.75.75 0 011.5 0v4.25a.75.75 0 01-.75.75h-4.25a.75.75 0 010-1.5h2.44l-3.72-3.72a.75.75 0 010-1.06z" clip-rule="evenodd" />
      {/if}
    </svg>
  </button>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #0a0f1d;
    border: 1px solid #1e293b;
    border-radius: 12px;
    flex-wrap: wrap;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .search-container {
    position: relative;
    flex: 1 1 240px;
    max-width: 380px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 6px 12px;
    transition: all 0.2s ease;
  }

  .search-box:focus-within {
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  .search-icon {
    width: 16px;
    height: 16px;
    color: #94a3b8;
    flex-shrink: 0;
  }

  .search-input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-size: 13px;
  }

  .search-input::placeholder {
    color: #64748b;
  }

  .clear-btn {
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 12px;
    padding: 2px 4px;
  }

  .clear-btn:hover {
    color: #ffffff;
  }

  .search-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 10px;
    max-height: 320px;
    overflow-y: auto;
    z-index: 50;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
  }

  .search-item {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-bottom: 1px solid #1e293b;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    transition: background 0.15s ease;
  }

  .search-item:hover {
    background: #1e293b;
  }

  .item-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ffffff;
    font-size: 13px;
  }

  .item-category {
    font-size: 10px;
    text-transform: uppercase;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 6px;
    border-radius: 4px;
    margin-left: auto;
  }

  .item-summary {
    font-size: 11px;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .badge-dot.central { background: #f59e0b; }
  .badge-dot.main { background: #00f0ff; }
  .badge-dot.subtopic { background: #a855f7; }
  .badge-dot.related { background: #ec4899; }
  .badge-dot.supporting { background: #3b82f6; }
  .badge-dot.definition { background: #14b8a6; }
  .badge-dot.example { background: #818cf8; }
  .badge-dot.application { background: #f97316; }

  .btn-group {
    display: flex;
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 2px;
    gap: 2px;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    border-radius: 6px;
    padding: 6px 10px;
    color: #94a3b8;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .tool-btn.icon-only {
    padding: 6px 8px;
  }

  .tool-btn:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.06);
  }

  .tool-btn.active {
    background: #38bdf8;
    color: #082f49;
    font-weight: 700;
  }

  .btn-icon {
    width: 14px;
    height: 14px;
  }

  .sim-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #64748b;
  }

  .sim-dot.running {
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
  }
</style>
