use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SceneTemplate {
    ConceptReveal,
    ProcessDiagram,
    Timeline,
    ComparisonGrid,
    RecapLadder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentenceCue {
    pub sentence_index: usize,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneItem {
    pub id: String,
    pub label: String,
    pub detail: String,
    #[serde(default)]
    pub badge: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub stat: Option<String>,
    #[serde(default)]
    pub cue_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramNode {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub sublabel: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub accent: Option<String>,
    #[serde(default)]
    pub cue_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramEdge {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub packet: bool,
    #[serde(default)]
    pub dashed: bool,
    #[serde(default)]
    pub cue_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartDatum {
    pub label: String,
    pub value: f64,
    #[serde(default)]
    pub suffix: Option<String>,
    #[serde(default)]
    pub accent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SceneVisual {
    KineticTitle {
        #[serde(default)]
        eyebrow: Option<String>,
        headline: String,
        #[serde(default)]
        accent_word: Option<String>,
        #[serde(default)]
        icon: Option<String>,
        #[serde(default)]
        chips: Vec<String>,
    },
    Diagram {
        #[serde(default)]
        nodes: Vec<DiagramNode>,
        #[serde(default)]
        edges: Vec<DiagramEdge>,
        #[serde(default)]
        callout: Option<String>,
    },
    Chart {
        #[serde(default)]
        chart_type: String,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        bars: Vec<ChartDatum>,
        #[serde(default)]
        percent: Option<f64>,
        #[serde(default)]
        metric_value: Option<f64>,
        #[serde(default)]
        metric_prefix: Option<String>,
        #[serde(default)]
        metric_suffix: Option<String>,
        #[serde(default)]
        metric_label: Option<String>,
        #[serde(default)]
        callout: Option<String>,
    },
    Metaphor {
        left_label: String,
        #[serde(default)]
        left_icon: Option<String>,
        right_label: String,
        #[serde(default)]
        right_icon: Option<String>,
        #[serde(default)]
        connector_label: Option<String>,
        #[serde(default)]
        character_pose: Option<String>,
        #[serde(default)]
        caption: Option<String>,
    },
    SvgSketch {
        svg: String,
        #[serde(default)]
        caption: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneSpec {
    pub scene_id: String,
    #[serde(default)]
    pub base_scene_id: String,
    #[serde(default = "default_one")]
    pub part_index: usize,
    #[serde(default = "default_one")]
    pub part_total: usize,
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    pub template: SceneTemplate,
    pub note_point_ids: Vec<String>,
    pub source_refs: Vec<String>,
    pub narration_sentences: Vec<String>,
    pub items: Vec<SceneItem>,
    #[serde(default)]
    pub visual: Option<SceneVisual>,
    #[serde(default)]
    pub visual_layout: Option<String>,
    #[serde(default)]
    pub footer_note: Option<String>,
}

fn default_one() -> usize {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: String,
    pub start_ms: u64,
    pub end_ms: u64,
    #[serde(default)]
    pub speaker: Option<String>,
    #[serde(default)]
    pub topic_id: Option<String>,
    #[serde(default)]
    pub topic_title: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptFixture {
    pub lecture_id: String,
    pub title: String,
    #[serde(default)]
    pub course: Option<String>,
    pub segments: Vec<TranscriptSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupportingMaterialItem {
    pub id: String,
    pub kind: String,
    pub source_ref: String,
    pub title: String,
    #[serde(default)]
    pub page_or_slide: Option<i64>,
    #[serde(default)]
    pub section_ref: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupportingMaterialsFile {
    pub lecture_id: String,
    pub materials: Vec<SupportingMaterialItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceConflict {
    pub id: String,
    pub kind: String,
    pub source_refs: Vec<String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreparedSources {
    pub lecture_id: String,
    pub title: String,
    pub course: Option<String>,
    pub transcript_segments: Vec<TranscriptSegment>,
    pub supporting_materials: Vec<SupportingMaterialItem>,
    pub conflicts: Vec<SourceConflict>,
    pub source_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NoteDepth {
    Brief,
    Standard,
    Deep,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotePoint {
    pub id: String,
    pub title: String,
    pub definition: String,
    pub reasoning: String,
    #[serde(default)]
    pub qualification: Option<String>,
    #[serde(default)]
    pub example: Option<String>,
    pub key_terms: Vec<String>,
    pub source_refs: Vec<String>,
    #[serde(default = "default_true")]
    pub required: bool,
    #[serde(default)]
    pub preferred_template: Option<SceneTemplate>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteVerificationFlag {
    pub note_point_id: String,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiedNotes {
    pub lecture_id: String,
    pub title: String,
    pub depth: NoteDepth,
    pub points: Vec<NotePoint>,
    pub verification_passed: bool,
    pub flags: Vec<NoteVerificationFlag>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenePlan {
    pub lecture_id: String,
    pub title: String,
    pub scenes: Vec<SceneSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CoverageIssueKind {
    MissingRequiredPoint,
    ShallowMentionWithoutExplanation,
    InvalidStructure,
    UnresolvedSourceReference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverageIssue {
    pub note_point_id: String,
    pub scene_id: Option<String>,
    pub kind: CoverageIssueKind,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverageReport {
    pub passed: bool,
    pub checked_points: usize,
    pub issues: Vec<CoverageIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneAudioResult {
    pub scene_id: String,
    pub wav_path: String,
    pub duration_ms: u64,
    pub cues: Vec<SentenceCue>,
    pub cached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutMetrics {
    pub min_font_size: f64,
    pub max_overlap_count: usize,
    pub out_of_bounds_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoSceneEntry {
    pub scene_id: String,
    pub base_scene_id: String,
    pub part_index: usize,
    pub part_total: usize,
    pub template: SceneTemplate,
    pub note_point_ids: Vec<String>,
    pub source_refs: Vec<String>,
    pub audio_duration_ms: u64,
    pub frame_count: u32,
    pub start_ms: u64,
    pub end_ms: u64,
    pub cues: Vec<SentenceCue>,
    pub clip_path: String,
    pub reused_audio: bool,
    pub reused_clip: bool,
    pub layout_metrics: LayoutMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteVideoTrace {
    pub note_point_id: String,
    pub note_title: String,
    pub source_refs: Vec<String>,
    pub scene_ids: Vec<String>,
    pub video_segments: Vec<TimeRangeMs>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRangeMs {
    pub scene_id: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoManifest {
    pub run_id: String,
    pub lecture_id: String,
    pub video_path: String,
    pub captions_path: String,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub total_duration_ms: u64,
    pub scenes: Vec<VideoSceneEntry>,
    pub trace_index: Vec<NoteVideoTrace>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageTimingMetric {
    pub stage: String,
    pub duration_ms: u64,
    pub reused: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkMetrics {
    pub total_duration_ms: u64,
    pub peak_working_set_bytes: u64,
    pub stages: Vec<StageTimingMetric>,
    pub reused_audio_count: usize,
    pub reused_clip_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StageProviderKind {
    LocalOffline,
    Ollama,
    CodexCli,
    Antigravity,
    OpenAi,
    Gemini,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingLevel {
    Off,
    Low,
    Medium,
    High,
    Xhigh,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageProviderConfig {
    pub provider: StageProviderKind,
    pub model: String,
    pub thinking: ThinkingLevel,
    #[serde(default)]
    pub credential_ref: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum NarrationProviderKind {
    #[default]
    Auto,
    EdgeTts,
    WindowsSapi,
    ModelAudio,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresetConfig {
    #[serde(default)] pub video_theme: String,
    #[serde(default = "default_true")]
    pub auto_graph: bool,
    pub id: String,
    pub name: String,
    pub note_depth: NoteDepth,
    #[serde(default)]
    pub structure_preference: String,
    #[serde(default)]
    pub emphasis: String,
    #[serde(default = "default_true")]
    pub offline_only: bool,
    pub notes_stage: StageProviderConfig,
    pub verify_stage: StageProviderConfig,
    pub scene_plan_stage: StageProviderConfig,
    pub coverage_stage: StageProviderConfig,
    pub dreaming_stage: StageProviderConfig,
    #[serde(default)]
    pub narration_provider: NarrationProviderKind,
    pub narration_voice: String,
    #[serde(default)]
    pub narration_rate: i32,
    #[serde(default = "default_true")]
    pub sfx_enabled: bool,
    #[serde(default = "default_fps")]
    pub fps: u32,
    #[serde(default = "default_width")]
    pub width: u32,
    #[serde(default = "default_height")]
    pub height: u32,
}

fn default_fps() -> u32 {
    30
}
fn default_width() -> u32 {
    1280
}
fn default_height() -> u32 {
    720
}

impl Default for PresetConfig {
    fn default() -> Self {
        let local_stage = StageProviderConfig {
            provider: StageProviderKind::LocalOffline,
            model: "local-deterministic-v1".to_string(),
            thinking: ThinkingLevel::Off,
            credential_ref: None,
            base_url: None,
        };
        Self {
            auto_graph: true,
            video_theme: String::new(),
            id: "preset-local-default".to_string(),
            name: "Local Offline Default".to_string(),
            note_depth: NoteDepth::Standard,
            structure_preference: "Concept + Reasoning + Qualification + Example".to_string(),
            emphasis: "Explain mechanisms clearly without jargon overload".to_string(),
            offline_only: true,
            notes_stage: local_stage.clone(),
            verify_stage: local_stage.clone(),
            scene_plan_stage: local_stage.clone(),
            coverage_stage: local_stage.clone(),
            dreaming_stage: local_stage,
            narration_provider: NarrationProviderKind::Auto,
            narration_voice: "en-US-AvaMultilingualNeural".to_string(),
            narration_rate: -4,
            sfx_enabled: true,
            fps: 30,
            width: 1280,
            height: 720,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCapabilities {
    pub provider: StageProviderKind,
    pub model: String,
    pub label: String,
    pub supports_thinking: bool,
    pub allowed_thinking_levels: Vec<ThinkingLevel>,
    pub requires_credential: bool,
    pub local_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineRunRecord {
    pub id: String,
    pub lecture_id: String,
    pub preset_id: String,
    pub preset_snapshot_json: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub held_reason: Option<String>,
    pub error_message: Option<String>,
    pub output_dir: String,
    pub source_hash: String,
    pub settings_hash: String,
    pub override_scene_plan_json: Option<String>,
    pub metrics_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunArtifactsBundle {
    pub run: PipelineRunRecord,
    pub prepared_sources: Option<PreparedSources>,
    pub verified_notes: Option<VerifiedNotes>,
    pub scene_plan: Option<ScenePlan>,
    pub coverage_report: Option<CoverageReport>,
    pub video_manifest: Option<VideoManifest>,
    pub benchmark_metrics: Option<BenchmarkMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSearchHit {
    pub segment_id: String,
    pub lecture_id: String,
    pub source_ref: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KgConceptLink {
    pub id: String,
    pub concept_id: String,
    pub lecture_id: String,
    pub source_refs: Vec<String>,
    pub note_point_id: Option<String>,
    pub scene_id: Option<String>,
    pub video_start_ms: Option<i64>,
    pub video_end_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KgConcept {
    pub id: String,
    pub label: String,
    pub summary: String,
    pub aliases: Vec<String>,
    pub links: Vec<KgConceptLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KgEdge {
    pub id: String,
    pub from_concept_id: String,
    pub to_concept_id: String,
    pub relation: String,
    pub supporting_sources: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DreamSuggestion {
    pub id: String,
    pub kind: String,
    pub from_concept_id: Option<String>,
    pub to_concept_id: Option<String>,
    pub title: String,
    pub rationale: String,
    pub supporting_sources: Vec<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeGraphSnapshot {
    pub concepts: Vec<KgConcept>,
    pub edges: Vec<KgEdge>,
    pub dream_suggestions: Vec<DreamSuggestion>,
}
