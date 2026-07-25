import { afterEach, describe, expect, it } from "vitest";
import type { MovementIntent } from "../game/input/InputActions";
import { PhysicsWorld } from "./PhysicsWorld";

const FORWARD: MovementIntent = {
  rawX: 0,
  rawY: 1,
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
    expect(physics.getDiagnostics().rigidBodyCount).toBe(1);
    expect(physics.getDiagnostics().colliderCount).toBe(12);
    expect(physics.getDiagnostics().collisionCount).toBeGreaterThan(0);
  });

  it("uses the Rapier world query for clear and occluded threat sight lines", async () => {
    physics = await PhysicsWorld.create({
      initialPlayerPosition: { x: -3, y: 0.93, z: 0 },
      colliders: [
        { id: "floor", center: { x: 0, y: -0.25, z: 0 }, halfExtents: { x: 5, y: 0.25, z: 5 }, surface: "floor", visible: true },
        { id: "wall", center: { x: 0, y: 1, z: 0 }, halfExtents: { x: 0.2, y: 1, z: 2 }, surface: "wall", visible: true },
      ],
    });
    expect(physics.hasLineOfSight({ x: -2, y: 1.2, z: 3 }, { x: 2, y: 1.2, z: 3 })).toBe(true);
    expect(physics.hasLineOfSight({ x: -2, y: 1.2, z: 0 }, { x: 2, y: 1.2, z: 0 })).toBe(false);
  });

  it("stops the deterministic cart/player pair at a blocking wall", async () => {
    physics = await PhysicsWorld.create({
      initialPlayerPosition: { x: 0, y: 0.93, z: 1.12 },
      colliders: [
        { id: "floor", center: { x: 0, y: -0.25, z: 0 }, halfExtents: { x: 5, y: 0.25, z: 5 }, surface: "floor", visible: true },
        { id: "wall", center: { x: 0, y: 0.8, z: -2 }, halfExtents: { x: 2, y: 0.8, z: 0.2 }, surface: "wall", visible: true },
      ],
      kinematicObjects: [{
        id: "cart",
        position: { x: 0, y: 0.48, z: 0 },
        halfExtents: { x: 0.58, y: 0.45, z: 0.42 },
      }],
    });
    let position = { x: 0, y: 0.48, z: 0 };
    let blocked = false;
    for (let step = 0; step < 40; step += 1) {
      const result = physics.stepKinematicCartPair(
        "cart",
        position,
        0,
        { ...position, z: position.z - 0.1 },
        0,
        1.12,
        1 / 60,
      );
      if (step === 0) expect(result.collisionBlocked).toBe(false);
      position = result.cartPosition;
      blocked ||= result.collisionBlocked;
    }
    expect(blocked).toBe(true);
    expect(position.z).toBeGreaterThan(-1.4);
    expect(Number.isFinite(position.z)).toBe(true);
  });

  it("does not overlap the flooded-market loading gate at the initial cart pose", async () => {
    physics = await PhysicsWorld.create({
      initialPlayerPosition: { x: 2.2, y: 0.93, z: -0.28 },
      colliders: [
        { id: "floor", center: { x: 0, y: -0.25, z: 0 }, halfExtents: { x: 7, y: 0.25, z: 7 }, surface: "floor", visible: true },
        { id: "loading-chain-gate", center: { x: 2.2, y: 1, z: -3.05 }, halfExtents: { x: 0.12, y: 1, z: 1.05 }, surface: "fixture", visible: true },
      ],
      kinematicObjects: [{
        id: "cart",
        position: { x: 2.2, y: 0.48, z: -1.4 },
        halfExtents: { x: 0.58, y: 0.45, z: 0.42 },
      }],
    });
    const result = physics.stepKinematicCartPair(
      "cart",
      { x: 2.2, y: 0.48, z: -1.4 },
      0,
      { x: 2.2, y: 0.48, z: -1.4 },
      0,
      1.12,
      1 / 60,
    );
    expect(result.collisionBlocked).toBe(false);
  });
});
