import type { Vec3 } from "../core/types";

export type DroneState = "patrol" | "stalk-isolated" | "attack" | "retreat";
export type AndroidState = "disabled" | "awaiting-parts" | "allied" | "hauling";

export interface IsolationHunterDrone {
  id: string;
  state: DroneState;
  position: Vec3;
  targetCrewId: string | null;
  retreatAtGatheredCrewCount: 3;
}

export interface HaulerAndroid {
  id: string;
  state: AndroidState;
  position: Vec3;
  requiredRepairItemIds: readonly string[];
  carryingEntityId: string | null;
}

export interface AiPerceptionSnapshot {
  visibleCrewIds: readonly string[];
  isolatedCrewIds: readonly string[];
  nearbyAlliedCrewCount: number;
  audibleEvents: readonly string[];
}
