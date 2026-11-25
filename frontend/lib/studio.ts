export type Choice = {
  provider: "ollama" | "codex_cli" | "antigravity" | "open_ai" | "gemini";
  endpoint?: string;
  model: string;
  thinking: string;
};
export type Preferences = Record<"notes" | "video" | "knowledge", Choice>;
export type Available = Omit<Choice, "thinking"> & { levels: string[] };
export type Depth = "brief" | "standard" | "deep";
export const THINKING_ORDER = ["off", "low", "medium", "high", "xhigh"] as const;
const local: Choice = { provider: "ollama", model: "qwen3:4b", thinking: "off" };
const ALLOWED_PROVIDERS = ["ollama", "codex_cli", "antigravity", "open_ai", "gemini"];

export function groupAntigravityModels(rawIds: string[]): Available[] {
  const grouped = new Map<string, Set<string>>();
  for (const raw of rawIds) {
    const id = raw.trim();
    if (!id) continue;
    const match = id.match(/^(.+)-(low|medium|high|xhigh)$/);
    const base = match ? match[1] : id;
    let set = grouped.get(base);
    if (!set) {
      set = new Set<string>();
      grouped.set(base, set);
    }
    if (match) {
      set.add(match[2]);
    } else {
      set.add("low");
      set.add("medium");
      set.add("high");
    }
  }
  return Array.from(grouped.entries()).map(([model, set]) => ({
    provider: "antigravity" as const,
    model,
    levels: Array.from(set).sort(
      (a, b) =>
        THINKING_ORDER.indexOf(a as (typeof THINKING_ORDER)[number]) -
        THINKING_ORDER.indexOf(b as (typeof THINKING_ORDER)[number])
    ),
  }));
}

export function normalizeChoice(c: Choice): Choice {
  if (c.provider !== "antigravity") return c;
  const match = c.model.trim().match(/^(.+)-(low|medium|high|xhigh)$/);
  const model = match ? match[1] : c.model.trim();
  const suffix = match ? match[2] : undefined;
  const thinking =
    c.thinking && c.thinking !== "off" && THINKING_ORDER.includes(c.thinking as (typeof THINKING_ORDER)[number])
      ? c.thinking
      : suffix ?? "low";
  return { ...c, model, thinking };
}

export function preferences(): Preferences {
  const defaults = { notes: { ...local }, video: { ...local }, knowledge: { ...local } };
  try {
    const saved = JSON.parse(localStorage.getItem("studio-models") ?? "{}");
    for (const role of ["notes", "video", "knowledge"] as const) {
      if (
        ALLOWED_PROVIDERS.includes(saved[role]?.provider) &&
        typeof saved[role]?.model === "string" &&
        typeof saved[role]?.thinking === "string"
      ) {
        defaults[role] = normalizeChoice(saved[role]);
      }
    }
  } catch {
    /* Use the offline defaults when storage is unavailable. */
  }
  return defaults;
}
