<script lang="ts">
  import Konva from "konva";
  import { onDestroy, onMount } from "svelte";
  import { auditSceneLayout, paginateScene } from "../renderer/layout";
  import { renderSceneAtTime } from "../renderer/templates";
  import { THEME } from "../renderer/theme";
  import type { SceneSpec, SentenceCue } from "../renderer/types";

  let {
    scene,
    cues = [],
    showCaptions = true,
  }: {
    scene: SceneSpec;
    cues?: SentenceCue[];
    showCaptions?: boolean;
  } = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let stage: Konva.Stage | null = null;
  let playing = $state(false);
  let timeMs = $state(0);
  let partIdx = $state(0);
  let rafId = 0;
  let lastTick = 0;

  let paginated = $derived(paginateScene(scene, THEME.width, THEME.height));
  let activePart = $derived(paginated[Math.min(partIdx, Math.max(0, paginated.length - 1))] ?? scene);
  let effectiveCues = $derived.by(() => {
    if (paginated.length === 1 && cues.length > 0) return cues;
    return activePart.narration_sentences.map((text, idx) => ({
      sentence_index: idx,
      text,
      start_ms: idx * 2400,
      end_ms: (idx + 1) * 2400,
    }));
  });
  let totalDurationMs = $derived(
    effectiveCues.length > 0 ? effectiveCues[effectiveCues.length - 1].end_ms : 4000
  );
  let audit = $derived(auditSceneLayout(activePart, THEME.width, THEME.height));

  $effect(() => {
    if (partIdx >= paginated.length) {
      partIdx = 0;
    }
  });

  $effect(() => {
    if (stage) {
      renderSceneAtTime(stage, activePart, timeMs, effectiveCues, {
        showCaptions,
        width: THEME.width,
        height: THEME.height,
      });
    }
  });

  function stopPlayback() {
    playing = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }
    if (timeMs >= totalDurationMs) {
      timeMs = 0;
    }
    playing = true;
    lastTick = performance.now();
    const tick = (now: number) => {
      if (!playing) return;
      const dt = now - lastTick;
      lastTick = now;
      timeMs = Math.min(totalDurationMs, timeMs + dt);
      if (timeMs >= totalDurationMs) {
        stopPlayback();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  onMount(() => {
    if (!containerEl) return;
    stage = new Konva.Stage({
      container: containerEl,
      width: THEME.width,
      height: THEME.height,
    });
    renderSceneAtTime(stage, activePart, timeMs, effectiveCues, {
      showCaptions,
      width: THEME.width,
      height: THEME.height,
    });
  });

  onDestroy(() => {
    stopPlayback();
    stage?.destroy();
    stage = null;
  });
</script>

<div class="konva-shell">
  <div class="stage-viewport">
    <div bind:this={containerEl} class="stage-holder"></div>
  </div>

  <div class="controls">
    <button class="btn" onclick={togglePlay}>{playing ? "Pause" : "Play Preview"}</button>
    <input
      type="range"
      min="0"
      max={totalDurationMs}
      step="50"
      bind:value={timeMs}
      class="scrubber"
    />
    <span class="mono">{(timeMs / 1000).toFixed(1)}s / {(totalDurationMs / 1000).toFixed(1)}s</span>
  </div>

  <div class="meta-bar">
    <div>
      <span class="badge">Min Font: {audit.min_font_size}px</span>
      <span class="badge ok">Overlaps: {audit.max_overlap_count}</span>
      <span class="badge ok">Clipped: {audit.out_of_bounds_count}</span>
      {#if paginated.length > 1}
        <span class="badge warn">Auto-split into {paginated.length} parts</span>
      {/if}
    </div>
    {#if paginated.length > 1}
      <div class="part-tabs">
        {#each paginated as part, i}
          <button
            class="btn-secondary"
            style={i === partIdx ? "border-color: var(--accent); color: var(--accent);" : ""}
            onclick={() => {
              partIdx = i;
              timeMs = 0;
            }}
          >
            Part {part.part_index}/{part.part_total}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .konva-shell {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .stage-viewport {
    width: 100%;
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: #070b16;
  }
  .stage-holder {
    width: 1280px;
    height: 720px;
    margin: 0 auto;
    transform-origin: top left;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .scrubber {
    flex: 1;
  }
  .mono {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    font-size: 13px;
  }
  .meta-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  .part-tabs {
    display: flex;
    gap: 6px;
  }
</style>
