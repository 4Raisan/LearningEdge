export type Choice = {provider: "ollama" | "codex_cli" | "open_ai"; endpoint?:string; model: string; thinking: string};
export type Preferences = Record<"notes" | "video" | "knowledge", Choice>;
export type Available = Omit<Choice, "thinking"> & {levels: string[]};
export type Depth = "brief" | "standard" | "deep";
const local: Choice = {provider: "ollama", model:"qwen3:4b", thinking:"off"};
export function preferences(): Preferences {
  const defaults = {notes:{...local}, video:{...local}, knowledge:{...local}};
  try {
    const saved = JSON.parse(localStorage.getItem("studio-models") ?? "{}");
    for (const role of ["notes","video","knowledge"] as const) {
      if (["ollama","codex_cli","open_ai"].includes(saved[role]?.provider) && typeof saved[role]?.model === "string" && typeof saved[role]?.thinking === "string") defaults[role] = saved[role];
    }
  } catch { /* Use the offline defaults when storage is unavailable. */ }
  return defaults;
}
