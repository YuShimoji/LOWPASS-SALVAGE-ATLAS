import { describe, expect, it } from "vitest";
import { KEYBOARD_TURN_RATE, steerInputDirection } from "./movementDirection";

const FORWARD = { x: 0, y: 1 };
const RIGHT = { x: 1, y: 0 };
const BACK = { x: 0, y: -1 };

function angleOf(input: { x: number; y: number }): number {
  return Math.atan2(input.y, input.x);
}

describe("steerInputDirection", () => {
  it("starts moving in the pressed direction at once", () => {
    expect(steerInputDirection(null, RIGHT, 1 / 60)).toEqual(RIGHT);
    expect(steerInputDirection({ x: 0, y: 0 }, RIGHT, 1 / 60)).toEqual(RIGHT);
  });

  it("swings toward a sideways key at the limited rate and keeps full speed", () => {
    const step = steerInputDirection(FORWARD, RIGHT, 1 / 60);
    expect(angleOf(FORWARD) - angleOf(step)).toBeCloseTo(KEYBOARD_TURN_RATE / 60, 5);
    expect(Math.hypot(step.x, step.y)).toBeCloseTo(1, 5);
  });

  it("reaches the new direction in about a fifth of a second for a 90 degree change", () => {
    let current = FORWARD;
    let frames = 0;
    while (Math.abs(angleOf(current) - angleOf(RIGHT)) > 1e-6 && frames < 120) {
      current = steerInputDirection(current, RIGHT, 1 / 60);
      frames += 1;
    }
    expect(frames).toBeGreaterThanOrEqual(12);
    expect(frames).toBeLessThanOrEqual(15);
  });

  it("reverses on the spot instead of arcing", () => {
    expect(steerInputDirection(FORWARD, BACK, 1 / 60)).toEqual(BACK);
  });

  it("stops at once when the keys are released", () => {
    expect(steerInputDirection(FORWARD, { x: 0, y: 0 }, 1 / 60)).toEqual({ x: 0, y: 0 });
  });
});
