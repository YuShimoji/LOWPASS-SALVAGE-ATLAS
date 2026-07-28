import { describe, expect, it } from "vitest";
import { GUIDED_QA_ACTIONS } from "./GuidedQaPanel";

describe("Guided QA definitions", () => {
  it("uses readable categories, ordered contact steps, and explicit withdrawal semantics", () => {
    expect(new Set(GUIDED_QA_ACTIONS.map((entry) => entry.category))).toEqual(
      new Set(["Setup", "Contact sequence", "Relay", "Flare", "Audit"]),
    );
    expect(GUIDED_QA_ACTIONS.some((entry) => entry.label.includes("QA WITHDRAW"))).toBe(false);
    const isolation = GUIDED_QA_ACTIONS.find((entry) => entry.action === "isolate-player");
    expect(isolation?.description).toContain("援軍を離脱させ");
    expect(isolation?.expectedChange).toContain("predatory");
    expect(GUIDED_QA_ACTIONS.filter((entry) => entry.category === "Contact sequence").map((entry) => entry.label))
      .toEqual([
        "1. Isolate player",
        "2. Watcher detects",
        "3. Contact is shared",
        "4. Needle re-acquires and locks",
        "5. Reinforcement arrives",
        "6. Porter joins",
        "7. Cell disengages",
      ]);
  });

  it("keeps raw actions outside the primary Guided QA definition list", () => {
    expect(GUIDED_QA_ACTIONS.every((entry) => !entry.action.startsWith("raw-"))).toBe(true);
    expect(GUIDED_QA_ACTIONS.every((entry) => entry.description.length > 0 && entry.expectedChange.length > 0)).toBe(true);
  });
});
