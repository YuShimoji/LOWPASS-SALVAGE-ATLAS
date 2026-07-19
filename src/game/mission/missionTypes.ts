import type { ItemDefinitionId } from "../items/itemDefinitions";
import type { CrewId, CrewLoadout } from "../squad/squadTypes";

export const GATE_CAPACITY_UNITS = 28;
export const CREW_CAPACITY_UNITS = 5;

export type MissionPhase =
  | "aboard"
  | "loadout"
  | "gate-transfer"
  | "deployed"
  | "extraction"
  | "returning"
  | "results";

export interface DeploymentPlan {
  selectedCrewIds: readonly CrewId[];
  loadouts: readonly CrewLoadout[];
  capacityLimit: typeof GATE_CAPACITY_UNITS;
}

export interface ResourceObjective {
  resourceId: string;
  label: string;
  requiredQuantity: number;
  unitMass: number;
  recoveredQuantity: number;
}

export interface MissionDefinition {
  id: string;
  label: string;
  destinationId: string;
  spawnMode: "distributed-three-person";
  objectives: readonly ResourceObjective[];
  availableEquipment: readonly ItemDefinitionId[];
}

export interface MissionResult {
  missionId: string;
  outcome: "success" | "partial" | "failed" | "aborted";
  recoveredResourceIds: readonly string[];
  returnedCrewIds: readonly CrewId[];
  elapsedSeconds: number;
}

export interface ExtractionRequest {
  missionId: string;
  crewPresent: readonly CrewId[];
  resourceEntityIds: readonly string[];
  destination: "habitat-ship";
}
