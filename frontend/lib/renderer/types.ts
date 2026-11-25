export type SceneTemplate =
  | "concept_reveal"
  | "process_diagram"
  | "timeline"
  | "comparison_grid"
  | "recap_ladder";

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
  icon?: string | null;
  stat?: string | null;
  cue_index?: number | null;
}

export interface DiagramNode {
  id: string;
  label: string;
  sublabel?: string | null;
  icon?: string | null;
  accent?: string | null;
  cue_index?: number | null;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string | null;
  packet?: boolean;
  dashed?: boolean;
  cue_index?: number | null;
}

export interface ChartDatum {
  label: string;
  value: number;
  suffix?: string | null;
  accent?: string | null;
}

export type SceneVisual =
  | {
      kind: "kinetic_title";
      eyebrow?: string | null;
      headline: string;
      accent_word?: string | null;
      icon?: string | null;
      chips?: string[];
    }
  | {
      kind: "diagram";
      nodes?: DiagramNode[];
      edges?: DiagramEdge[];
      callout?: string | null;
    }
  | {
      kind: "chart";
      chart_type?: "bar" | "donut" | "metric" | string;
      title?: string | null;
      bars?: ChartDatum[];
      percent?: number | null;
      metric_value?: number | null;
      metric_prefix?: string | null;
      metric_suffix?: string | null;
      metric_label?: string | null;
      callout?: string | null;
    }
  | {
      kind: "metaphor";
      left_label: string;
      left_icon?: string | null;
      right_label: string;
      right_icon?: string | null;
      connector_label?: string | null;
      character_pose?: "idle" | "walk" | "point" | "cheer" | "sad" | string | null;
      caption?: string | null;
    }
  | {
      kind: "svg_sketch";
      svg: string;
      caption?: string | null;
    };

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
  visual?: SceneVisual | null;
  visual_layout?: "split" | "hero" | "cards" | string | null;
  footer_note?: string | null;
}

export interface BoundingBox {
  id: string;
  kind: "card" | "text" | "header" | "footer" | "caption" | "visual";
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

export interface VisualStageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComputedSceneLayout {
  width: number;
  height: number;
  contentTop: number;
  contentBottom: number;
  titleLines: string[];
  subtitleLines: string[];
  headerBottom: number;
  effectiveLayout: "cards" | "split" | "hero";
  visualBox?: VisualStageBox | null;
  positionedItems: PositionedItem[];
  boundingBoxes: BoundingBox[];
  minFontSize: number;
}
