import { describe, expect, it, vi } from "vitest";
import { FixedStepRunner } from "./FixedStepRunner";

describe("FixedStepRunner", () => {
  it("advances deterministic 60 Hz steps independent of render chunks", () => {
    const runner = new FixedStepRunner(0.1);
    const step = vi.fn();

    runner.advance(0.06, step);
    const result = runner.advance(0.16, step);

    expect(step).toHaveBeenCalledTimes(2);
    expect(result.steps).toBe(2);
    expect(result.alpha).toBeCloseTo(0.2);
  });

  it("caps catch-up work after a suspended frame", () => {
    const runner = new FixedStepRunner(1 / 60);
    const step = vi.fn();
    const result = runner.advance(10, step);

    expect(step).toHaveBeenCalledTimes(8);
    expect(result.droppedTime).toBe(true);
  });
});
