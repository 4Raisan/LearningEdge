<script lang="ts">
  import { onMount } from "svelte";
  import denseFixture from "../fixtures/dense_overflow_scenes.json";
  import KonvaPreview from "./lib/components/KonvaPreview.svelte";
  import LectureToVideo from "./pages/LectureToVideo.svelte";
  import type { SceneSpec } from "./lib/renderer/types";
  import {
    invokeTauri,
    isTauriRuntime,
    resolveVideoUrl,
    type KnowledgeGraphSnapshot,
    type ModelCapabilities,
    type PipelineRunRecord,
    type PresetConfig,
    type RunArtifactsBundle,
  } from "./lib/tauriApi";

  type TabId = "lecture" | "pipeline" | "preview" | "presets" | "kg";

  let activeTab = $state<TabId>("lecture");
  let tauriMode = $state(isTauriRuntime());
  let runs = $state<PipelineRunRecord[]>([]);
  let activeBundle = $state<RunArtifactsBundle | null>(null);
  let videoSrc = $state("");
  let statusNotice = $state("");
  let busy = $state(false);
  let useCodex = $state(false);
  let usageMessage = $state("");

  async function openUsage(provider: "antigravity" | "codex") {
    try {
      await invokeTauri("open_provider_usage", { provider });
      usageMessage = provider === "antigravity" ? "Enter /usage in the Antigravity terminal." : "Opened the Codex usage dashboard in your browser.";
    } catch (error) {
      usageMessage = String(error);
    }
  }

  // Preview tab
  const fallbackScenes = denseFixture.scenes as SceneSpec[];
  let selectedPreviewSceneId = $state(fallbackScenes[0].scene_id);
  let previewScenes = $derived(activeBundle?.scene_plan?.scenes ?? fallbackScenes);
  let activePreviewScene = $derived(
    previewScenes.find((s) => s.scene_id === selectedPreviewSceneId) ?? previewScenes[0]
  );

  // Presets & Providers tab
  let presets = $state<PresetConfig[]>([]);
  let activePreset = $state<PresetConfig | null>(null);
  let capabilities = $state<ModelCapabilities[]>([]);
  let voices = $state<string[]>([]);
  let secretRefInput = $state("openai-default");
  let secretValueInput = $state("");
  let secretExists = $state<boolean | null>(null);

  // Knowledge Graph & Dreaming tab
  let kg = $state<KnowledgeGraphSnapshot>({
    concepts: [],
    edges: [],
    dream_suggestions: [],
  });
  let ftsQuery = $state("");
  let ftsHits = $state<Array<{ segment_id: string; source_ref: string; text: string }>>([]);
  let mergeKeepId = $state("");
  let mergeDropId = $state("");

  async function refreshRuns(selectRunId?: string) {
    if (!tauriMode) return;
    runs = await invokeTauri<PipelineRunRecord[]>("list_runs");
    const targetId = selectRunId ?? activeBundle?.run.id ?? runs[0]?.id;
    if (targetId) {
      await loadBundle(targetId);
    }
  }

  async function loadBundle(runId: string) {
    if (!tauriMode) return;
    const b = await invokeTauri<RunArtifactsBundle>("get_run_artifacts", { runId });
    activeBundle = b;
    if (b.video_manifest?.video_path) {
      videoSrc = await resolveVideoUrl(b.video_manifest.video_path);
    } else {
      videoSrc = "";
    }
    if (b.scene_plan?.scenes.length) {
      selectedPreviewSceneId = b.scene_plan.scenes[0].scene_id;
    }
  }

  async function triggerFixtureRun() {
    if (!tauriMode) {
      statusNotice = "Running in browser preview mode (launch via `pnpm tauri dev` to run native Rust/Apalis pipeline).";
      return;
    }
    busy = true;
    statusNotice = "Queueing fixture pipeline job on Apalis worker...";
    try {
      const resp = await invokeTauri<{ run_id: string; status: string }>("run_fixture_pipeline", {
        presetId: activePreset?.id ?? null,
      });
      statusNotice = `Queued run ${resp.run_id}; processing stages...`;

      // Poll run completion cleanly
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => setTimeout(r, 400));
        const b = await invokeTauri<RunArtifactsBundle>("get_run_artifacts", {
          runId: resp.run_id,
        });
        activeBundle = b;
        statusNotice = `Run ${b.run.id}: ${b.run.status} (${b.run.current_stage ?? ""})`;
        if (["completed", "held_for_review", "failed"].includes(b.run.status)) {
          await refreshRuns(b.run.id);
          await refreshKg();
          break;
        }
      }
    } catch (err) {
      statusNotice = `Error: ${String(err)}`;
    } finally {
      busy = false;
    }
  }

  async function saveCurrentPreset() {
    if (!tauriMode || !activePreset) return;
    await invokeTauri("save_preset", { preset: activePreset, isDefault: true });
    presets = await invokeTauri<PresetConfig[]>("list_presets");
    statusNotice = `Saved preset '${activePreset.name}'`;
  }

  async function storeSecret() {
    if (!tauriMode || !secretRefInput.trim() || !secretValueInput.trim()) return;
    await invokeTauri("store_provider_secret", {
      credentialRef: secretRefInput.trim(),
      secret: secretValueInput.trim(),
    });
    secretValueInput = "";
    secretExists = await invokeTauri<boolean>("check_provider_secret", {
      credentialRef: secretRefInput.trim(),
    });
    statusNotice = `Stored credential ref '${secretRefInput}' in OS Credential Store.`;
  }

  async function refreshKg() {
    if (!tauriMode) return;
    kg = await invokeTauri<KnowledgeGraphSnapshot>("get_knowledge_graph");
  }

  async function triggerDreaming() {
    if (!tauriMode) return;
    await invokeTauri("run_dreaming");
    await refreshKg();
  }

  async function reviewDream(id: string, accept: boolean) {
    if (!tauriMode) return;
    await invokeTauri("review_dream_suggestion", { suggestionId: id, accept });
    await refreshKg();
  }

  async function mergeConcepts() {
    if (!tauriMode || !mergeKeepId || !mergeDropId || mergeKeepId === mergeDropId) return;
    await invokeTauri("merge_kg_concepts", { keepId: mergeKeepId, mergeId: mergeDropId });
    await refreshKg();
  }

  async function runFtsSearch() {
    if (!tauriMode || !ftsQuery.trim()) return;
    ftsHits = await invokeTauri("search_sources_fts", { query: ftsQuery.trim() });
  }

  onMount(async () => {
    if (!tauriMode) return;
    try {
      presets = await invokeTauri<PresetConfig[]>("list_presets");
      activePreset = presets[0] ?? null;
      capabilities = await invokeTauri<ModelCapabilities[]>("get_provider_capabilities");
      voices = await invokeTauri<string[]>("get_windows_voices");
      await refreshRuns();
      await refreshKg();
    } catch (e) {
      statusNotice = String(e);
    }
  });
</script>

<main class="shell">
  <header class="topbar">
    <div>
      <h1>LearningEdge</h1>
      <p class="subtitle">Local-First Lecture Notes, Verified Storyboards & Motion-Graphics Explainers</p>
    </div>
    <nav class="tabs">
      <button class:active={activeTab === "lecture"} onclick={() => (activeTab = "lecture")}>
        Lecture to Video
      </button>
      <button class:active={activeTab === "pipeline"} onclick={() => (activeTab = "pipeline")}>
        Pipeline & Traceability
      </button>
      <button class:active={activeTab === "preview"} onclick={() => (activeTab = "preview")}>
        Konva Preview
      </button>
      <button class:active={activeTab === "presets"} onclick={() => (activeTab = "presets")}>
        Providers & Presets
      </button>
      <button class:active={activeTab === "kg"} onclick={() => (activeTab = "kg")}>
        Knowledge Graph & Dreaming
      </button>
    </nav>
  </header>

  {#if statusNotice}
    <div class="notice card">{statusNotice}</div>
  {/if}

  <div hidden={activeTab !== "lecture"}>
    <LectureToVideo bind:useCodex />
  </div>

  {#if activeTab === "pipeline"}
    <section class="grid-2">
      <div class="card">
        <div class="row-between">
          <h2>Fixture Run & Apalis Worker</h2>
          <button class="btn" disabled={busy} onclick={triggerFixtureRun}>
            {busy ? "Running..." : "Run CPU Caching Fixture"}
          </button>
        </div>

        {#if !tauriMode}
          <p class="muted">
            Opened in static web preview. Use <code>pnpm tauri dev</code> or <code>cargo run --bin pipeline_cli</code> to execute the native Rust + Apalis + Windows SAPI + FFmpeg pipeline.
          </p>
        {/if}

        <h3>Recent Runs</h3>
        <div class="list">
          {#each runs as r}
            <button
              class="run-row"
              onclick={() => loadBundle(r.id)}
              style={activeBundle?.run.id === r.id ? "border-color: var(--accent);" : ""}
            >
              <span>{r.id.slice(0, 18)}</span>
              <span class="badge {r.status === 'completed' ? 'ok' : r.status === 'held_for_review' ? 'warn' : ''}">
                {r.status}
              </span>
            </button>
          {/each}
        </div>

        {#if activeBundle?.benchmark_metrics}
          <h3>Stage Benchmarks</h3>
          <p class="muted">
            Total: {activeBundle.benchmark_metrics.total_duration_ms} ms · Peak RSS: {(activeBundle.benchmark_metrics.peak_working_set_bytes / (1024 * 1024)).toFixed(1)} MB · Reused audio: {activeBundle.benchmark_metrics.reused_audio_count} · Reused clips: {activeBundle.benchmark_metrics.reused_clip_count}
          </p>
        {/if}
      </div>

      <div class="card">
        <h2>Coverage Gate & Video Output</h2>
        {#if activeBundle?.coverage_report}
          <p>
            Coverage Check:
            <span class="badge {activeBundle.coverage_report.passed ? 'ok' : 'err'}">
              {activeBundle.coverage_report.passed ? "PASSED" : "HELD FOR REVIEW"}
            </span>
            ({activeBundle.coverage_report.checked_points} required note points)
          </p>
          {#each activeBundle.coverage_report.issues as issue}
            <div class="issue-box">
              <strong>{issue.kind}</strong> ({issue.note_point_id}): {issue.message}
            </div>
          {/each}
        {/if}

        {#if videoSrc}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video controls src={videoSrc} style="width: 100%; border-radius: 8px; margin-top: 10px;"></video>
        {/if}

        {#if activeBundle?.video_manifest}
          <h3>Source → Note → Video Timestamp Traceability</h3>
          <div class="trace-list">
            {#each activeBundle.video_manifest.trace_index as t}
              <div class="trace-item">
                <strong>{t.note_point_id}</strong> — {t.note_title}
                <div class="muted">Sources: {t.source_refs.join(", ")}</div>
                <div class="muted">
                  Video: {t.video_segments.map((v) => `${v.scene_id} (${(v.start_ms / 1000).toFixed(1)}s–${(v.end_ms / 1000).toFixed(1)}s)`).join(", ")}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {:else if activeTab === "preview"}
    <section class="card">
      <div class="row-between" style="margin-bottom: 12px;">
        <h2>Shared Konva Motion-Graphics Renderer</h2>
        <select bind:value={selectedPreviewSceneId} class="select">
          {#each previewScenes as s}
            <option value={s.scene_id}>{s.scene_id} — {s.template} — {s.title}</option>
          {/each}
        </select>
      </div>
      {#if activePreviewScene}
        <KonvaPreview scene={activePreviewScene} />
      {/if}
    </section>
  {:else if activeTab === "presets"}
    <section class="card">
      <h2>Video authoring model</h2>
      <button onclick={() => { useCodex = true; activeTab = "lecture"; }}>Use signed-in Codex</button>
      <details>
        <summary>Use Antigravity Hydrogen Low</summary>
        <p>From the LearningEdge folder, run this command with your lecture text file. Hydrogen writes and reviews the script through your signed-in CLI, then LearningEdge renders the video.</p>
        <code>python scripts/hydrogen-video.py "lecture.txt"</code>
      </details>
    </section>
    <section class="card">
      <h2>Subscription usage</h2>
      <button disabled={!tauriMode} onclick={() => openUsage("antigravity")}>Antigravity usage</button>
      <button disabled={!tauriMode} onclick={() => openUsage("codex")}>Codex usage</button>
      <p class="muted" role="status">{tauriMode ? usageMessage : "Open LearningEdge desktop to view subscription usage."}</p>
    </section>
    <section class="grid-2">
      <div class="card">
        <h2>Per-Stage Providers & Note Depth</h2>
        {#if activePreset}
          <label class="field">
            <span>Note Depth</span>
            <select bind:value={activePreset.note_depth} class="select">
              <option value="brief">Brief (preserve required reasoning)</option>
              <option value="standard">Standard</option>
              <option value="deep">Deep</option>
            </select>
          </label>
          <label class="field">
            <span>
              <input type="checkbox" bind:checked={activePreset.offline_only} />
              Keep local jobs strictly offline (block cloud API calls)
            </span>
          </label>
          <label class="field">
            <span>Notes Stage Provider</span>
            <select bind:value={activePreset.notes_stage.provider} class="select">
              <option value="local_offline">Local Deterministic (Offline)</option>
              <option value="ollama">Ollama (Loopback)</option>
              <option value="open_ai">OpenAI API</option>
              <option value="gemini">Gemini API</option>
            </select>
          </label>
          <label class="field">
            <span>Thinking Level</span>
            <select bind:value={activePreset.notes_stage.thinking} class="select">
              <option value="off">Off</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label class="field">
            <span>Windows Speech Voice</span>
            <select bind:value={activePreset.narration_voice} class="select">
              <option value="">System Default Voice</option>
              {#each voices as v}
                <option value={v}>{v}</option>
              {/each}
            </select>
          </label>
          <button class="btn" onclick={saveCurrentPreset}>Save Preset</button>
        {:else}
          <p class="muted">Launch Tauri desktop app to edit and persist presets in SQLite.</p>
        {/if}
      </div>

      <div class="card">
        <h2>OS Credential Store (Keys Never Stored in Presets)</h2>
        <label class="field">
          <span>Credential Reference</span>
          <input class="input" bind:value={secretRefInput} placeholder="openai-default" />
        </label>
        <label class="field">
          <span>API Key (stored in Windows Credential Manager)</span>
          <input class="input" type="password" bind:value={secretValueInput} placeholder="sk-..." />
        </label>
        <button class="btn" onclick={storeSecret}>Save Key in OS Store</button>
        {#if secretExists !== null}
          <p class="muted">Credential stored: {secretExists ? "Yes" : "No"}</p>
        {/if}

        <h3>Supported Model Capabilities</h3>
        <ul>
          {#each capabilities as c}
            <li>
              <strong>{c.label}</strong> ({c.model}) — thinking: {c.allowed_thinking_levels.join(", ")}
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {:else if activeTab === "kg"}
    <section class="grid-2">
      <div class="card">
        <div class="row-between">
          <h2>Personal Knowledge Graph ({kg.concepts.length} concepts, {kg.edges.length} edges)</h2>
          <button class="btn" onclick={runFtsSearch}>Search FTS5</button>
        </div>

        <div class="row-gap" style="margin: 10px 0;">
          <input class="input" bind:value={ftsQuery} placeholder="Search FTS5 passages (e.g. cache OR locality)" />
        </div>
        {#each ftsHits as hit}
          <div class="trace-item">
            <span class="badge">{hit.source_ref}</span> {hit.text}
          </div>
        {/each}

        <h3>Merge Duplicate Concepts</h3>
        <div class="row-gap">
          <select class="select" bind:value={mergeKeepId}>
            <option value="">Keep concept...</option>
            {#each kg.concepts as c}
              <option value={c.id}>{c.label}</option>
            {/each}
          </select>
          <select class="select" bind:value={mergeDropId}>
            <option value="">Merge duplicate...</option>
            {#each kg.concepts as c}
              <option value={c.id}>{c.label}</option>
            {/each}
          </select>
          <button class="btn-secondary" onclick={mergeConcepts}>Merge</button>
        </div>

        <div class="trace-list" style="margin-top: 12px;">
          {#each kg.concepts as c}
            <div class="trace-item">
              <strong>{c.label}</strong>
              <div class="muted">{c.summary}</div>
            </div>
          {/each}
        </div>
      </div>

      <div class="card">
        <div class="row-between">
          <h2>Dreaming Suggestions (Pending vs Accepted)</h2>
          <button class="btn" onclick={triggerDreaming}>Run Dreaming</button>
        </div>
        {#each kg.dream_suggestions as sug}
          <div class="trace-item">
            <div class="row-between">
              <strong>{sug.title}</strong>
              <span class="badge {sug.status === 'accepted' ? 'ok' : sug.status === 'pending' ? 'warn' : ''}">
                {sug.status}
              </span>
            </div>
            <p class="muted">{sug.rationale}</p>
            <div class="muted">Sources: {sug.supporting_sources.join(", ")}</div>
            {#if sug.status === "pending"}
              <div class="row-gap" style="margin-top: 8px;">
                <button class="btn" onclick={() => reviewDream(sug.id, true)}>Accept</button>
                <button class="btn-secondary" onclick={() => reviewDream(sug.id, false)}>Dismiss</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</main>

<style>
  .shell {
    max-width: 1600px;
    margin: 0 auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 100vh;
    box-sizing: border-box;
    background: #000000;
  }
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    border-bottom: 1px solid #222222;
    padding-bottom: 14px;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #ffffff;
  }
  .subtitle {
    margin: 2px 0 0;
    color: #888888;
    font-size: 13px;
  }
  .tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tabs button {
    background: #0d0d0d;
    border: 1px solid #222222;
    border-radius: 8px;
    padding: 7px 14px;
    color: #888888;
    font-size: 13px;
    transition: all 0.15s ease;
  }
  .tabs button:hover {
    color: #ffffff;
    border-color: #444444;
  }
  .tabs button.active {
    background: #ffffff;
    border-color: #ffffff;
    color: #000000;
    font-weight: 600;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
    gap: 16px;
  }
  .row-between {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .row-gap {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
  }
  .notice {
    border-color: var(--accent);
    background: #0c2440;
  }
  .list,
  .trace-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .run-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .trace-item,
  .issue-box {
    padding: 10px;
    border-radius: 8px;
    background: var(--panel-alt);
    border: 1px solid var(--border);
    margin-bottom: 6px;
  }
  .issue-box {
    border-color: var(--rose);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
    font-size: 14px;
  }
  .select,
  .input {
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
  }
</style>
