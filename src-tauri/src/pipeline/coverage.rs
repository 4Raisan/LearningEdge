use anyhow::Result;
use std::collections::HashSet;

use crate::models::{CoverageIssue, CoverageIssueKind, CoverageReport, ScenePlan, VerifiedNotes};
use crate::providers::text::TextStageProvider;

pub async fn verify_scene_plan_coverage(
    notes: &VerifiedNotes,
    plan: &ScenePlan,
    semantic_provider: Option<&dyn TextStageProvider>,
) -> Result<CoverageReport> {
    let mut issues = Vec::new();

    // Phase 1: Deterministic structural & ID coverage checks
    let mut seen_scene_ids = HashSet::new();
    let mut covered_note_ids = HashSet::new();

    for scene in &plan.scenes {
        if scene.scene_id.trim().is_empty() || !seen_scene_ids.insert(scene.scene_id.clone()) {
            issues.push(CoverageIssue {
                note_point_id: scene
                    .note_point_ids
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "unknown".to_string()),
                scene_id: Some(scene.scene_id.clone()),
                kind: CoverageIssueKind::InvalidStructure,
                message: format!("Duplicate or empty scene_id '{}'.", scene.scene_id),
            });
        }
        if scene.narration_sentences.is_empty() || scene.items.is_empty() {
            issues.push(CoverageIssue {
                note_point_id: scene
                    .note_point_ids
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "unknown".to_string()),
                scene_id: Some(scene.scene_id.clone()),
                kind: CoverageIssueKind::InvalidStructure,
                message: format!(
                    "Scene '{}' must have both narration_sentences and visual items.",
                    scene.scene_id
                ),
            });
        }
        if scene.source_refs.is_empty() {
            issues.push(CoverageIssue {
                note_point_id: scene
                    .note_point_ids
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "unknown".to_string()),
                scene_id: Some(scene.scene_id.clone()),
                kind: CoverageIssueKind::UnresolvedSourceReference,
                message: format!("Scene '{}' has no source_refs.", scene.scene_id),
            });
        }
        for nid in &scene.note_point_ids {
            covered_note_ids.insert(nid.clone());
        }
    }

    let required_points: Vec<_> = notes.points.iter().filter(|p| p.required).collect();
    for pt in &required_points {
        if !covered_note_ids.contains(&pt.id) {
            issues.push(CoverageIssue {
                note_point_id: pt.id.clone(),
                scene_id: None,
                kind: CoverageIssueKind::MissingRequiredPoint,
                message: format!(
                    "Required note point '{}' ({}) is not covered by any scene in the scene plan.",
                    pt.id, pt.title
                ),
            });
        }
    }

    // Phase 2: Semantic explanation-depth verification
    if let Some(provider) = semantic_provider {
        let semantic_issues = provider
            .verify_coverage_semantic(notes, plan)
            .await
            .map_err(|e| anyhow::anyhow!(e))?;
        issues.extend(semantic_issues);
    }

    Ok(CoverageReport {
        passed: issues.is_empty(),
        checked_points: required_points.len(),
        issues,
    })
}
