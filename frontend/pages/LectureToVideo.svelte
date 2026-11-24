<script lang="ts">
  import Divider from "../lib/components/Divider.svelte";
  import ModelPicker from "../lib/components/ModelPicker.svelte";
  import {savedSize,saveSize} from "../lib/layout";
  let collapsed=$state(localStorage.getItem("recents-collapsed")==="true"), recentWidth=$state(savedSize("recents",.14,.1,.25)), portalWidth=$state(savedSize("portal",.38,.25,.48));
  $effect(()=>{saveSize("recents",recentWidth);saveSize("portal",portalWidth);localStorage.setItem("recents-collapsed",String(collapsed))});
  export function resetLayout(){collapsed=false;recentWidth=.14;portalWidth=.38}

  let portrait=$state(false), videoTheme=$state("night");
  import { invokeTauri, isTauriRuntime, resolveVideoUrl, type RunArtifactsBundle } from "../lib/tauriApi";
  interface LectureItem {
    id: string;
    title: string;
    content: string;
    submittedAt: string;
    charCount: number;
    wordCount: number;
    pinned: boolean;
    status: string;
    stage?: string | null;
    error?: string | null;
    videoUrl?: string;
    videoPath?: string;
    durationMs?: number;
    coverage?: RunArtifactsBundle["coverage_report"];
    requiredPoints?: { id: string; title: string }[];
    exportedIds?: string[];
  }

  // Recents list - starts empty per strict constraint (no mock data/sample items)
  let history = $state<LectureItem[]>([]);
  let selectedHistoryId = $state<string | null>(null);

  // Input state
  let {settings=$bindable()}:{settings:import("../lib/studio").Preferences}=$props();
  let autoGraph=$state(true);
  let depth=$state<import("../lib/studio").Depth>("standard");
  let lectureText = $state("");

  // Video generation portal state
  let current = $derived(history.find((item) => item.id === selectedHistoryId));
  let points = $derived(current?.requiredPoints ?? []);
  let gaps = $derived(points.filter(point =>
    current?.coverage?.issues.some(issue => issue.note_point_id === point.id)
    || (current?.exportedIds && !current.exportedIds.includes(point.id))
  ));
  let covered = $derived(points.length - gaps.length);
  let isGenerating = $derived(current?.status === "queued" || current?.status === "running");
  const stageLabels: Record<string, string> = {
    ingest: "Reading the lecture",
    notes: "Extracting concepts and theories",
    verify_notes: "Checking concepts against the lecture",
    scene_plan: "Building the explainer scenes",
    coverage_check: "Checking concept coverage",
    verify_export: "Verifying rendered explanations",
    narration_and_render: "Generating narration and motion graphics",
  };

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

  function updateItem(id: string, patch: Partial<LectureItem>) {
    history = history.map((item) => item.id === id ? { ...item, ...patch } : item);
  }

  async function trackVideo(id: string, content: string) {
    try {
      if (!isTauriRuntime()) throw new Error("Open LearningEdge desktop to generate a video.");
      const { run_id } = await invokeTauri<{ run_id: string }>("run_lecture_text", { lectureText: content, settings: { notes:settings.notes, video:settings.video, depth, auto_graph:autoGraph, portrait, video_theme:videoTheme } });
      while (true) {
        const { run, video_manifest, coverage_report, verified_notes } = await invokeTauri<RunArtifactsBundle>("get_run_artifacts", { runId: run_id });
        updateItem(id, {
          status: run.status,
          stage: run.current_stage,
          error: run.error_message || run.held_reason,
          coverage: coverage_report,
          requiredPoints: verified_notes?.points.filter(point => point.required),
          exportedIds: video_manifest?.trace_index.filter(entry =>
            entry.video_segments.some(segment => segment.end_ms > segment.start_ms)
          ).map(entry => entry.note_point_id),
        });
        if (run.status === "completed") {
          if (!video_manifest) throw new Error("The export completed without a video file.");
          updateItem(id, {
            videoUrl: await resolveVideoUrl(video_manifest.video_path),
            videoPath: video_manifest.video_path,
            durationMs: video_manifest.total_duration_ms,
          });
          return;
        }
        if (run.status === "failed" || run.status === "held_for_review") return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      updateItem(id, { status: "failed", error: String(error) });
    }
  }

  function handleSubmit() {
    const trimmed = lectureText.trim();
    if (!trimmed || isGenerating) return;

    // Generate unique ID
    const newId = "lec_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);

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
      status: "queued",
    };

    // Add to recents (newest first)
    history = [newItem, ...history];
    selectedHistoryId = newId;
    void trackVideo(newId, trimmed);
  }

  function handleKeydown(event: KeyboardEvent) {
    // Submit on Enter without Shift, or Ctrl+Enter / Cmd+Enter
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
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
    cancelRename();
  }

  function clearHistory() {
    history = [];
    selectedHistoryId = null;
    cancelRename();
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

<div class="lecture-screen" class:collapsed style:--recent={collapsed?"44px":recentWidth*100+"%"} style:--portal={portalWidth*100+"%"}>
  <!-- 1. LEFT SIDEBAR: Recents -->
  <aside class="sidebar" aria-label="Recents">
    <div class="sidebar-header">
      <button class="fold" aria-label={collapsed?"Expand recents":"Collapse recents"} title={collapsed?"Expand recents":"Collapse recents"} onclick={()=>collapsed=!collapsed}>{collapsed?"›":"‹"}</button><div class="title-with-count">
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
        <span class="sr-only">New lecture</span>
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
  <Divider label="Resize recents" adjust={n=>{if(!collapsed)recentWidth=Math.max(.1,Math.min(.25,recentWidth+n))}}/><section class="central-area" aria-label="Lecture Content Input">
    <div class="area-header">
      <div>
        <h2>Lecture Input</h2>
        <p class="area-subtitle">Paste lecture material to create an explainer of its key concepts.</p>
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
        <div class="input-metrics">{#if lectureText.length}<button class="action-btn-secondary" title="Clear lecture input" aria-label="Clear lecture input" onclick={()=>{lectureText="";selectedHistoryId=null}}>×</button>{/if}
          <span class="metric-item"><strong>{wordCount}</strong> words</span>
          <span class="metric-divider">•</span>
          <span class="metric-item"><strong>{charCount}</strong> characters</span>
          <span class="metric-hint">Press <strong>Enter</strong> to submit · <strong>Shift+Enter</strong> for newline</span>
        </div>

        <div class="render-options"><label>Ratio <select bind:value={portrait}><option value={false}>16:9</option><option value={true}>9:16</option></select></label><label>Video theme <select bind:value={videoTheme}><option value="night">Night</option><option value="light">Light</option><option value="forest">Forest</option></select></label><label class="depth">Note depth <select bind:value={depth}><option value="brief">Brief</option><option value="standard">Standard</option><option value="deep">Deep</option></select></label></div>
        <div class="input-actions">
          <ModelPicker label="Lecture video" bind:choice={settings.video}/>
          <button
            class="submit-btn"
            disabled={!lectureText.trim() || isGenerating}
            onclick={handleSubmit}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Generate video</span>
          </button>
          <label title="Automatically update your knowledge graph after generation"><input type="checkbox" bind:checked={autoGraph}/> Knowledge graph</label>
        </div>
      </div>
    </div>
  </section>

  <Divider label="Resize video portal" adjust={n=>portalWidth=Math.max(.25,Math.min(.48,portalWidth-n))}/><section class="portal-area" aria-label="Video output">
    <div class="area-header">
      <div>
        <h2>Video Portal</h2>
        <p class="area-subtitle">Watch the generated explainer</p>
      </div>
      <div class="portal-status-pill" class:active={isGenerating} role="status">
        <span class="status-indicator-dot"></span>
        <span>{current?.status.replaceAll("_", " ") ?? "Ready"}</span>
      </div>
    </div>

    <div class="portal-frame">
      {#if current?.videoUrl}
        {#key current.videoUrl}
          <!-- The exported MP4 already contains its caption track. -->
          <!-- svelte-ignore a11y_media_has_caption -->
          <video class="explainer-video" controls src={current.videoUrl}></video>
        {/key}
      {:else}
        <div class="portal-empty-state">
          <p class="portal-empty-title">
            {isGenerating ? (stageLabels[current?.stage ?? ""] ?? "Queued for generation") : "Your video will appear here"}
          </p>
          {#if !current}
            <p class="portal-empty-desc">Enter lecture text and select Generate video.</p>
          {/if}
        </div>
      {/if}
    </div>

    {#if current?.error}
      <p class="generation-error" role="alert">{current.error}</p>
    {/if}
    {#if current?.durationMs}
      <p class="area-subtitle">Video length · {(current.durationMs / 1000).toFixed(1)} seconds</p>
    {/if}
    {#if current?.videoPath}
      <p class="area-subtitle output-path">Saved to {current.videoPath}</p>
    {/if}
    <div class="coverage-card">
        <span class="coverage-label">{current?.status === "completed" ? "Verified video coverage" : current?.stage === "verify_export" ? "Verifying video coverage" : current?.coverage ? "Script coverage" : "Concept coverage"}</span>
        {#if current?.coverage && points.length && (current.coverage.passed || gaps.length)}
          <progress aria-label="Required concepts covered" value={covered} max={points.length}></progress>
          <span>{covered}/{points.length} covered · {gaps.length} missed or incomplete · {Math.floor(100 * covered / points.length)}%</span>
          {#if gaps.length}
            <ul>{#each gaps as point}<li>{point.title}</li>{/each}</ul>
          {/if}
        {:else}
          <progress aria-label="Coverage awaiting verification" value={0} max={100}></progress>
          <span>{current?.coverage || current?.status === "held_for_review" ? "Coverage needs review" : "Awaiting concept verification"}</span>
        {/if}
      </div>
  </section>
</div>

<style>
  /* =====================================================================
     Monochrome / Black-and-White Layout & Styling
     ===================================================================== */
  .lecture-screen {
    display: grid;
    grid-template-columns: minmax(155px, .65fr) minmax(0, 1.45fr) minmax(0, 1fr);
    gap: 20px;
    width: 100%;
    min-height: calc(100vh - 205px);
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
    display: grid;
    place-items: center;
    min-height: 220px;
    background: #0b0b0b;
    border: 1px solid #282828;
    border-radius: 10px;
    overflow: hidden;
  }

  .portal-empty-state {
    padding: 24px;
    text-align: center;
    color: #c9c9c9;
  }

  .portal-empty-title {
    text-transform: capitalize;
  }

  .explainer-video {
    width: 100%;
    display: block;
  }

  .coverage-card, .generation-error {
    padding: 12px;
    border: 1px solid #303030;
    border-radius: 8px;
  }

  .coverage-card {
    display: grid;
    gap: 4px;
  }

  .coverage-label {
    font-weight: 600;
  }
  .coverage-card progress {
    width: 100%;
    accent-color: #56dba4;
  }

  .generation-error {
    color: #ffb3b3;
    overflow-wrap: anywhere;
  }

  .output-path {
    overflow-wrap: anywhere;
    user-select: text;
  }

  /* ---------------- Responsive Styles ---------------- */
  @media (max-width: 1080px) {
    .lecture-screen {
      grid-template-columns: minmax(135px,.5fr) minmax(0,1.2fr) minmax(0,1fr);
      gap: 14px;
    }
  }

  @media (max-width: 900px) {
    .lecture-screen {
      grid-template-columns: 1fr;
      min-height: auto;
    }
    .sidebar {
      max-height: 200px;
    }
    .portal-frame {
      min-height: 220px;
    }
  }
  @media(max-width:900px){.central-area{order:0}.portal-area{order:1}.sidebar{order:2}.input-card{min-height:230px}.lecture-textarea{min-height:180px}}
  .lecture-screen > *{min-width:0}
  .render-options,.input-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.render-options{margin:4px 0 9px;font-size:13px}.render-options small{overflow-wrap:anywhere;color:var(--muted)}.input-actions label{white-space:nowrap}.sidebar-header{gap:4px;flex-wrap:wrap}.fold{padding:2px 8px}.collapsed .sidebar :is(.title-with-count,.icon-btn,.history-content){display:none}.collapsed .sidebar-header{padding:8px 4px}.coverage-card{grid-column:1/-1;order:5;display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:0;padding:8px 12px;font-size:13px}.coverage-card progress{flex:1;min-width:60px}.coverage-card ul{max-height:60px;overflow:auto}
@media(min-width:901px){.lecture-screen{grid-template-columns:var(--recent) 10px minmax(0,1fr) 10px var(--portal);grid-template-rows:minmax(0,1fr);gap:0}.portal-frame{flex:1;min-height:0}.explainer-video{height:100%;max-height:100%;object-fit:contain}.portal-area{display:flex;flex-direction:column}.central-area,.portal-area{padding:0 4px}}
@media(max-width:900px){.lecture-screen :global(.divider){display:none}.coverage-card{grid-column:auto}}
.sidebar .sidebar-header{display:flex;flex-wrap:nowrap;align-items:center;justify-content:flex-start;padding:8px 6px;gap:4px}.sidebar .title-with-count{min-width:0;flex:1;gap:4px}.sidebar .sidebar-header h2{font-size:14px;overflow:hidden;text-overflow:ellipsis}.sidebar .fold,.sidebar .icon-btn{padding:4px;min-width:24px;height:28px;justify-content:center}.sr-only{position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}.input-actions label{display:inline-flex;align-items:center;gap:6px;font-size:13px}.input-actions{column-gap:16px}.collapsed .sidebar .sidebar-header{justify-content:center}
</style>