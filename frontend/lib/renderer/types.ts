export type SceneTemplate = "concept_reveal" | "process_diagram" | "timeline";

export interface SentenceCue {
  sentence_index: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface SceneItem {
  id: string;
  label: string;
  detail: string;
  badge?: string | null;
  cue_index?: number | null;
}

export interface SceneSpec {
  scene_id: string;
  base_scene_id: string;
  part_index: number;
  part_total: number;
  title: string;
  subtitle?: string | null;
  template: SceneTemplate;
  note_point_ids: string[];
  source_refs: string[];
  narration_sentences: string[];
  items: SceneItem[];
  footer_note?: string | null;
}

export interface BoundingBox {
  id: string;
  kind: "card" | "text" | "header" | "footer" | "caption";
  x: number;
  y: number;
  width: number;
  height: number;
  font_size?: number;
}

export interface LayoutMetrics {
  min_font_size: number;
  max_overlap_count: number;
  out_of_bounds_count: number;
  bounding_boxes: BoundingBox[];
}

export interface PositionedItem {
  item: SceneItem;
  x: number;
  y: number;
  width: number;
  height: number;
  badgeLines: string[];
  labelLines: string[];
  detailLines: string[];
  labelFontSize: number;
  detailFontSize: number;
  badgeFontSize: number;
}

export interface ComputedSceneLayout {
  width: number;
  height: number;
  contentTop: number;
  contentBottom: number;
  titleLines: string[];
  subtitleLines: string[];
  headerBottom: number;
  positionedItems: PositionedItem[];
  boundingBoxes: BoundingBox[];
  minFontSize: number;
}
