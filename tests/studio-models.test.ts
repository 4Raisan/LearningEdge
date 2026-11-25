import { describe, expect, it } from "vitest";
import { groupAntigravityModels, normalizeChoice } from "../frontend/lib/studio";

const AGY_27_MODELS = [
  "gemini-4-neon-high",
  "gemini-4-neon-xhigh",
  "gemini-4-neon-medium",
  "gemini-4-neon-low",
  "gemini-4-carbon-medium",
  "gemini-4-carbon-high",
  "gemini-4-carbon-low",
  "gemini-4-argon-medium",
  "gemini-4-argon-high",
  "gemini-4-argon-low",
  "gemini-4-hydrogen-high",
  "gemini-4-hydrogen-xhigh",
  "gemini-4-hydrogen-medium",
  "gemini-4-hydrogen-low",
  "gemini-pro-orchestrator-neon",
  "gemini-pro-orchestrator",
  "gemini-pro-orchestrator-argon",
  "gemini-3.8-flash-high",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-low",
  "claude-opus-5-5-low",
  "claude-opus-5-5-medium",
  "claude-opus-5-5-high",
  "claude-sonnet-5-5-low",
  "claude-sonnet-5-5-medium",
  "claude-sonnet-5-5-high",
  "gpt-oss-120b-medium",
];

describe("Antigravity base model grouping & choice normalization", () => {
  it("groups 27 raw agy models into 11 base models with ordered thinking levels", () => {
    const grouped = groupAntigravityModels(AGY_27_MODELS);
    expect(grouped).toHaveLength(11);

    const hydrogen = grouped.find((m) => m.model === "gemini-4-hydrogen");
    expect(hydrogen?.levels).toEqual(["low", "medium", "high", "xhigh"]);

    const orchestrator = grouped.find((m) => m.model === "gemini-pro-orchestrator");
    expect(orchestrator?.levels).toEqual(["low", "medium", "high"]);

    const gptOss = grouped.find((m) => m.model === "gpt-oss-120b");
    expect(gptOss?.levels).toEqual(["medium"]);
  });

  it("strips legacy suffixed Antigravity IDs while preserving or inferring effort", () => {
    expect(
      normalizeChoice({
        provider: "antigravity",
        model: "gemini-4-neon-medium",
        thinking: "high",
      })
    ).toEqual({
      provider: "antigravity",
      model: "gemini-4-neon",
      thinking: "high",
    });

    expect(
      normalizeChoice({
        provider: "antigravity",
        model: "gemini-4-hydrogen-low",
        thinking: "off",
      })
    ).toEqual({
      provider: "antigravity",
      model: "gemini-4-hydrogen",
      thinking: "low",
    });
  });
});
