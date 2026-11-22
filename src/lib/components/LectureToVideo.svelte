<script lang="ts">
  interface LectureItem {
    id: string;
    title: string;
    content: string;
    submittedAt: string;
    charCount: number;
    wordCount: number;
    pinned: boolean;
  }

  // Recents list - starts empty per strict constraint (no mock data/sample items)
  let history = $state<LectureItem[]>([]);
  let selectedHistoryId = $state<string | null>(null);

  // Input state
  let lectureText = $state("");

  // Video generation portal state
  let isGenerating = $state(false);
  let hasGenerated = $state(false);
  let activeGenerationId = $state<string | null>(null);

  // Rename editing state
  let editingId = $state<string | null>(null);
  let editTitleText = $state("");

  // Derived metrics (strictly calculated from real user input, not fabricated)
  let charCount = $derived(lectureText.length);
  let wordCount = $derived(
    lectureText.trim() ? lectureText.trim().split(/\s+/).filter(Boolean).length : 0
  );

  // Group pinned chats at the top of Recents, followed by unpinned chats
  let sortedHistory = $derived([
    ...history.filter((item) => item.pinned),
    ...history.filter((item) => !item.pinned),
  ]);

  function handleSubmit() {
    const trimmed = lectureText.trim();
    if (!trimmed) return;

    // Trigger visual generation animation in the right-side portal
    isGenerating = true;
    hasGenerated = true;

    // Generate unique ID
    const newId = "lec_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
    activeGenerationId = newId;

    // Extract title from first line
    const firstLine = trimmed.split("\n")[0].trim();
    const title = firstLine.length > 50 ? firstLine.slice(0, 47) + "..." : firstLine || "Untitled Lecture";

    const newItem: LectureItem = {
      id: newId,
      title,
      content: trimmed,
      submittedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      charCount: trimmed.length,
      wordCount: trimmed.split(/\s+/).filter(Boolean).length,
      pinned: false,
    };

    // Add to recents (newest first)
    history = [newItem, ...history];
    selectedHistoryId = newId;
  }

  function handleKeydown(event: KeyboardEvent) {
    // Submit on Enter without Shift, or Ctrl+Enter / Cmd+Enter
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function selectHistory(item: LectureItem) {
    if (editingId === item.id) return;
    selectedHistoryId = item.id;
    lectureText = item.content;
  }

  function startNewLecture() {
    selectedHistoryId = null;
    lectureText = "";
    isGenerating = false;
    activeGenerationId = null;
    cancelRename();
  }

  function clearHistory() {
    history = [];
    selectedHistoryId = null;
    cancelRename();
  }

  function stopGenerating() {
    isGenerating = false;
  }

  // --- Recents Item Actions: Rename, Pin, Delete ---

  function focusInput(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function startRename(item: LectureItem, event?: MouseEvent | KeyboardEvent) {
    event?.stopPropagation();
    editingId = item.id;
    editTitleText = item.title;
  }

  function saveRename(id: string, event?: Event) {
    event?.stopPropagation();
    const trimmed = editTitleText.trim();
    if (trimmed) {
      history = history.map((item) =>
        item.id === id ? { ...item, title: trimmed } : item
      );
    }
    editingId = null;
    editTitleText = "";
  }

  function cancelRename(event?: Event) {
    event?.stopPropagation();
    editingId = null;
    editTitleText = "";
  }

  function handleRenameKeydown(event: KeyboardEvent, id: string) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      saveRename(id, event);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename(event);
    }
  }

  function togglePin(id: string, event?: MouseEvent) {
    event?.stopPropagation();
    history = history.map((item) =>
      item.id === id ? { ...item, pinned: !item.pinned } : item
    );
  }

  function deleteChat(id: string, event?: MouseEvent) {
    event?.stopPropagation();
    history = history.filter((item) => item.id !== id);
    if (selectedHistoryId === id) {
      selectedHistoryId = null;
    }
    if (editingId === id) {
      cancelRename();
    }
  }
</script>

<div class="lecture-screen">
  <!-- 1. LEFT SIDEBAR: Recents -->
  <aside class="sidebar" aria-label="Recents">
    <div class="sidebar-header">
      <div class="title-with-count">
        <h2>Recents</h2>
        <span class="count-pill">{history.length}</span>
      </div>
      <button
        class="icon-btn"
        title="Start fresh lecture input"
        aria-label="Start fresh lecture input"
        onclick={startNewLecture}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>New</span>
      </button>
    </div>

    <div class="history-content">
      {#if history.length === 0}
        <!-- Sensible empty state for Recents (no fake items) -->
        <div class="empty-state">
          <div class="empty-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <p class="empty-title">No Recents</p>
          <p class="empty-desc">Lectures submitted during this session will appear here.</p>
        </div>
      {:else}
        <div class="history-list">
          {#each sortedHistory as item (item.id)}
            <div
              class="history-card"
              class:selected={selectedHistoryId === item.id}
              class:pinned={item.pinned}
              role="button"
              tabindex="0"
              onclick={() => selectHistory(item)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectHistory(item); }}
            >
              <div class="card-top-row">
                <div class="card-meta">
                  {#if item.pinned}
                    <span class="pinned-badge" title="Pinned to top">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                      </svg>
                      PINNED
                    </span>
                  {/if}
                  <span class="card-time">{item.submittedAt}</span>
                  <span class="card-words">{item.wordCount} words</span>
                </div>

                <!-- Accessible action buttons: Pin/Unpin, Rename, Delete -->
                <div class="card-actions" role="toolbar" aria-label="Chat actions">
                  <button
                    class="card-action-btn"
                    class:is-pinned={item.pinned}
                    onclick={(e) => togglePin(item.id, e)}
                    title={item.pinned ? "Unpin chat" : "Pin chat to top"}
                    aria-label={item.pinned ? "Unpin chat" : "Pin chat to top"}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={item.pinned ? "currentColor" : "none"} stroke="currentColor" stroke-width="2">
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                    </svg>
                  </button>

                  <button
                    class="card-action-btn"
                    onclick={(e) => startRename(item, e)}
                    title="Rename chat"
                    aria-label="Rename chat"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                  </button>

                  <button
                    class="card-action-btn delete-btn"
                    onclick={(e) => deleteChat(item.id, e)}
                    title="Delete chat"
                    aria-label="Delete chat"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>

              {#if editingId === item.id}
                <!-- Inline Rename Editing Field -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div class="rename-inline-box" onclick={(e) => e.stopPropagation()} role="presentation">
                  <input
                    class="rename-input"
                    type="text"
                    bind:value={editTitleText}
                    onkeydown={(e) => handleRenameKeydown(e, item.id)}
                    aria-label="Edit chat title"
                    use:focusInput
                  />
                  <div class="rename-actions">
                    <button
                      class="rename-btn save"
                      onclick={(e) => saveRename(item.id, e)}
                      title="Save title (Enter)"
                      aria-label="Save title"
                    >
                      Save
                    </button>
                    <button
                      class="rename-btn cancel"
                      onclick={cancelRename}
                      title="Cancel editing (Escape)"
                      aria-label="Cancel editing"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {:else}
                <div class="card-title" title={item.title}>{item.title}</div>
              {/if}

              <div class="card-snippet">{item.content}</div>
            </div>
          {/each}
        </div>
        <div class="history-footer">
          <button class="clear-btn" onclick={clearHistory}>
            Clear Recents
          </button>
        </div>
      {/if}
    </div>
  </aside>

  <!-- 2. CENTRAL AREA: Lecture Text Input -->
  <section class="central-area" aria-label="Lecture Content Input">
    <div class="area-header">
      <div>
        <h2>Lecture Input</h2>
        <p class="area-subtitle">Type or paste lecture text, transcript, or study material</p>
      </div>
      {#if selectedHistoryId}
        <span class="loaded-badge">Recents Item Loaded</span>
      {/if}
    </div>

    <div class="input-card">
      <textarea
        class="lecture-textarea"
        bind:value={lectureText}
        onkeydown={handleKeydown}
        placeholder="Type or paste text about a lecture here... (Press Enter to submit, Shift+Enter for new line)"
        aria-label="Lecture text content"
      ></textarea>

      <div class="input-bottom-bar">
        <div class="input-metrics">
          <span class="metric-item"><strong>{wordCount}</strong> words</span>
          <span class="metric-divider">•</span>
          <span class="metric-item"><strong>{charCount}</strong> characters</span>
          <span class="metric-hint">Press <strong>Enter</strong> to submit · <strong>Shift+Enter</strong> for newline</span>
        </div>

        <div class="input-actions">
          {#if lectureText.length > 0}
            <button
              class="action-btn-secondary"
              onclick={() => { lectureText = ""; selectedHistoryId = null; }}
            >
              Clear
            </button>
          {/if}

          <button
            class="submit-btn"
            disabled={!lectureText.trim()}
            onclick={handleSubmit}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Submit Lecture</span>
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- 3. RIGHT-SIDE: Video-Generation Portal, Content Coverage, and Estimated Time -->
  <section class="portal-area" aria-label="Video Generation Portal">
    <div class="area-header">
      <div>
        <h2>Video Portal</h2>
        <p class="area-subtitle">Interactive visual generation interface</p>
      </div>
      <div class="portal-status-pill" class:active={isGenerating}>
        <span class="status-indicator-dot"></span>
        <span>{isGenerating ? "GENERATING" : "STANDBY"}</span>
      </div>
    </div>

    <!-- Portal Display Frame -->
    <div class="portal-frame" class:generating={isGenerating}>
      {#if isGenerating}
        <!-- Video-generation animation & visual effect (pure UI interaction) -->
        <div class="generation-viewport" role="img" aria-label="Video generation visual effect">
          <!-- Ambient grid matrix background -->
          <div class="grid-overlay"></div>

          <!-- Pulsing energy core and concentric orbital rings -->
          <div class="portal-orb-system">
            <div class="orbital-ring ring-1"></div>
            <div class="orbital-ring ring-2"></div>
            <div class="orbital-ring ring-3"></div>
            <div class="portal-core">
              <div class="core-pulse"></div>
            </div>
          </div>

          <!-- Vertical scanning laser beam -->
          <div class="scan-beam"></div>

          <!-- Motion-graphics wave bars -->
          <div class="waveform-container">
            <div class="wave-bar b1"></div>
            <div class="wave-bar b2"></div>
            <div class="wave-bar b3"></div>
            <div class="wave-bar b4"></div>
            <div class="wave-bar b5"></div>
            <div class="wave-bar b6"></div>
            <div class="wave-bar b7"></div>
            <div class="wave-bar b8"></div>
          </div>

          <!-- Generation info overlay -->
          <div class="generating-meta">
            <span class="gen-tag">UI INTERACTION ACTIVE</span>
            <span class="gen-title">Synthesizing explainer visuals</span>
          </div>

          <!-- Stop / Dismiss Control -->
          <button class="stop-effect-btn" onclick={stopGenerating}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"></rect>
            </svg>
            <span>Stop Effect</span>
          </button>
        </div>
      {:else}
        <!-- Sensible empty state for the video portal -->
        <div class="portal-empty-state">
          <div class="portal-empty-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
              <rect x="2" y="2" width="20" height="20" rx="4"></rect>
              <polygon points="10 8 16 12 10 16 10 8"></polygon>
            </svg>
          </div>
          <p class="portal-empty-title">Portal Standby</p>
          <p class="portal-empty-desc">
            Submit lecture text to trigger the video generation visual effect.
          </p>
        </div>
      {/if}
    </div>

    <!-- Below the portal: Content Coverage (shown after video generation) -->
    {#if hasGenerated}
      <div class="coverage-card">
        <div class="coverage-top-row">
          <span class="coverage-label">Lecture Content Coverage</span>
          <span class="coverage-badge">AWAITING ENGINE</span>
        </div>
        <div class="coverage-value-display">
          “Coverage: --% / 100%”
        </div>
        <p class="coverage-paragraph">
          This explainer video covers --% of the submitted lecture content. Once the coverage verification engine is active, the included material will be calculated and reported out of 100%.
        </p>
      </div>
    {/if}

    <!-- Below the portal: Estimated-time area -->
    <div class="estimated-time-card">
      <div class="est-top-row">
        <span class="est-label">Estimated Time</span>
        <span class="est-badge">AWAITING ENGINE</span>
      </div>
      <div class="est-value-display">
        “Estimated time will appear here.”
      </div>
      <p class="est-info-text">
        Render duration and encoding estimates will be calculated once connected to the pipeline.
      </p>
    </div>
  </section>
</div>

<style>
  /* =====================================================================
     Monochrome / Black-and-White Layout & Styling
     ===================================================================== */
  .lecture-screen {
    display: grid;
    grid-template-columns: 290px 1fr 390px;
    gap: 20px;
    width: 100%;
    min-height: calc(100vh - 120px);
    background: #000000;
    color: #ffffff;
    box-sizing: border-box;
  }

  /* ---------------- Common Section Headers ---------------- */
  .area-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
  }

  .area-header h2,
  .sidebar-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #ffffff;
  }

  .area-subtitle {
    margin: 2px 0 0;
    font-size: 12px;
    color: #888888;
  }

  /* ---------------- 1. Left Sidebar (Recents) ---------------- */
  .sidebar {
    display: flex;
    flex-direction: column;
    background: #090909;
    border: 1px solid #222222;
    border-radius: 10px;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid #1c1c1c;
    background: #0d0d0d;
  }

  .title-with-count {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .count-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: #1c1c1c;
    border: 1px solid #333333;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    color: #cccccc;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #181818;
    color: #ffffff;
    border: 1px solid #333333;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.15s, border-color 0.15s;
  }

  .icon-btn:hover {
    background: #242424;
    border-color: #555555;
  }

  .history-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    padding: 12px;
  }

  /* Recents Empty State */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px 16px;
    color: #777777;
  }

  .empty-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #121212;
    border: 1px dashed #2c2c2c;
    margin-bottom: 14px;
    color: #666666;
  }

  .empty-title {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
    color: #bbbbbb;
  }

  .empty-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    max-width: 200px;
  }

  /* Recents List */
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
  }

  .history-card {
    text-align: left;
    background: #111111;
    border: 1px solid #222222;
    border-radius: 8px;
    padding: 10px 12px;
    color: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }

  .history-card:hover {
    background: #181818;
    border-color: #444444;
  }

  .history-card.selected {
    background: #1b1b1b;
    border-color: #ffffff;
  }

  /* Visual distinction for pinned chats */
  .history-card.pinned {
    border-left: 3px solid #ffffff;
    background: #141414;
  }

  .history-card.pinned:hover {
    background: #1c1c1c;
  }

  .card-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #777777;
    flex-wrap: wrap;
  }

  .pinned-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #222222;
    color: #ffffff;
    border: 1px solid #444444;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .card-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: #777777;
    padding: 0;
    transition: all 0.15s;
  }

  .card-action-btn:hover {
    background: #242424;
    border-color: #3a3a3a;
    color: #ffffff;
  }

  .card-action-btn.is-pinned {
    color: #ffffff;
  }

  .card-action-btn.delete-btn:hover {
    color: #fb7185;
    border-color: rgba(251, 113, 133, 0.4);
    background: rgba(251, 113, 133, 0.1);
  }

  /* Inline Rename Editing Box */
  .rename-inline-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 4px 0 6px;
  }

  .rename-input {
    width: 100%;
    box-sizing: border-box;
    background: #000000;
    color: #ffffff;
    border: 1px solid #ffffff;
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 13px;
    font-weight: 600;
    outline: none;
  }

  .rename-actions {
    display: flex;
    gap: 6px;
  }

  .rename-btn {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }

  .rename-btn.save {
    background: #ffffff;
    color: #000000;
    border: 1px solid #ffffff;
  }

  .rename-btn.save:hover {
    background: #dddddd;
  }

  .rename-btn.cancel {
    background: #1f1f1f;
    color: #888888;
    border: 1px solid #333333;
  }

  .rename-btn.cancel:hover {
    color: #ffffff;
    border-color: #555555;
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }

  .card-snippet {
    font-size: 11px;
    color: #888888;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .history-footer {
    padding-top: 10px;
    border-top: 1px solid #1c1c1c;
    margin-top: 8px;
  }

  .clear-btn {
    width: 100%;
    background: transparent;
    color: #777777;
    border: 1px solid #222222;
    border-radius: 6px;
    padding: 6px;
    font-size: 11px;
    transition: color 0.15s, border-color 0.15s;
  }

  .clear-btn:hover {
    color: #ffffff;
    border-color: #444444;
  }

  /* ---------------- 2. Central Area (Input) ---------------- */
  .central-area {
    display: flex;
    flex-direction: column;
  }

  .loaded-badge {
    background: #1c1c1c;
    border: 1px solid #333333;
    color: #dddddd;
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 6px;
  }

  .input-card {
    display: flex;
    flex-direction: column;
    flex: 1;
    background: #090909;
    border: 1px solid #222222;
    border-radius: 10px;
    overflow: hidden;
    min-height: 420px;
  }

  .lecture-textarea {
    flex: 1;
    width: 100%;
    min-height: 320px;
    background: #000000;
    color: #ffffff;
    border: none;
    padding: 16px;
    font-size: 14px;
    line-height: 1.6;
    resize: none;
    outline: none;
    font-family: inherit;
  }

  .lecture-textarea::placeholder {
    color: #555555;
    font-style: normal;
  }

  .input-bottom-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #0d0d0d;
    border-top: 1px solid #1c1c1c;
    flex-wrap: wrap;
    gap: 12px;
  }

  .input-metrics {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #777777;
    flex-wrap: wrap;
  }

  .metric-item strong {
    color: #ffffff;
  }

  .metric-divider {
    color: #444444;
  }

  .metric-hint {
    color: #666666;
    margin-left: 6px;
  }

  .metric-hint strong {
    color: #999999;
  }

  .input-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-btn-secondary {
    background: #161616;
    color: #888888;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.15s;
  }

  .action-btn-secondary:hover {
    color: #ffffff;
    border-color: #444444;
  }

  .submit-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: #ffffff;
    color: #000000;
    border: 1px solid #ffffff;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .submit-btn:hover:not(:disabled) {
    background: #e0e0e0;
    border-color: #e0e0e0;
    transform: translateY(-1px);
  }

  .submit-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  /* ---------------- 3. Right-Side Video Portal ---------------- */
  .portal-area {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .portal-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: #141414;
    color: #777777;
    border: 1px solid #27272a;
    letter-spacing: 0.05em;
  }

  .portal-status-pill.active {
    background: #101010;
    color: #ffffff;
    border-color: #555555;
  }

  .status-indicator-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #555555;
  }

  .portal-status-pill.active .status-indicator-dot {
    background: #ffffff;
    box-shadow: 0 0 6px #ffffff;
    animation: beacon 1.4s infinite ease-in-out;
  }

  @keyframes beacon {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }

  /* Portal Frame */
  .portal-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    min-height: 230px;
    background: #090909;
    border: 1px solid #222222;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.3s;
  }

  .portal-frame.generating {
    border-color: #444444;
    box-shadow: 0 0 25px rgba(255, 255, 255, 0.06);
  }

  /* Portal Empty State */
  .portal-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    color: #666666;
  }

  .portal-empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 12px;
    background: #111111;
    border: 1px solid #222222;
    color: #555555;
    margin-bottom: 12px;
  }

  .portal-empty-title {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
    color: #aaaaaa;
  }

  .portal-empty-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: #666666;
    max-width: 240px;
  }

  /* Active Video-Generation Animation Viewport */
  .generation-viewport {
    position: relative;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at center, #151515 0%, #050505 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Background Grid Overlay */
  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 20px 20px;
    opacity: 0.8;
  }

  /* Concentric Rotating Orbital Rings & Core */
  .portal-orb-system {
    position: relative;
    width: 140px;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .orbital-ring {
    position: absolute;
    border-radius: 50%;
    border: 1px dashed rgba(255, 255, 255, 0.25);
  }

  .ring-1 {
    width: 130px;
    height: 130px;
    animation: spinClockwise 12s linear infinite;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .ring-2 {
    width: 95px;
    height: 95px;
    border-style: solid;
    border-width: 1px 1px 0 0;
    border-color: rgba(255, 255, 255, 0.45);
    animation: spinCounter 7s linear infinite;
  }

  .ring-3 {
    width: 65px;
    height: 65px;
    border-style: dotted;
    border-width: 2px;
    border-color: rgba(255, 255, 255, 0.35);
    animation: spinClockwise 4s linear infinite;
  }

  .portal-core {
    position: relative;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .core-pulse {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    animation: corePulse 2s ease-in-out infinite;
  }

  @keyframes spinClockwise {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes spinCounter {
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
  }

  @keyframes corePulse {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.6); opacity: 0.15; }
  }

  /* Laser Scanning Beam */
  .scan-beam {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9), transparent);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.7);
    animation: scanMotion 3s ease-in-out infinite;
  }

  @keyframes scanMotion {
    0% { top: 0%; opacity: 0; }
    15% { opacity: 1; }
    85% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }

  /* Equalizer / Motion Wave Bars */
  .waveform-container {
    position: absolute;
    bottom: 12px;
    left: 16px;
    right: 16px;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 4px;
    height: 24px;
  }

  .wave-bar {
    width: 3px;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 2px;
    animation: waveBounce 1.2s ease-in-out infinite;
  }

  .b1 { height: 6px; animation-delay: 0.0s; }
  .b2 { height: 14px; animation-delay: 0.2s; }
  .b3 { height: 20px; animation-delay: 0.4s; }
  .b4 { height: 10px; animation-delay: 0.1s; }
  .b5 { height: 18px; animation-delay: 0.3s; }
  .b6 { height: 12px; animation-delay: 0.5s; }
  .b7 { height: 22px; animation-delay: 0.25s; }
  .b8 { height: 8px; animation-delay: 0.15s; }

  @keyframes waveBounce {
    0%, 100% { transform: scaleY(0.4); opacity: 0.3; }
    50% { transform: scaleY(1); opacity: 0.9; }
  }

  /* Generation Metadata Overlay */
  .generating-meta {
    position: absolute;
    top: 12px;
    left: 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: none;
  }

  .gen-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #aaaaaa;
  }

  .gen-title {
    font-size: 11px;
    font-weight: 500;
    color: #ffffff;
  }

  .stop-effect-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(0, 0, 0, 0.75);
    color: #cccccc;
    border: 1px solid #333333;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 500;
    backdrop-filter: blur(4px);
    transition: all 0.15s;
    z-index: 2;
  }

  .stop-effect-btn:hover {
    background: #000000;
    color: #ffffff;
    border-color: #666666;
  }

  /* ---------------- Content Coverage Section ---------------- */
  .coverage-card {
    background: #090909;
    border: 1px solid #222222;
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .coverage-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .coverage-label {
    font-size: 12px;
    font-weight: 600;
    color: #888888;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .coverage-badge {
    font-size: 10px;
    font-weight: 600;
    color: #888888;
    background: #141414;
    border: 1px solid #262626;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.04em;
  }

  .coverage-value-display {
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    padding: 8px 10px;
    background: #111111;
    border: 1px dashed #333333;
    border-radius: 6px;
  }

  .coverage-paragraph {
    margin: 0;
    font-size: 12px;
    color: #a0a0a0;
    line-height: 1.5;
  }

  /* ---------------- Estimated-Time Area ---------------- */
  .estimated-time-card {
    background: #090909;
    border: 1px solid #222222;
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .est-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .est-label {
    font-size: 12px;
    font-weight: 600;
    color: #888888;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .est-badge {
    font-size: 10px;
    font-weight: 600;
    color: #888888;
    background: #141414;
    border: 1px solid #262626;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.04em;
  }

  .est-value-display {
    font-size: 14px;
    font-weight: 500;
    color: #ffffff;
    padding: 8px 10px;
    background: #111111;
    border: 1px dashed #333333;
    border-radius: 6px;
  }

  .est-info-text {
    margin: 2px 0 0;
    font-size: 11px;
    color: #666666;
    line-height: 1.4;
  }

  /* ---------------- Responsive Styles ---------------- */
  @media (max-width: 1080px) {
    .lecture-screen {
      grid-template-columns: 240px 1fr 340px;
      gap: 14px;
    }
  }

  @media (max-width: 900px) {
    .lecture-screen {
      grid-template-columns: 1fr;
      min-height: auto;
    }
    .sidebar {
      max-height: 360px;
    }
    .portal-frame {
      min-height: 220px;
    }
  }
</style>
