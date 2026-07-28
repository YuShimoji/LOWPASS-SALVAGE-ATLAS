import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA_DISTANCE,
  MAX_CAMERA_PITCH,
  MAX_CAMERA_DISTANCE,
  MIN_CAMERA_PITCH,
  MIN_CAMERA_DISTANCE,
  ThirdPersonCamera,
} from "./ThirdPersonCamera";

describe("ThirdPersonCamera zoom", () => {
  it("zooms with wheel input and clamps to the supported range", () => {
    const rig = new ThirdPersonCamera();
    rig.applyWheelZoom(-10_000);
    expect(rig.getDiagnostics().desiredDistance).toBe(MIN_CAMERA_DISTANCE);
    rig.applyWheelZoom(10_000);
    expect(rig.getDiagnostics().desiredDistance).toBe(MAX_CAMERA_DISTANCE);
  });

  it("shares the same desired distance with gamepad zoom input", () => {
    const rig = new ThirdPersonCamera();
    rig.applyZoomInput(-1, 0.5);
    expect(rig.getDiagnostics().desiredDistance).toBeLessThan(DEFAULT_CAMERA_DISTANCE);
    rig.applyZoomInput(1, 0.5);
    expect(rig.getDiagnostics().desiredDistance).toBeCloseTo(DEFAULT_CAMERA_DISTANCE);
  });

  it("preserves user distance across camera resets", () => {
    const rig = new ThirdPersonCamera();
    rig.applyWheelZoom(300);
    const desired = rig.getDiagnostics().desiredDistance;
    rig.reset();
    rig.resetFromStart({ x: 0, y: 0.93, z: 0 }, { x: 1, y: 3, z: 4 });
    expect(rig.getDiagnostics().desiredDistance).toBe(desired);
  });

  it("uses occlusion distance without overwriting desired distance", () => {
    const rig = new ThirdPersonCamera();
    const player = new Vector3(0, 0.93, 0);
    const wall = new Mesh(new BoxGeometry(4, 4, 0.2), new MeshBasicMaterial());
    wall.position.set(0, 1.4, 2);
    wall.updateMatrixWorld(true);
    const desired = rig.getDiagnostics().desiredDistance;
    rig.update(player, 1 / 60, [wall]);
    const obstructed = rig.getDiagnostics();
    expect(obstructed.occlusionActive).toBe(true);
    expect(obstructed.effectiveDistance).toBeLessThan(desired);
    expect(obstructed.desiredDistance).toBe(desired);
    wall.geometry.dispose();
    wall.material.dispose();
  });

  it("clamps right-drag and gamepad look deltas to the supported pitch", () => {
    const rig = new ThirdPersonCamera();
    rig.applyLookDelta(0, -10_000);
    expect(rig.getDiagnostics().pitch).toBe(MAX_CAMERA_PITCH);
    rig.applyLookDelta(0, 10_000);
    expect(rig.getDiagnostics().pitch).toBe(MIN_CAMERA_PITCH);
  });
});
