/**
 * Types and interfaces for the LearningEdge Intelligent Knowledge Graph.
 */

export type NodeCategory =
  | "central"       // Central Topic – The main learning subject (Gold/Electric amber)
  | "main"          // Main Concepts (Cyan)
  | "subtopic"      // Subtopics / Important topics (Purple)
  | "related"       // Related Concepts (Magenta)
  | "supporting"    // Supporting Knowledge (Blue)
  | "definition"    // Definitions & Core Theory (Teal)
  | "example"       // Practical Examples (Indigo)
  | "application";  // Real-world Applications (Orange)

export type EdgeRelation =
  | "contains"
  | "depends_on"
  | "related_to"
  | "example_of"
  | "part_of"
  | "leads_to"
  | "applied_in";

export type LayoutMode = "force" | "hierarchical" | "radial";

export interface GraphNode {
  id: string;
  label: string;
  category: NodeCategory;
  importance: 1 | 2 | 3 | 4 | 5; // 5 = central/critical, 1 = supporting detail
  summary: string;
  description: string;
  mastered: boolean;
  aliases?: string[];
  tags?: string[];
  lectureId?: string;
  notePointId?: string;
  sourceRefs?: string[];
  videoStartMs?: number;
  videoEndMs?: number;
  examples?: string[];
  applications?: string[];
  
  // Dynamic layout & physics properties
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  fixed?: boolean;
  level?: number; // Hierarchical level (0 = root, 1 = main, 2 = sub, etc.)
  hidden?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string; // Source node id
  target: string; // Target node id
  relation: EdgeRelation;
  label?: string;
  supportingSources?: string[];
  highlighted?: boolean;
  dimmed?: boolean;
  animated?: boolean;
}

export interface GraphDomain {
  id: string;
  name: string;
  description: string;
  icon: string;
  centralNodeId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphFilterState {
  searchQuery: string;
  selectedCategories: Set<NodeCategory>;
  masteryFilter: "all" | "mastered" | "learning";
  minImportance: number;
}

export interface CategoryVisual {
  name: string;
  color: string;        // Primary hex color
  glowColor: string;    // Glowing drop shadow / halo rgba
  borderColor: string;  // Border stroke hex
  bgGradient: [string, string]; // Radial gradient stops
  badgeBg: string;      // Pill badge background
  badgeText: string;    // Pill badge text color
  defaultRadius: number;// Base radius in pixels
}

/**
 * Category styling adhering to specifications:
 * - Cyan: Main concepts
 * - Purple: Important topics / subtopics
 * - Magenta: Related concepts
 * - Blue: Supporting information
 * - Green: Completed or mastered concepts (dynamic overlay when mastered=true)
 * - Gold/Amber: Central topic
 * - Teal: Definitions
 * - Orange: Applications
 */
export const CATEGORY_STYLES: Record<NodeCategory, CategoryVisual> = {
  central: {
    name: "Central Subject",
    color: "#f59e0b",
    glowColor: "rgba(245, 158, 11, 0.45)",
    borderColor: "#fbbf24",
    bgGradient: ["#2d1b02", "#130a00"],
    badgeBg: "rgba(245, 158, 11, 0.15)",
    badgeText: "#fcd34d",
    defaultRadius: 36,
  },
  main: {
    name: "Main Concept",
    color: "#00f0ff",
    glowColor: "rgba(0, 240, 255, 0.40)",
    borderColor: "#38bdf8",
    bgGradient: ["#032b3b", "#02131b"],
    badgeBg: "rgba(0, 240, 255, 0.15)",
    badgeText: "#38bdf8",
    defaultRadius: 28,
  },
  subtopic: {
    name: "Subtopic",
    color: "#a855f7",
    glowColor: "rgba(168, 85, 247, 0.40)",
    borderColor: "#c084fc",
    bgGradient: ["#260c3b", "#120320"],
    badgeBg: "rgba(168, 85, 247, 0.15)",
    badgeText: "#c084fc",
    defaultRadius: 22,
  },
  related: {
    name: "Related Concept",
    color: "#ec4899",
    glowColor: "rgba(236, 72, 153, 0.40)",
    borderColor: "#f472b6",
    bgGradient: ["#3b0922", "#1c030e"],
    badgeBg: "rgba(236, 72, 153, 0.15)",
    badgeText: "#f472b6",
    defaultRadius: 18,
  },
  supporting: {
    name: "Supporting Info",
    color: "#3b82f6",
    glowColor: "rgba(59, 130, 246, 0.35)",
    borderColor: "#60a5fa",
    bgGradient: ["#071e3d", "#030c1c"],
    badgeBg: "rgba(59, 130, 246, 0.15)",
    badgeText: "#93c5fd",
    defaultRadius: 16,
  },
  definition: {
    name: "Definition",
    color: "#14b8a6",
    glowColor: "rgba(20, 184, 166, 0.35)",
    borderColor: "#2dd4bf",
    bgGradient: ["#042924", "#011311"],
    badgeBg: "rgba(20, 184, 166, 0.15)",
    badgeText: "#5eead4",
    defaultRadius: 16,
  },
  example: {
    name: "Example",
    color: "#818cf8",
    glowColor: "rgba(129, 140, 248, 0.35)",
    borderColor: "#a5b4fc",
    bgGradient: ["#14173d", "#08091a"],
    badgeBg: "rgba(129, 140, 248, 0.15)",
    badgeText: "#c7d2fe",
    defaultRadius: 15,
  },
  application: {
    name: "Application",
    color: "#f97316",
    glowColor: "rgba(249, 115, 22, 0.40)",
    borderColor: "#fb923c",
    bgGradient: ["#361404", "#180701"],
    badgeBg: "rgba(249, 115, 22, 0.15)",
    badgeText: "#fdba74",
    defaultRadius: 16,
  },
};

/** Mastered concepts glow neon emerald green */
export const MASTERED_STYLE: CategoryVisual = {
  name: "Mastered",
  color: "#10b981",
  glowColor: "rgba(16, 185, 129, 0.50)",
  borderColor: "#34d399",
  bgGradient: ["#022c1b", "#01120a"],
  badgeBg: "rgba(16, 185, 129, 0.15)",
  badgeText: "#6ee7b7",
  defaultRadius: 20,
};

export const RELATION_LABELS: Record<EdgeRelation, string> = {
  contains: "contains",
  depends_on: "depends on",
  related_to: "related to",
  example_of: "example of",
  part_of: "part of",
  leads_to: "leads to",
  applied_in: "applied in",
};
