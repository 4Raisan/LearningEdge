CREATE TABLE IF NOT EXISTS lectures (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    course TEXT,
    source_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_segments (
    id TEXT PRIMARY KEY,
    lecture_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    start_ms INTEGER,
    end_ms INTEGER,
    page_or_slide INTEGER,
    section_ref TEXT,
    topic_id TEXT,
    text TEXT NOT NULL,
    FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_source_segments_lecture ON source_segments(lecture_id);

CREATE VIRTUAL TABLE IF NOT EXISTS source_segments_fts USING fts5(
    id,
    lecture_id,
    source_ref,
    text,
    content='source_segments',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS source_segments_ai AFTER INSERT ON source_segments BEGIN
    INSERT INTO source_segments_fts(rowid, id, lecture_id, source_ref, text)
    VALUES (new.rowid, new.id, new.lecture_id, new.source_ref, new.text);
END;

CREATE TRIGGER IF NOT EXISTS source_segments_ad AFTER DELETE ON source_segments BEGIN
    INSERT INTO source_segments_fts(source_segments_fts, rowid, id, lecture_id, source_ref, text)
    VALUES ('delete', old.rowid, old.id, old.lecture_id, old.source_ref, old.text);
END;

CREATE TRIGGER IF NOT EXISTS source_segments_au AFTER UPDATE ON source_segments BEGIN
    INSERT INTO source_segments_fts(source_segments_fts, rowid, id, lecture_id, source_ref, text)
    VALUES ('delete', old.rowid, old.id, old.lecture_id, old.source_ref, old.text);
    INSERT INTO source_segments_fts(rowid, id, lecture_id, source_ref, text)
    VALUES (new.rowid, new.id, new.lecture_id, new.source_ref, new.text);
END;

CREATE TABLE IF NOT EXISTS presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_connections (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    label TEXT NOT NULL,
    credential_ref TEXT NOT NULL,
    base_url TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    lecture_id TEXT NOT NULL,
    preset_id TEXT NOT NULL,
    preset_snapshot_json TEXT NOT NULL,
    status TEXT NOT NULL,
    current_stage TEXT,
    held_reason TEXT,
    error_message TEXT,
    output_dir TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    settings_hash TEXT NOT NULL,
    override_scene_plan_json TEXT,
    metrics_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    stage_name TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    artifact_path TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(run_id, stage_name),
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scene_artifacts (
    cache_key TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    artifact_path TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    frame_count INTEGER NOT NULL,
    cues_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kg_concepts (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    summary TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kg_concept_links (
    id TEXT PRIMARY KEY,
    concept_id TEXT NOT NULL,
    lecture_id TEXT NOT NULL,
    source_refs_json TEXT NOT NULL,
    note_point_id TEXT,
    scene_id TEXT,
    video_start_ms INTEGER,
    video_end_ms INTEGER,
    FOREIGN KEY (concept_id) REFERENCES kg_concepts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kg_edges (
    id TEXT PRIMARY KEY,
    from_concept_id TEXT NOT NULL,
    to_concept_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    supporting_sources_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(from_concept_id, to_concept_id, relation),
    FOREIGN KEY (from_concept_id) REFERENCES kg_concepts(id) ON DELETE CASCADE,
    FOREIGN KEY (to_concept_id) REFERENCES kg_concepts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kg_dream_suggestions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    from_concept_id TEXT,
    to_concept_id TEXT,
    title TEXT NOT NULL,
    rationale TEXT NOT NULL,
    supporting_sources_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);
