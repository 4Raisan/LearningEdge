import type { SceneSpec, SentenceCue } from "./renderer/types";

export interface ModelCapabilities {
  provider: "local_offline" | "ollama" | "codex_cli" | "open_ai" | "gemini";
  model: string;
  label: string;
  supports_thinking: boolean;
  allowed_thinking_levels: Array<"off" | "low" | "medium" | "high">;
  requires_credential: boolean;
  local_only: boolean;
}

export interface StageProviderConfig {
  provider: "local_offline" | "ollama" | "codex_cli" | "open_ai" | "gemini";
  model: string;
  thinking: "off" | "low" | "medium" | "high";
  credential_ref?: string | null;
  base_url?: string | null;
}

export interface PresetConfig {
  id: string;
  name: string;
  note_depth: "brief" | "standard" | "deep";
  structure_preference: string;
  emphasis: string;
  offline_only: boolean;
  notes_stage: StageProviderConfig;
  verify_stage: StageProviderConfig;
  scene_plan_stage: StageProviderConfig;
  coverage_stage: StageProviderConfig;
  dreaming_stage: StageProviderConfig;
  narration_voice: string;
  narration_rate: number;
  fps: number;
  width: number;
  height: number;
}

export interface PipelineRunRecord {
  id: string;
  lecture_id: string;
  preset_id: string;
  status: string;
  current_stage?: string | null;
  held_reason?: string | null;
  error_message?: string | null;
  output_dir: string;
  created_at: string;
  updated_at: string;
}

export interface NotePoint {
  id: string;
  title: string;
  definition: string;
  reasoning: string;
  qualification?: string | null;
  example?: string | null;
  source_refs: string[];
  required: boolean;
}

export interface VerifiedNotes {
  lecture_id: string;
  title: string;
  depth: string;
  points: NotePoint[];
  verification_passed: boolean;
  flags: Array<{ note_point_id: string; kind: string; message: string }>;
}

export interface CoverageReport {
  passed: boolean;
  checked_points: number;
  issues: Array<{
    note_point_id: string;
    scene_id?: string | null;
    kind: string;
    message: string;
  }>;
}

export interface VideoSceneEntry {
  scene_id: string;
  base_scene_id: string;
  part_index: number;
  part_total: number;
  template: string;
  note_point_ids: string[];
  source_refs: string[];
  audio_duration_ms: number;
  frame_count: number;
  start_ms: number;
  end_ms: number;
  cues: SentenceCue[];
  reused_audio: boolean;
  reused_clip: boolean;
}

export interface VideoManifest {
  run_id: string;
  video_path: string;
  captions_path: string;
  total_duration_ms: number;
  scenes: VideoSceneEntry[];
  trace_index: Array<{
    note_point_id: string;
    note_title: string;
    source_refs: string[];
    scene_ids: string[];
    video_segments: Array<{ scene_id: string; start_ms: number; end_ms: number }>;
  }>;
}

export interface RunArtifactsBundle {
  run: PipelineRunRecord;
  verified_notes?: VerifiedNotes | null;
  scene_plan?: { lecture_id: string; title: string; scenes: SceneSpec[] } | null;
  coverage_report?: CoverageReport | null;
  video_manifest?: VideoManifest | null;
  benchmark_metrics?: {
    total_duration_ms: number;
    peak_working_set_bytes: number;
    reused_audio_count: number;
    reused_clip_count: number;
    stages: Array<{ stage: string; duration_ms: number; reused: boolean }>;
  } | null;
}

export interface KnowledgeGraphSnapshot {
  concepts: Array<{
    id: string;
    label: string;
    summary: string;
    aliases: string[];
    links: Array<{
      id: string;
      lecture_id: string;
      source_refs: string[];
      note_point_id?: string | null;
      scene_id?: string | null;
      video_start_ms?: number | null;
      video_end_ms?: number | null;
    }>;
  }>;
  edges: Array<{
    id: string;
    from_concept_id: string;
    to_concept_id: string;
    relation: string;
    supporting_sources: string[];
  }>;
  dream_suggestions: Array<{
    id: string;
    kind: string;
    title: string;
    rationale: string;
    supporting_sources: string[];
    status: string;
  }>;
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

export async function resolveVideoUrl(filePath: string): Promise<string> {
  if (!isTauriRuntime()) return "";
  const core = await import("@tauri-apps/api/core");
  return core.convertFileSrc(filePath);
}
