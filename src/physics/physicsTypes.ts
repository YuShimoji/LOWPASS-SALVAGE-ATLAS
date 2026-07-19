import type { Vec3 } from "../game/core/types";

export interface WorldColliderSpec {
  readonly id: string;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
  readonly surface: "floor" | "wall" | "fixture" | "water";
  readonly visible: boolean;
}

export interface KinematicObjectSpec {
  readonly id: string;
  readonly position: Vec3;
  readonly halfExtents: Vec3;
  readonly sensor?: boolean;
}
