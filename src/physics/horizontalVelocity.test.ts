import { describe, expect, it } from "vitest";
import { approachPlanarVelocity, type PlanarVelocity } from "./horizontalVelocity";

const DT = 1 / 60;

function run(start: PlanarVelocity, target: PlanarVelocity, ticks: number): PlanarVelocity {
  let velocity = start;
  for (let tick = 0; tick < ticks; tick += 1) velocity = approachPlanarVelocity(velocity, target, DT);
  return velocity;
}

describe("character acceleration ramps", () => {
  it("does not reach walk speed on the first tick but reaches it within 0.2 s", () => {
    const first = approachPlanarVelocity({ x: 0, z: 0 }, { x: 0, z: -3.2 }, DT);
    expect(Math.hypot(first.x, first.z)).toBeLessThan(1);
    const later = run({ x: 0, z: 0 }, { x: 0, z: -3.2 }, 12);
    expect(later.z).toBeCloseTo(-3.2, 5);
  });

  it("never exceeds the requested top speed", () => {
    let velocity: PlanarVelocity = { x: 0, z: 0 };
    for (let tick = 0; tick < 120; tick += 1) {
      velocity = approachPlanarVelocity(velocity, { x: 3.6062, z: -3.6062 }, DT);
      expect(Math.hypot(velocity.x, velocity.z)).toBeLessThanOrEqual(5.1 + 1e-6);
    }
  });

  it("stops within 0.15 s after release", () => {
    const stopped = run({ x: 0, z: -3.2 }, { x: 0, z: 0 }, 9);
    expect(Math.hypot(stopped.x, stopped.z)).toBe(0);
  });

  it("reverses faster than a plain stop-and-start", () => {
    const reversed = run({ x: 0, z: -3.2 }, { x: 0, z: 3.2 }, 9);
    expect(reversed.z).toBeGreaterThan(0);
  });
});
