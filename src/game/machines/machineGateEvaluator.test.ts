import { describe, expect, it } from "vitest";
import { evaluateMachineForGate } from "./machineGateEvaluator";

describe("machine gate evaluator", () => {
  it("rejects the porter for both per-object limits", () => {
    const result = evaluateMachineForGate("porter-01", { transitCostU: 8, volumeIndex: 5, logicIndex: 5 });
    expect(result.accepted).toBe(false);
    expect(result.violations.map((violation) => violation.code)).toEqual([
      "OBJECT_VOLUME_LIMIT_EXCEEDED",
      "OBJECT_LOGIC_LIMIT_EXCEEDED",
    ]);
  });
});
