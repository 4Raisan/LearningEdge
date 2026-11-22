use anyhow::{anyhow, Result};
use sqlx::{Row, SqlitePool};
use std::collections::HashSet;

use crate::db::now_rfc3339;
use crate::models::{
    DreamSuggestion, KgConcept, KgConceptLink, KgEdge, KnowledgeGraphSnapshot, VerifiedNotes,
    VideoManifest,
};
use crate::providers::text::LocalDeterministicProvider;
use crate::providers::text::TextStageProvider;

pub async fn populate_kg_from_run(
    pool: &SqlitePool,
    notes: &VerifiedNotes,
    manifest: Option<&VideoManifest>,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    let mut concept_ids_in_order = Vec::new();

    for pt in &notes.points {
        let concept_id = format!("concept-{}", pt.id);
        let summary = format!("{} {}", pt.definition, pt.reasoning);
        sqlx::query(
            r#"
            INSERT INTO kg_concepts (id, label, summary, aliases_json, created_at)
            VALUES (?1, ?2, ?3, '[]', ?4)
            ON CONFLICT(id) DO UPDATE SET
                label = excluded.label,
                summary = excluded.summary
            "#,
        )
        .bind(&concept_id)
        .bind(&pt.title)
        .bind(&summary)
        .bind(now_rfc3339())
        .execute(&mut *tx)
        .await?;

        sqlx::query("DELETE FROM kg_concept_links WHERE concept_id = ?1 AND lecture_id = ?2")
            .bind(&concept_id)
            .bind(&notes.lecture_id)
            .execute(&mut *tx)
            .await?;

        let matching_scenes: Vec<_> = manifest
            .map(|m| {
                m.scenes
                    .iter()
                    .filter(|s| s.note_point_ids.contains(&pt.id))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        if matching_scenes.is_empty() {
            let link_id = format!("link-{}-{}", concept_id, notes.lecture_id);
            sqlx::query(
                r#"
                INSERT INTO kg_concept_links
                    (id, concept_id, lecture_id, source_refs_json, note_point_id, scene_id, video_start_ms, video_end_ms)
                VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL)
                "#,
            )
            .bind(&link_id)
            .bind(&concept_id)
            .bind(&notes.lecture_id)
            .bind(serde_json::to_string(&pt.source_refs)?)
            .bind(&pt.id)
            .execute(&mut *tx)
            .await?;
        } else {
            for (i, scene) in matching_scenes.iter().enumerate() {
                let link_id = format!("link-{}-{}-{i}", concept_id, notes.lecture_id);
                sqlx::query(
                    r#"
                    INSERT INTO kg_concept_links
                        (id, concept_id, lecture_id, source_refs_json, note_point_id, scene_id, video_start_ms, video_end_ms)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                    "#,
                )
                .bind(&link_id)
                .bind(&concept_id)
                .bind(&notes.lecture_id)
                .bind(serde_json::to_string(&pt.source_refs)?)
                .bind(&pt.id)
                .bind(&scene.scene_id)
                .bind(scene.start_ms as i64)
                .bind(scene.end_ms as i64)
                .execute(&mut *tx)
                .await?;
            }
        }

        concept_ids_in_order.push((concept_id, pt.source_refs.clone()));
    }

    // Sequential lecture flow prerequisite edges
    for pair in concept_ids_in_order.windows(2) {
        let (from_id, from_refs) = &pair[0];
        let (to_id, to_refs) = &pair[1];
        let mut combined_refs = from_refs.clone();
        for r in to_refs {
            if !combined_refs.contains(r) {
                combined_refs.push(r.clone());
            }
        }
        let edge_id = format!("edge-{from_id}-{to_id}");
        sqlx::query(
            r#"
            INSERT INTO kg_edges (id, from_concept_id, to_concept_id, relation, supporting_sources_json, created_at)
            VALUES (?1, ?2, ?3, 'leads_to', ?4, ?5)
            ON CONFLICT(from_concept_id, to_concept_id, relation) DO NOTHING
            "#,
        )
        .bind(&edge_id)
        .bind(from_id)
        .bind(to_id)
        .bind(serde_json::to_string(&combined_refs)?)
        .bind(now_rfc3339())
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn get_knowledge_graph(pool: &SqlitePool) -> Result<KnowledgeGraphSnapshot> {
    let concept_rows =
        sqlx::query("SELECT id, label, summary, aliases_json FROM kg_concepts ORDER BY label ASC")
            .fetch_all(pool)
            .await?;
    let link_rows = sqlx::query(
        r#"
        SELECT id, concept_id, lecture_id, source_refs_json, note_point_id, scene_id, video_start_ms, video_end_ms
        FROM kg_concept_links
        "#,
    )
    .fetch_all(pool)
    .await?;

    let all_links: Vec<KgConceptLink> = link_rows
        .into_iter()
        .map(|r| KgConceptLink {
            id: r.get("id"),
            concept_id: r.get("concept_id"),
            lecture_id: r.get("lecture_id"),
            source_refs: serde_json::from_str(r.get::<String, _>("source_refs_json").as_str())
                .unwrap_or_default(),
            note_point_id: r.get("note_point_id"),
            scene_id: r.get("scene_id"),
            video_start_ms: r.get("video_start_ms"),
            video_end_ms: r.get("video_end_ms"),
        })
        .collect();

    let concepts = concept_rows
        .into_iter()
        .map(|r| {
            let cid: String = r.get("id");
            let links = all_links
                .iter()
                .filter(|l| l.concept_id == cid)
                .cloned()
                .collect();
            KgConcept {
                id: cid,
                label: r.get("label"),
                summary: r.get("summary"),
                aliases: serde_json::from_str(r.get::<String, _>("aliases_json").as_str())
                    .unwrap_or_default(),
                links,
            }
        })
        .collect();

    let edge_rows = sqlx::query(
        "SELECT id, from_concept_id, to_concept_id, relation, supporting_sources_json FROM kg_edges",
    )
    .fetch_all(pool)
    .await?;
    let edges = edge_rows
        .into_iter()
        .map(|r| KgEdge {
            id: r.get("id"),
            from_concept_id: r.get("from_concept_id"),
            to_concept_id: r.get("to_concept_id"),
            relation: r.get("relation"),
            supporting_sources: serde_json::from_str(
                r.get::<String, _>("supporting_sources_json").as_str(),
            )
            .unwrap_or_default(),
        })
        .collect();

    let dream_rows = sqlx::query(
        r#"
        SELECT id, kind, from_concept_id, to_concept_id, title, rationale, supporting_sources_json, status
        FROM kg_dream_suggestions
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?;
    let dream_suggestions = dream_rows
        .into_iter()
        .map(|r| DreamSuggestion {
            id: r.get("id"),
            kind: r.get("kind"),
            from_concept_id: r.get("from_concept_id"),
            to_concept_id: r.get("to_concept_id"),
            title: r.get("title"),
            rationale: r.get("rationale"),
            supporting_sources: serde_json::from_str(
                r.get::<String, _>("supporting_sources_json").as_str(),
            )
            .unwrap_or_default(),
            status: r.get("status"),
        })
        .collect();

    Ok(KnowledgeGraphSnapshot {
        concepts,
        edges,
        dream_suggestions,
    })
}

pub async fn upsert_concept(
    pool: &SqlitePool,
    id: &str,
    label: &str,
    summary: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO kg_concepts (id, label, summary, aliases_json, created_at)
        VALUES (?1, ?2, ?3, '[]', ?4)
        ON CONFLICT(id) DO UPDATE SET
            label = excluded.label,
            summary = excluded.summary
        "#,
    )
    .bind(id)
    .bind(label)
    .bind(summary)
    .bind(now_rfc3339())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn merge_duplicate_concepts(
    pool: &SqlitePool,
    keep_id: &str,
    merge_id: &str,
) -> Result<()> {
    if keep_id == merge_id {
        return Err(anyhow!("Cannot merge concept with itself"));
    }
    let mut tx = pool.begin().await?;

    let keep_row = sqlx::query("SELECT aliases_json FROM kg_concepts WHERE id = ?1")
        .bind(keep_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| anyhow!("Keep concept '{keep_id}' not found"))?;
    let merge_row = sqlx::query("SELECT label, aliases_json FROM kg_concepts WHERE id = ?1")
        .bind(merge_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| anyhow!("Merge concept '{merge_id}' not found"))?;

    let mut aliases: Vec<String> =
        serde_json::from_str(keep_row.get::<String, _>("aliases_json").as_str())
            .unwrap_or_default();
    let merge_label: String = merge_row.get("label");
    let merge_aliases: Vec<String> =
        serde_json::from_str(merge_row.get::<String, _>("aliases_json").as_str())
            .unwrap_or_default();

    for a in std::iter::once(merge_label).chain(merge_aliases) {
        if !aliases.contains(&a) {
            aliases.push(a);
        }
    }

    sqlx::query("UPDATE kg_concepts SET aliases_json = ?2 WHERE id = ?1")
        .bind(keep_id)
        .bind(serde_json::to_string(&aliases)?)
        .execute(&mut *tx)
        .await?;

    sqlx::query("UPDATE kg_concept_links SET concept_id = ?1 WHERE concept_id = ?2")
        .bind(keep_id)
        .bind(merge_id)
        .execute(&mut *tx)
        .await?;

    // Reassign edges while avoiding duplicates and self-loops
    let edges = sqlx::query(
        "SELECT id, from_concept_id, to_concept_id, relation, supporting_sources_json FROM kg_edges WHERE from_concept_id = ?1 OR to_concept_id = ?1",
    )
    .bind(merge_id)
    .fetch_all(&mut *tx)
    .await?;

    for e in edges {
        let eid: String = e.get("id");
        let from_id: String = e.get("from_concept_id");
        let to_id: String = e.get("to_concept_id");
        let rel: String = e.get("relation");
        let srcs: String = e.get("supporting_sources_json");

        let new_from = if from_id == merge_id {
            keep_id.to_string()
        } else {
            from_id
        };
        let new_to = if to_id == merge_id {
            keep_id.to_string()
        } else {
            to_id
        };

        sqlx::query("DELETE FROM kg_edges WHERE id = ?1")
            .bind(&eid)
            .execute(&mut *tx)
            .await?;

        if new_from != new_to {
            sqlx::query(
                r#"
                INSERT INTO kg_edges (id, from_concept_id, to_concept_id, relation, supporting_sources_json, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(from_concept_id, to_concept_id, relation) DO NOTHING
                "#,
            )
            .bind(format!("edge-{new_from}-{new_to}-{rel}"))
            .bind(&new_from)
            .bind(&new_to)
            .bind(&rel)
            .bind(&srcs)
            .bind(now_rfc3339())
            .execute(&mut *tx)
            .await?;
        }
    }

    sqlx::query("DELETE FROM kg_concepts WHERE id = ?1")
        .bind(merge_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn run_dreaming(pool: &SqlitePool) -> Result<Vec<DreamSuggestion>> {
    let snapshot = get_knowledge_graph(pool).await?;
    let provider = LocalDeterministicProvider;
    let proposed = provider
        .dream_suggestions(&snapshot.concepts)
        .await
        .map_err(|e| anyhow!(e))?;

    let existing_edges: HashSet<(String, String)> = snapshot
        .edges
        .iter()
        .flat_map(|e| {
            [
                (e.from_concept_id.clone(), e.to_concept_id.clone()),
                (e.to_concept_id.clone(), e.from_concept_id.clone()),
            ]
        })
        .collect();

    for sug in &proposed {
        if let (Some(a), Some(b)) = (&sug.from_concept_id, &sug.to_concept_id) {
            if existing_edges.contains(&(a.clone(), b.clone())) {
                continue;
            }
        }
        sqlx::query(
            r#"
            INSERT INTO kg_dream_suggestions
                (id, kind, from_concept_id, to_concept_id, title, rationale, supporting_sources_json, status, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8)
            ON CONFLICT(id) DO NOTHING
            "#,
        )
        .bind(&sug.id)
        .bind(&sug.kind)
        .bind(sug.from_concept_id.as_deref())
        .bind(sug.to_concept_id.as_deref())
        .bind(&sug.title)
        .bind(&sug.rationale)
        .bind(serde_json::to_string(&sug.supporting_sources)?)
        .bind(now_rfc3339())
        .execute(pool)
        .await?;
    }

    Ok(get_knowledge_graph(pool).await?.dream_suggestions)
}

pub async fn review_dream_suggestion(
    pool: &SqlitePool,
    suggestion_id: &str,
    accept: bool,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    let row = sqlx::query(
        "SELECT kind, from_concept_id, to_concept_id, title, rationale, supporting_sources_json FROM kg_dream_suggestions WHERE id = ?1",
    )
    .bind(suggestion_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| anyhow!("Dream suggestion '{suggestion_id}' not found"))?;

    let new_status = if accept { "accepted" } else { "dismissed" };
    sqlx::query("UPDATE kg_dream_suggestions SET status = ?2 WHERE id = ?1")
        .bind(suggestion_id)
        .bind(new_status)
        .execute(&mut *tx)
        .await?;

    if accept {
        let kind: String = row.get("kind");
        let from_id: Option<String> = row.get("from_concept_id");
        let to_id: Option<String> = row.get("to_concept_id");
        let title: String = row.get("title");
        let rationale: String = row.get("rationale");
        let srcs: String = row.get("supporting_sources_json");

        if kind == "candidate_connection" {
            if let (Some(a), Some(b)) = (from_id, to_id) {
                sqlx::query(
                    r#"
                    INSERT INTO kg_edges (id, from_concept_id, to_concept_id, relation, supporting_sources_json, created_at)
                    VALUES (?1, ?2, ?3, 'related_mechanism', ?4, ?5)
                    ON CONFLICT(from_concept_id, to_concept_id, relation) DO NOTHING
                    "#,
                )
                .bind(format!("edge-dream-{a}-{b}"))
                .bind(a)
                .bind(b)
                .bind(&srcs)
                .bind(now_rfc3339())
                .execute(&mut *tx)
                .await?;
            }
        } else if kind == "knowledge_gap" {
            let new_concept_id = format!("concept-gap-{}", suggestion_id);
            sqlx::query(
                r#"
                INSERT INTO kg_concepts (id, label, summary, aliases_json, created_at)
                VALUES (?1, ?2, ?3, '[]', ?4)
                ON CONFLICT(id) DO NOTHING
                "#,
            )
            .bind(&new_concept_id)
            .bind(&title)
            .bind(&rationale)
            .bind(now_rfc3339())
            .execute(&mut *tx)
            .await?;
            if let Some(a) = from_id {
                sqlx::query(
                    r#"
                    INSERT INTO kg_edges (id, from_concept_id, to_concept_id, relation, supporting_sources_json, created_at)
                    VALUES (?1, ?2, ?3, 'expands_on', ?4, ?5)
                    ON CONFLICT(from_concept_id, to_concept_id, relation) DO NOTHING
                    "#,
                )
                .bind(format!("edge-gap-{a}-{new_concept_id}"))
                .bind(a)
                .bind(&new_concept_id)
                .bind(&srcs)
                .bind(now_rfc3339())
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    tx.commit().await?;
    Ok(())
}
