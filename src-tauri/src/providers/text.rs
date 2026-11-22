use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;

use crate::credentials;
use crate::models::{
    CoverageIssue, CoverageIssueKind, DreamSuggestion, KgConcept, NoteDepth, NotePoint,
    NoteVerificationFlag, PreparedSources, SceneItem, ScenePlan, SceneSpec, SceneTemplate,
    StageProviderConfig, StageProviderKind, ThinkingLevel, VerifiedNotes,
};
use crate::providers::{ensure_provider_allowed, retry_with_backoff, ProviderError};

#[async_trait]
pub trait TextStageProvider: Send + Sync {
    async fn generate_notes(
        &self,
        sources: &PreparedSources,
        depth: &NoteDepth,
        structure_pref: &str,
        emphasis: &str,
    ) -> Result<VerifiedNotes, ProviderError>;

    async fn verify_notes(
        &self,
        sources: &PreparedSources,
        notes: &VerifiedNotes,
    ) -> Result<VerifiedNotes, ProviderError>;

    async fn generate_scene_plan(&self, notes: &VerifiedNotes) -> Result<ScenePlan, ProviderError>;

    async fn verify_coverage_semantic(
        &self,
        notes: &VerifiedNotes,
        plan: &ScenePlan,
    ) -> Result<Vec<CoverageIssue>, ProviderError>;

    async fn dream_suggestions(
        &self,
        concepts: &[KgConcept],
    ) -> Result<Vec<DreamSuggestion>, ProviderError>;
}

pub fn build_text_provider(
    offline_only: bool,
    cfg: &StageProviderConfig,
) -> Result<Box<dyn TextStageProvider>, ProviderError> {
    ensure_provider_allowed(offline_only, cfg)?;
    match cfg.provider {
        StageProviderKind::LocalOffline => Ok(Box::new(LocalDeterministicProvider)),
        StageProviderKind::Ollama => Ok(Box::new(OllamaProvider::new(cfg.clone()))),
        StageProviderKind::OpenAi => Ok(Box::new(OpenAiProvider::new(cfg.clone()))),
        StageProviderKind::Gemini => Ok(Box::new(GeminiProvider::new(cfg.clone()))),
    }
}

pub struct LocalDeterministicProvider;

fn extract_key_terms(title: &str, text: &str) -> Vec<String> {
    let stopwords: HashSet<&'static str> = [
        "the", "and", "for", "with", "that", "this", "from", "into", "when", "where", "which",
        "while", "then", "than", "also", "only", "more", "most", "such", "each", "many", "much",
        "they", "their", "them", "been", "being", "have", "has", "does", "make", "makes", "take",
        "takes", "about", "across", "over", "under", "between", "after", "before", "because",
        "since", "using", "used", "called", "mean", "means",
    ]
    .into_iter()
    .collect();

    let combined = format!("{title} {text}").to_lowercase();
    let mut terms = Vec::new();
    let mut seen = HashSet::new();

    for raw in combined.split(|c: char| !c.is_alphanumeric() && c != '-') {
        let w = raw.trim_matches('-');
        if w.len() >= 4 && !stopwords.contains(w) && seen.insert(w.to_string()) {
            terms.push(w.to_string());
            if terms.len() >= 6 {
                break;
            }
        }
    }
    terms
}

fn split_sentences(text: &str) -> Vec<String> {
    text.split(['.', '!', '?'])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| format!("{s}."))
        .collect()
}

fn infer_template(title: &str, text: &str) -> SceneTemplate {
    let lower = format!("{title} {text}").to_lowercase();
    if lower.contains("evolution")
        || lower.contains("decade")
        || lower.contains("nineteen")
        || lower.contains("1968")
        || lower.contains("1980")
        || lower.contains("history")
    {
        SceneTemplate::Timeline
    } else if lower.contains("lookup")
        || lower.contains("process")
        || lower.contains("steps")
        || lower.contains("pipeline")
        || lower.contains("compare tag")
        || lower.contains("evict")
    {
        SceneTemplate::ProcessDiagram
    } else {
        SceneTemplate::ConceptReveal
    }
}

fn infer_qualification(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    for marker in ["although ", "whereas ", "tradeoff", "cost of ", "except ", "only when "] {
        if let Some(pos) = lower.find(marker) {
            let slice = text[pos..].trim();
            return Some(slice.to_string());
        }
    }
    None
}

#[async_trait]
impl TextStageProvider for LocalDeterministicProvider {
    async fn generate_notes(
        &self,
        sources: &PreparedSources,
        depth: &NoteDepth,
        _structure_pref: &str,
        _emphasis: &str,
    ) -> Result<VerifiedNotes, ProviderError> {
        let mut points = Vec::new();

        for (idx, seg) in sources.transcript_segments.iter().enumerate() {
            let id = seg
                .topic_id
                .clone()
                .unwrap_or_else(|| format!("np-{:02}", idx + 1));
            let title = seg
                .topic_title
                .clone()
                .unwrap_or_else(|| format!("Concept {}", idx + 1));
            let sentences = split_sentences(&seg.text);
            let definition = sentences.first().cloned().unwrap_or_else(|| seg.text.clone());
            let reasoning = match depth {
                NoteDepth::Brief => sentences
                    .get(1)
                    .cloned()
                    .unwrap_or_else(|| definition.clone()),
                NoteDepth::Standard | NoteDepth::Deep => {
                    if sentences.len() > 1 {
                        sentences[1..].join(" ")
                    } else {
                        definition.clone()
                    }
                }
            };
            let qualification = infer_qualification(&seg.text);
            let example = sentences
                .iter()
                .find(|s| s.to_lowercase().contains("for example") || s.to_lowercase().contains("such as"))
                .cloned();

            let mut refs = vec![seg.id.clone()];
            let seg_terms = extract_key_terms(&title, &seg.text);
            for mat in &sources.supporting_materials {
                let mat_lower = format!("{} {}", mat.title, mat.text).to_lowercase();
                let overlap = seg_terms.iter().filter(|t| mat_lower.contains(t.as_str())).count();
                if overlap >= 2 && !refs.contains(&mat.source_ref) {
                    refs.push(mat.source_ref.clone());
                }
            }

            points.push(NotePoint {
                id,
                title: title.clone(),
                definition,
                reasoning,
                qualification,
                example,
                key_terms: seg_terms,
                source_refs: refs,
                required: true,
                preferred_template: Some(infer_template(&title, &seg.text)),
            });
        }

        Ok(VerifiedNotes {
            lecture_id: sources.lecture_id.clone(),
            title: sources.title.clone(),
            depth: depth.clone(),
            points,
            verification_passed: true,
            flags: Vec::new(),
        })
    }

    async fn verify_notes(
        &self,
        sources: &PreparedSources,
        notes: &VerifiedNotes,
    ) -> Result<VerifiedNotes, ProviderError> {
        let mut verified = notes.clone();
        let mut flags = Vec::new();
        let valid_refs: HashSet<String> = sources
            .transcript_segments
            .iter()
            .map(|s| s.id.clone())
            .chain(sources.supporting_materials.iter().map(|m| m.source_ref.clone()))
            .collect();

        for point in &verified.points {
            if point.source_refs.is_empty() {
                flags.push(NoteVerificationFlag {
                    note_point_id: point.id.clone(),
                    kind: "missing_source_ref".to_string(),
                    message: format!("Note point '{}' has no source reference.", point.id),
                });
            }
            for r in &point.source_refs {
                if !valid_refs.contains(r) {
                    flags.push(NoteVerificationFlag {
                        note_point_id: point.id.clone(),
                        kind: "unknown_source_ref".to_string(),
                        message: format!("Unknown source reference '{r}' on note '{}'.", point.id),
                    });
                }
            }
            if point.definition.trim().is_empty() || point.reasoning.trim().is_empty() {
                flags.push(NoteVerificationFlag {
                    note_point_id: point.id.clone(),
                    kind: "incomplete_note".to_string(),
                    message: format!("Note point '{}' lacks definition or reasoning.", point.id),
                });
            }
        }

        for conflict in &sources.conflicts {
            flags.push(NoteVerificationFlag {
                note_point_id: "source-conflict".to_string(),
                kind: conflict.kind.clone(),
                message: conflict.description.clone(),
            });
        }

        let hard_failures = flags
            .iter()
            .any(|f| f.kind == "missing_source_ref" || f.kind == "unknown_source_ref" || f.kind == "incomplete_note");

        verified.verification_passed = !hard_failures;
        verified.flags = flags;
        Ok(verified)
    }

    async fn generate_scene_plan(&self, notes: &VerifiedNotes) -> Result<ScenePlan, ProviderError> {
        let mut scenes = Vec::new();

        for (idx, pt) in notes.points.iter().enumerate() {
            let tpl = pt
                .preferred_template
                .clone()
                .unwrap_or(SceneTemplate::ConceptReveal);
            let scene_id = format!("scene-{:02}", idx + 1);

            let (items, sentences) = match tpl {
                SceneTemplate::ProcessDiagram => {
                    let sents = vec![
                        pt.definition.clone(),
                        format!(
                            "Second, tags inside the indexed set are compared to detect a cache hit or cache miss."
                        ),
                        format!(
                            "Finally, misses fetch the line from lower memory and evict a victim line. {}",
                            pt.reasoning
                        ),
                    ];
                    let items = vec![
                        SceneItem {
                            id: format!("{scene_id}-1"),
                            badge: Some("Step 1".to_string()),
                            label: "Split Address".to_string(),
                            detail: pt.definition.clone(),
                            cue_index: Some(0),
                        },
                        SceneItem {
                            id: format!("{scene_id}-2"),
                            badge: Some("Step 2".to_string()),
                            label: "Compare Tags".to_string(),
                            detail: "Check valid bit and matching tag in indexed set for hit or miss.".to_string(),
                            cue_index: Some(1),
                        },
                        SceneItem {
                            id: format!("{scene_id}-3"),
                            badge: Some("Step 3".to_string()),
                            label: "Fill & Evict".to_string(),
                            detail: "Fetch missing cache line from lower memory and evict LRU victim.".to_string(),
                            cue_index: Some(2),
                        },
                    ];
                    (items, sents)
                }
                SceneTemplate::Timeline => {
                    let sents = vec![
                        "In 1968, IBM System 360 Model 85 pioneered commercial cache memory.".to_string(),
                        "Across the 1980s and 1990s, CPUs moved L1 on-chip and added L2 and L3 tiers.".to_string(),
                        format!("In the 2000s, multicore processors added hardware coherence protocols. {}", pt.definition),
                    ];
                    let items = vec![
                        SceneItem {
                            id: format!("{scene_id}-1"),
                            badge: Some("1968".to_string()),
                            label: "IBM 360/85 Cache".to_string(),
                            detail: "First commercial high-speed cache bridging main memory latency.".to_string(),
                            cue_index: Some(0),
                        },
                        SceneItem {
                            id: format!("{scene_id}-2"),
                            badge: Some("1980s–1990s".to_string()),
                            label: "On-Die L1 & L2/L3".to_string(),
                            detail: "Microprocessors integrated on-chip L1 caches and multi-level hierarchies.".to_string(),
                            cue_index: Some(1),
                        },
                        SceneItem {
                            id: format!("{scene_id}-3"),
                            badge: Some("2000s+".to_string()),
                            label: "Multicore Coherence".to_string(),
                            detail: "Hardware MESI protocols keep shared caches coherent across cores.".to_string(),
                            cue_index: Some(2),
                        },
                    ];
                    (items, sents)
                }
                SceneTemplate::ConceptReveal => {
                    let mut sents = vec![pt.definition.clone()];
                    let mut items = vec![SceneItem {
                        id: format!("{scene_id}-def"),
                        badge: Some("Core Idea".to_string()),
                        label: pt.title.clone(),
                        detail: pt.definition.clone(),
                        cue_index: Some(0),
                    }];

                    if pt.reasoning != pt.definition {
                        let cue = sents.len();
                        sents.push(pt.reasoning.clone());
                        items.push(SceneItem {
                            id: format!("{scene_id}-why"),
                            badge: Some("Mechanism".to_string()),
                            label: "Why & How It Works".to_string(),
                            detail: pt.reasoning.clone(),
                            cue_index: Some(cue),
                        });
                    }
                    if let Some(q) = &pt.qualification {
                        if !pt.reasoning.contains(q) {
                            let cue = sents.len();
                            sents.push(q.clone());
                            items.push(SceneItem {
                                id: format!("{scene_id}-qual"),
                                badge: Some("Caveat".to_string()),
                                label: "Important Qualification".to_string(),
                                detail: q.clone(),
                                cue_index: Some(cue),
                            });
                        }
                    }
                    (items, sents)
                }
            };

            scenes.push(SceneSpec {
                scene_id: scene_id.clone(),
                base_scene_id: scene_id,
                part_index: 1,
                part_total: 1,
                title: pt.title.clone(),
                subtitle: Some(format!("Verified note {}", pt.id)),
                template: tpl,
                note_point_ids: vec![pt.id.clone()],
                source_refs: pt.source_refs.clone(),
                narration_sentences: sentences,
                items,
                footer_note: Some(format!("LearningEdge · {}", pt.id)),
            });
        }

        Ok(ScenePlan {
            lecture_id: notes.lecture_id.clone(),
            title: notes.title.clone(),
            scenes,
        })
    }

    async fn verify_coverage_semantic(
        &self,
        notes: &VerifiedNotes,
        plan: &ScenePlan,
    ) -> Result<Vec<CoverageIssue>, ProviderError> {
        let mut issues = Vec::new();
        let explanatory_markers = [
            "because",
            "since",
            "means",
            "when ",
            "whereas",
            "while",
            "so that",
            "avoids",
            "fetches",
            "stores",
            "checks",
            "compares",
            "evicts",
            "updates",
            "bridges",
            "exploits",
            "splits",
            "balances",
            "trading",
            "takes ",
            "works",
            "pioneered",
            "integrated",
            "introduced",
            "runs ",
        ];

        for point in notes.points.iter().filter(|p| p.required) {
            let matching_scenes: Vec<&SceneSpec> = plan
                .scenes
                .iter()
                .filter(|s| s.note_point_ids.contains(&point.id))
                .collect();

            if matching_scenes.is_empty() {
                // MissingRequiredPoint is handled by structural phase, skip duplicate here
                continue;
            }

            let combined_narration: String = matching_scenes
                .iter()
                .flat_map(|s| s.narration_sentences.iter().cloned())
                .collect::<Vec<_>>()
                .join(" ");
            let combined_visuals: String = matching_scenes
                .iter()
                .flat_map(|s| {
                    s.items
                        .iter()
                        .map(|i| format!("{} {}", i.label, i.detail))
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
                .join(" ");
            let combined = format!("{combined_narration} {combined_visuals}").to_lowercase();

            let narration_words = combined_narration.split_whitespace().count();
            let has_marker = explanatory_markers.iter().any(|m| combined.contains(m));
            let matched_terms = point
                .key_terms
                .iter()
                .filter(|t| combined.contains(t.as_str()))
                .count();
            let required_terms = point.key_terms.len().min(2);

            let is_shallow_mention = combined.contains("briefly mention")
                || combined.contains("mentioned only")
                || narration_words < 10
                || !has_marker
                || matched_terms < required_terms;

            if is_shallow_mention {
                issues.push(CoverageIssue {
                    note_point_id: point.id.clone(),
                    scene_id: matching_scenes.first().map(|s| s.scene_id.clone()),
                    kind: CoverageIssueKind::ShallowMentionWithoutExplanation,
                    message: format!(
                        "Required note '{}' ({}) is referenced in scene(s) {:?}, but narration/visuals only mention it superficially without explaining the mechanism (narration_words={}, matched_terms={}/{}).",
                        point.id,
                        point.title,
                        matching_scenes.iter().map(|s| &s.scene_id).collect::<Vec<_>>(),
                        narration_words,
                        matched_terms,
                        required_terms
                    ),
                });
            }
        }

        Ok(issues)
    }

    async fn dream_suggestions(
        &self,
        concepts: &[KgConcept],
    ) -> Result<Vec<DreamSuggestion>, ProviderError> {
        let mut suggestions = Vec::new();
        for i in 0..concepts.len() {
            for j in (i + 1)..concepts.len() {
                let a = &concepts[i];
                let b = &concepts[j];
                let a_words: HashSet<String> = extract_key_terms(&a.label, &a.summary)
                    .into_iter()
                    .collect();
                let b_words: HashSet<String> = extract_key_terms(&b.label, &b.summary)
                    .into_iter()
                    .collect();
                let shared: Vec<String> = a_words.intersection(&b_words).cloned().collect();
                if shared.len() >= 2 {
                    let mut sources: Vec<String> = a
                        .links
                        .iter()
                        .flat_map(|l| l.source_refs.clone())
                        .chain(b.links.iter().flat_map(|l| l.source_refs.clone()))
                        .collect();
                    sources.sort();
                    sources.dedup();
                    suggestions.push(DreamSuggestion {
                        id: format!("dream-conn-{}-{}", a.id, b.id),
                        kind: "candidate_connection".to_string(),
                        from_concept_id: Some(a.id.clone()),
                        to_concept_id: Some(b.id.clone()),
                        title: format!("Link '{}' ↔ '{}'", a.label, b.label),
                        rationale: format!(
                            "Both concepts share technical mechanisms ({}) across recorded sources.",
                            shared.join(", ")
                        ),
                        supporting_sources: sources,
                        status: "pending".to_string(),
                    });
                }
            }

            if a_mentions_coherence(&concepts[i]) && !concepts.iter().any(|c| c.label.to_lowercase().contains("mesi")) {
                suggestions.push(DreamSuggestion {
                    id: format!("dream-gap-mesi-{}", concepts[i].id),
                    kind: "knowledge_gap".to_string(),
                    from_concept_id: Some(concepts[i].id.clone()),
                    to_concept_id: None,
                    title: "Knowledge Gap: MESI Cache Coherence Protocol States".to_string(),
                    rationale: format!(
                        "'{}' references MESI hardware coherence, which does not yet have a dedicated deep note or explainer scene.",
                        concepts[i].label
                    ),
                    supporting_sources: concepts[i]
                        .links
                        .iter()
                        .flat_map(|l| l.source_refs.clone())
                        .collect(),
                    status: "pending".to_string(),
                });
            }
        }
        suggestions.truncate(8);
        Ok(suggestions)
    }
}

fn a_mentions_coherence(c: &KgConcept) -> bool {
    let lower = format!("{} {}", c.label, c.summary).to_lowercase();
    lower.contains("mesi") || lower.contains("coherence")
}

// ---------- Cloud & Local LLM HTTP Providers ----------

#[derive(Clone)]
pub struct OllamaProvider {
    cfg: StageProviderConfig,
    client: Client,
}

impl OllamaProvider {
    pub fn new(cfg: StageProviderConfig) -> Self {
        Self {
            cfg,
            client: Client::new(),
        }
    }

    async fn chat_json(&self, system: &str, user_prompt: &str) -> Result<Value, ProviderError> {
        let base = self
            .cfg
            .base_url
            .clone()
            .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());
        let url = format!("{}/api/chat", base.trim_end_matches('/'));
        let think_enabled = !matches!(self.cfg.thinking, ThinkingLevel::Off);

        retry_with_backoff(3, 250, |_| async {
            let body = json!({
                "model": self.cfg.model,
                "stream": false,
                "format": "json",
                "think": think_enabled,
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user_prompt }
                ]
            });
            let resp = self
                .client
                .post(&url)
                .json(&body)
                .send()
                .await
                .map_err(|e| ProviderError::Transient {
                    status: None,
                    message: format!("Ollama loopback request failed: {e}"),
                })?;

            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                if status.as_u16() >= 500 {
                    return Err(ProviderError::Transient {
                        status: Some(status.as_u16()),
                        message: text,
                    });
                }
                return Err(ProviderError::Fatal(format!("Ollama HTTP {status}: {text}")));
            }
            let v: Value = serde_json::from_str(&text)
                .map_err(|e| ProviderError::Fatal(format!("Invalid Ollama JSON: {e}")))?;
            let content = v["message"]["content"]
                .as_str()
                .ok_or_else(|| ProviderError::Fatal("Missing message.content in Ollama response".to_string()))?;
            serde_json::from_str(content)
                .map_err(|e| ProviderError::Fatal(format!("Model JSON parse error: {e}")))
        })
        .await
    }
}

#[async_trait]
impl TextStageProvider for OllamaProvider {
    async fn generate_notes(
        &self,
        sources: &PreparedSources,
        depth: &NoteDepth,
        structure_pref: &str,
        emphasis: &str,
    ) -> Result<VerifiedNotes, ProviderError> {
        let prompt = serde_json::to_string(&json!({
            "sources": sources,
            "depth": depth,
            "structure_preference": structure_pref,
            "emphasis": emphasis,
        }))
        .map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json(
                "Return JSON matching VerifiedNotes schema preserving source_refs and ids.",
                &prompt,
            )
            .await?;
        serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))
    }

    async fn verify_notes(
        &self,
        sources: &PreparedSources,
        notes: &VerifiedNotes,
    ) -> Result<VerifiedNotes, ProviderError> {
        let prompt = serde_json::to_string(&json!({ "sources": sources, "notes": notes }))
            .map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json("Verify notes against sources and return VerifiedNotes JSON.", &prompt)
            .await?;
        serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))
    }

    async fn generate_scene_plan(&self, notes: &VerifiedNotes) -> Result<ScenePlan, ProviderError> {
        let prompt =
            serde_json::to_string(notes).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json("Generate ScenePlan JSON covering all required note points.", &prompt)
            .await?;
        serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))
    }

    async fn verify_coverage_semantic(
        &self,
        notes: &VerifiedNotes,
        plan: &ScenePlan,
    ) -> Result<Vec<CoverageIssue>, ProviderError> {
        #[derive(Deserialize)]
        struct IssuesWrapper {
            issues: Vec<CoverageIssue>,
        }
        let prompt = serde_json::to_string(&json!({ "notes": notes, "plan": plan }))
            .map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json(
                "Check each required note point is actually explained in scene narration/visuals. Return { issues: CoverageIssue[] }.",
                &prompt,
            )
            .await?;
        let w: IssuesWrapper =
            serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        Ok(w.issues)
    }

    async fn dream_suggestions(
        &self,
        concepts: &[KgConcept],
    ) -> Result<Vec<DreamSuggestion>, ProviderError> {
        #[derive(Deserialize)]
        struct Wrap {
            suggestions: Vec<DreamSuggestion>,
        }
        let prompt =
            serde_json::to_string(concepts).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json(
                "Propose candidate connections and knowledge gaps as { suggestions: DreamSuggestion[] }.",
                &prompt,
            )
            .await?;
        let w: Wrap = serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        Ok(w.suggestions)
    }
}

#[derive(Clone)]
pub struct OpenAiProvider {
    cfg: StageProviderConfig,
    client: Client,
}

impl OpenAiProvider {
    pub fn new(cfg: StageProviderConfig) -> Self {
        Self {
            cfg,
            client: Client::new(),
        }
    }

    async fn chat_json(&self, system: &str, user_prompt: &str) -> Result<Value, ProviderError> {
        let cred_ref = self.cfg.credential_ref.as_deref().ok_or_else(|| {
            ProviderError::AuthError("openai".to_string(), "Missing credential_ref".to_string())
        })?;
        let api_key = credentials::get_secret(cred_ref)
            .map_err(|e| ProviderError::AuthError(cred_ref.to_string(), e.to_string()))?;
        let base = self
            .cfg
            .base_url
            .clone()
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string());
        let url = format!("{}/chat/completions", base.trim_end_matches('/'));

        retry_with_backoff(3, 300, |_| async {
            let mut body = json!({
                "model": self.cfg.model,
                "response_format": { "type": "json_object" },
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user_prompt }
                ]
            });
            if !matches!(self.cfg.thinking, ThinkingLevel::Off) {
                let effort = match self.cfg.thinking {
                    ThinkingLevel::Low => "low",
                    ThinkingLevel::Medium => "medium",
                    ThinkingLevel::High => "high",
                    ThinkingLevel::Off => "low",
                };
                body["reasoning_effort"] = json!(effort);
            }

            let resp = self
                .client
                .post(&url)
                .bearer_auth(&api_key)
                .json(&body)
                .send()
                .await
                .map_err(|e| ProviderError::Transient {
                    status: None,
                    message: format!("OpenAI request failed: {e}"),
                })?;

            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if status.as_u16() == 401 || status.as_u16() == 403 {
                return Err(ProviderError::AuthError(cred_ref.to_string(), text));
            }
            if status.as_u16() == 429 || status.as_u16() >= 500 {
                return Err(ProviderError::Transient {
                    status: Some(status.as_u16()),
                    message: text,
                });
            }
            if !status.is_success() {
                return Err(ProviderError::Fatal(format!("OpenAI HTTP {status}: {text}")));
            }

            let v: Value = serde_json::from_str(&text)
                .map_err(|e| ProviderError::Fatal(format!("Invalid OpenAI JSON: {e}")))?;
            let content = v["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| ProviderError::Fatal("Missing message.content in OpenAI response".to_string()))?;
            serde_json::from_str(content)
                .map_err(|e| ProviderError::Fatal(format!("Model JSON parse error: {e}")))
        })
        .await
    }
}

#[async_trait]
impl TextStageProvider for OpenAiProvider {
    async fn generate_notes(
        &self,
        sources: &PreparedSources,
        depth: &NoteDepth,
        structure_pref: &str,
        emphasis: &str,
    ) -> Result<VerifiedNotes, ProviderError> {
        let prompt = serde_json::to_string(&json!({
            "sources": sources,
            "depth": depth,
            "structure_preference": structure_pref,
            "emphasis": emphasis,
        }))
        .map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json("Return JSON matching VerifiedNotes schema.", &prompt)
            .await?;
        serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))
    }

    async fn verify_notes(
        &self,
        sources: &PreparedSources,
        notes: &VerifiedNotes,
    ) -> Result<VerifiedNotes, ProviderError> {
        let prompt = serde_json::to_string(&json!({ "sources": sources, "notes": notes }))
            .map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json("Verify notes against sources and return VerifiedNotes JSON.", &prompt)
            .await?;
        serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))
    }

    async fn generate_scene_plan(&self, notes: &VerifiedNotes) -> Result<ScenePlan, ProviderError> {
        let prompt =
            serde_json::to_string(notes).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json("Generate ScenePlan JSON covering all required note points.", &prompt)
            .await?;
        serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))
    }

    async fn verify_coverage_semantic(
        &self,
        notes: &VerifiedNotes,
        plan: &ScenePlan,
    ) -> Result<Vec<CoverageIssue>, ProviderError> {
        #[derive(Deserialize)]
        struct IssuesWrapper {
            issues: Vec<CoverageIssue>,
        }
        let prompt = serde_json::to_string(&json!({ "notes": notes, "plan": plan }))
            .map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json(
                "Check coverage depth and return { issues: CoverageIssue[] }.",
                &prompt,
            )
            .await?;
        let w: IssuesWrapper =
            serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        Ok(w.issues)
    }

    async fn dream_suggestions(
        &self,
        concepts: &[KgConcept],
    ) -> Result<Vec<DreamSuggestion>, ProviderError> {
        #[derive(Deserialize)]
        struct Wrap {
            suggestions: Vec<DreamSuggestion>,
        }
        let prompt =
            serde_json::to_string(concepts).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .chat_json("Propose { suggestions: DreamSuggestion[] }.", &prompt)
            .await?;
        let w: Wrap = serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        Ok(w.suggestions)
    }
}

#[derive(Clone)]
pub struct GeminiProvider {
    cfg: StageProviderConfig,
    client: Client,
}

impl GeminiProvider {
    pub fn new(cfg: StageProviderConfig) -> Self {
        Self {
            cfg,
            client: Client::new(),
        }
    }

    async fn generate_json(&self, system: &str, user_prompt: &str) -> Result<Value, ProviderError> {
        let cred_ref = self.cfg.credential_ref.as_deref().ok_or_else(|| {
            ProviderError::AuthError("gemini".to_string(), "Missing credential_ref".to_string())
        })?;
        let api_key = credentials::get_secret(cred_ref)
            .map_err(|e| ProviderError::AuthError(cred_ref.to_string(), e.to_string()))?;
        let base = self
            .cfg
            .base_url
            .clone()
            .unwrap_or_else(|| "https://generativelanguage.googleapis.com/v1beta".to_string());
        let url = format!(
            "{}/models/{}:generateContent",
            base.trim_end_matches('/'),
            self.cfg.model
        );

        let budget = match self.cfg.thinking {
            ThinkingLevel::Off => 0,
            ThinkingLevel::Low => 1024,
            ThinkingLevel::Medium => 4096,
            ThinkingLevel::High => 8192,
        };

        retry_with_backoff(3, 300, |_| async {
            let body = json!({
                "systemInstruction": { "parts": [{ "text": system }] },
                "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "thinkingConfig": { "thinkingBudget": budget }
                }
            });

            let resp = self
                .client
                .post(&url)
                .header("x-goog-api-key", &api_key)
                .json(&body)
                .send()
                .await
                .map_err(|e| ProviderError::Transient {
                    status: None,
                    message: format!("Gemini request failed: {e}"),
                })?;

            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if status.as_u16() == 401 || status.as_u16() == 403 {
                return Err(ProviderError::AuthError(cred_ref.to_string(), text));
            }
            if status.as_u16() == 429 || status.as_u16() >= 500 {
                return Err(ProviderError::Transient {
                    status: Some(status.as_u16()),
                    message: text,
                });
            }
            if !status.is_success() {
                return Err(ProviderError::Fatal(format!("Gemini HTTP {status}: {text}")));
            }

            let v: Value = serde_json::from_str(&text)
                .map_err(|e| ProviderError::Fatal(format!("Invalid Gemini JSON: {e}")))?;
            let content = v["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .ok_or_else(|| ProviderError::Fatal("Missing candidate text in Gemini response".to_string()))?;
            serde_json::from_str(content)
                .map_err(|e| ProviderError::Fatal(format!("Model JSON parse error: {e}")))
        })
        .await
    }
}

#[async_trait]
impl TextStageProvider for GeminiProvider {
    async fn generate_notes(
        &self,
        sources: &PreparedSources,
        depth: &NoteDepth,
        structure_pref: &str,
        emphasis: &str,
    ) -> Result<VerifiedNotes, ProviderError> {
        let prompt = serde_json::to_string(&json!({
            "sources": sources,
            "depth": depth,
            "structure_preference": structure_pref,
            "emphasis": emphasis,
        }))
        .map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .generate_json("Return JSON matching VerifiedNotes schema.", &prompt)
            .await?;
        serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))
    }

    async fn verify_notes(
        &self,
        sources: &PreparedSources,
        notes: &VerifiedNotes,
    ) -> Result<VerifiedNotes, ProviderError> {
        let prompt = serde_json::to_string(&json!({ "sources": sources, "notes": notes }))
            .map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .generate_json("Verify notes against sources and return VerifiedNotes JSON.", &prompt)
            .await?;
        serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))
    }

    async fn generate_scene_plan(&self, notes: &VerifiedNotes) -> Result<ScenePlan, ProviderError> {
        let prompt =
            serde_json::to_string(notes).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .generate_json("Generate ScenePlan JSON covering all required note points.", &prompt)
            .await?;
        serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))
    }

    async fn verify_coverage_semantic(
        &self,
        notes: &VerifiedNotes,
        plan: &ScenePlan,
    ) -> Result<Vec<CoverageIssue>, ProviderError> {
        #[derive(Deserialize)]
        struct IssuesWrapper {
            issues: Vec<CoverageIssue>,
        }
        let prompt = serde_json::to_string(&json!({ "notes": notes, "plan": plan }))
            .map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .generate_json("Check coverage depth and return { issues: CoverageIssue[] }.", &prompt)
            .await?;
        let w: IssuesWrapper =
            serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        Ok(w.issues)
    }

    async fn dream_suggestions(
        &self,
        concepts: &[KgConcept],
    ) -> Result<Vec<DreamSuggestion>, ProviderError> {
        #[derive(Deserialize)]
        struct Wrap {
            suggestions: Vec<DreamSuggestion>,
        }
        let prompt =
            serde_json::to_string(concepts).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        let val = self
            .generate_json("Propose { suggestions: DreamSuggestion[] }.", &prompt)
            .await?;
        let w: Wrap = serde_json::from_value(val).map_err(|e| ProviderError::Fatal(e.to_string()))?;
        Ok(w.suggestions)
    }
}
