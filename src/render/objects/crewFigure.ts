import { BoxGeometry, CylinderGeometry, Group, MathUtils, Mesh, type Material } from "three";
import type { Ps1MaterialFactory } from "../materials/Ps1MaterialFactory";

/**
 * Salvage-crew figure following concept 03 (visual-overhaul-v1): dark under-suit, role-colored
 * armor plates, cyan glow points on helmet/chest/knees, heavy shoulders and knees, and a backpack
 * whose attachment tells the role. Origin is the character capsule center (feet at y = -0.81).
 * Animation is purely presentational: it reads speed and yaw, it never feeds back into rules.
 */
export type CrewRole = "lead" | "breacher" | "signal";

export interface CrewFigure {
  readonly root: Group;
  /** Advance the walk cycle and the smoothed facing. Call once per rendered frame. */
  animate(frameSeconds: number, planarSpeed: number, targetYaw: number): void;
  /** Jump the smoothed facing to the target (spawn, teleport, control switch). */
  snapYaw(yaw: number): void;
}

const ROLE_ARMOR: Record<CrewRole, string> = {
  lead: "#b08a3e",
  breacher: "#7b5636",
  signal: "#3d5270",
};

const WALK_REFERENCE_SPEED = 3.2;
const TURN_RATE = 13;

export function createCrewFigure(materials: Ps1MaterialFactory, role: CrewRole): CrewFigure {
  const suit = materials.create({ color: "#22272a", roughness: 0.9 });
  const armor = materials.create({ color: ROLE_ARMOR[role], roughness: 0.72, metalness: 0.18 });
  const strap = materials.create({ color: "#14181a", roughness: 0.92 });
  const metal = materials.create({ color: "#5b5a52", roughness: 0.58, metalness: 0.55 });
  const glow = materials.createEmissive("#6ff0e0", 1.05);

  const root = new Group();
  root.name = `crew-figure-${role}`;
  const yawPivot = new Group();
  root.add(yawPivot);
  const body = new Group();
  yawPivot.add(body);

  const box = (w: number, h: number, d: number, material: Material, x: number, y: number, z: number): Mesh => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    return mesh;
  };

  // Pelvis and torso.
  body.add(box(0.5, 0.2, 0.34, strap, 0, -0.18, 0));
  const torso = new Group();
  torso.position.y = 0.14;
  torso.add(
    box(0.56, 0.56, 0.36, suit, 0, 0, 0),
    box(0.46, 0.34, 0.1, armor, 0, 0.06, -0.21),
    box(0.1, 0.06, 0.03, glow, 0.12, 0.12, -0.27),
    box(0.6, 0.08, 0.4, strap, 0, -0.24, 0),
  );
  // Backpack and role attachment (03: tools and antennas read the role from behind).
  torso.add(box(0.48, 0.56, 0.26, strap, 0, 0.02, 0.3), box(0.38, 0.14, 0.08, armor, 0, 0.24, 0.45));
  torso.add(box(0.14, 0.08, 0.03, glow, 0, -0.06, 0.445));
  if (role === "lead") {
    const antenna = new Mesh(new CylinderGeometry(0.012, 0.02, 0.62, 4), metal);
    antenna.position.set(0.18, 0.55, 0.36);
    torso.add(antenna, box(0.05, 0.05, 0.05, glow, 0.18, 0.87, 0.36));
  } else if (role === "breacher") {
    const bar = box(0.06, 0.78, 0.06, metal, -0.27, 0.06, 0.36);
    bar.rotation.z = 0.32;
    torso.add(bar);
  } else {
    const canister = new Mesh(new CylinderGeometry(0.09, 0.09, 0.42, 6), metal);
    canister.position.set(0.3, 0, 0.32);
    torso.add(canister, box(0.03, 0.12, 0.03, glow, 0.3, 0.22, 0.32));
  }
  body.add(torso);

  // Helmet with visor slit and side lamps.
  const head = new Group();
  head.position.y = 0.66;
  const helmet = new Mesh(new CylinderGeometry(0.22, 0.25, 0.32, 6), suit);
  head.add(
    helmet,
    box(0.46, 0.1, 0.42, armor, 0, 0.13, 0.01),
    box(0.3, 0.07, 0.04, glow, 0, -0.01, -0.24),
    box(0.05, 0.08, 0.05, glow, 0.24, 0.02, -0.08),
  );
  body.add(head);

  // Arms hang from shoulder pivots; heavy pads on top.
  const arms: Group[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new Group();
    shoulder.position.set(side * 0.36, 0.34, 0);
    shoulder.add(
      box(0.26, 0.2, 0.42, armor, side * 0.05, 0.03, 0),
      box(0.15, 0.3, 0.18, suit, side * 0.04, -0.2, 0),
      box(0.17, 0.24, 0.2, armor, side * 0.04, -0.45, -0.01),
      box(0.14, 0.1, 0.16, strap, side * 0.04, -0.62, -0.02),
    );
    body.add(shoulder);
    arms.push(shoulder);
  }

  // Legs swing from hip pivots; knee pads carry a glow point.
  const legs: Group[] = [];
  for (const side of [-1, 1]) {
    const hip = new Group();
    hip.position.set(side * 0.14, -0.26, 0);
    hip.add(
      box(0.2, 0.3, 0.24, suit, 0, -0.14, 0),
      box(0.22, 0.16, 0.12, armor, 0, -0.3, -0.12),
      box(0.05, 0.05, 0.03, glow, 0, -0.3, -0.19),
      box(0.18, 0.2, 0.22, suit, 0, -0.42, 0),
      box(0.24, 0.13, 0.34, strap, 0, -0.485, -0.05),
    );
    yawPivot.add(hip);
    legs.push(hip);
  }

  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  let phase = 0;
  let stride = 0;
  let smoothedSpeed = 0;
  let yaw = 0;
  let previousYaw = 0;
  let breath = 0;

  return {
    root,
    snapYaw(nextYaw: number): void {
      yaw = nextYaw;
      previousYaw = nextYaw;
      yawPivot.rotation.y = nextYaw;
    },
    animate(frameSeconds: number, planarSpeed: number, targetYaw: number): void {
      const dt = Math.min(Math.max(frameSeconds, 0), 0.1);
      smoothedSpeed = MathUtils.damp(smoothedSpeed, planarSpeed, 14, dt);
      const moving = MathUtils.clamp(smoothedSpeed / WALK_REFERENCE_SPEED, 0, 1.6);
      stride = MathUtils.damp(stride, moving, 10, dt);
      phase += dt * (4.2 + smoothedSpeed * 1.55);
      breath += dt * 2.1;

      // Shortest-arc turn with a capped angular speed instead of a one-frame snap.
      const delta = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
      const maxStep = TURN_RATE * dt;
      yaw += MathUtils.clamp(delta, -maxStep, maxStep);
      const turnRate = dt > 0 ? Math.atan2(Math.sin(yaw - previousYaw), Math.cos(yaw - previousYaw)) / dt : 0;
      previousYaw = yaw;
      yawPivot.rotation.y = yaw;

      const swing = Math.sin(phase) * 0.62 * stride;
      legs[0]!.rotation.x = swing;
      legs[1]!.rotation.x = -swing;
      arms[0]!.rotation.x = -swing * 0.75;
      arms[1]!.rotation.x = swing * 0.75;
      arms[0]!.rotation.z = -0.06 - stride * 0.04;
      arms[1]!.rotation.z = 0.06 + stride * 0.04;

      const step = Math.abs(Math.sin(phase));
      body.position.y = step * 0.055 * stride - 0.02 * stride + Math.sin(breath) * 0.008 * (1 - Math.min(stride, 1));
      body.rotation.x = -0.13 * Math.min(moving, 1.4);
      body.rotation.z = MathUtils.clamp(-turnRate * 0.025, -0.14, 0.14) * Math.min(stride + 0.3, 1);
      torso.rotation.y = Math.sin(phase) * 0.07 * stride;
      head.rotation.x = 0.1 * Math.min(moving, 1.4);
    },
  };
}
