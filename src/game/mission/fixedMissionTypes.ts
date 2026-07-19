import type { Vec3 } from "../core/types";
import type { WorldColliderSpec } from "../../physics/physicsTypes";

export interface FixedSalvageSpawn {
  readonly sourceId: string;
  readonly label: string;
  readonly resourceType: "water-filter" | "cooling-coil";
  readonly carryMode: "hand" | "cart-only";
  readonly required: boolean;
  readonly position: Vec3;
}

export interface FixedMissionDefinition {
  readonly id: string;
  readonly label: string;
  readonly destinationLabel: string;
  readonly playerSpawn: Vec3;
  readonly extractionPoint: Vec3;
  readonly extractionRadius: number;
  readonly cart: {
    readonly sourceId: "shopping-cart";
    readonly label: string;
    readonly initialPosition: Vec3;
  };
  readonly salvage: readonly FixedSalvageSpawn[];
  readonly colliders: readonly WorldColliderSpec[];
}
