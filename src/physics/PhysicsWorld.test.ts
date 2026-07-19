import { afterEach, describe, expect, it } from "vitest";
import type { MovementIntent } from "../game/input/InputActions";
import { PhysicsWorld } from "./PhysicsWorld";

const FORWARD: MovementIntent = {
  worldX: 0,
  worldZ: -1,
  sprint: false,
  interactPressed: false,
};

describe("PhysicsWorld", () => {
  let physics: PhysicsWorld | null = null;

  afterEach(() => {
    physics?.dispose();
    physics = null;
  });

  it("moves the kinematic character at fixed steps and stops at the forward bulkhead", async () => {
    physics = await PhysicsWorld.create();
    let snapshot = physics.stepCharacter(FORWARD, 1 / 60);

    for (let step = 0; step < 360; step += 1) {
      snapshot = physics.stepCharacter(FORWARD, 1 / 60);
    }

    expect(snapshot.position.z).toBeLessThan(-8);
    expect(snapshot.position.z).toBeGreaterThan(-9.9);
    expect(snapshot.grounded).toBe(true);
    expect(physics.getDiagnostics().collisionCount).toBeGreaterThan(0);
  });
});
