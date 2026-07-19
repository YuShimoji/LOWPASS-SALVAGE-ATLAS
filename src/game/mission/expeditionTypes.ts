import type { ItemDefinitionId, ItemInstanceId } from "../items/itemDefinitions";
import type { CrewId } from "../squad/squadTypes";

export interface DraftItemAssignment {
  itemInstanceId: ItemInstanceId;
  agentId: string;
}

export interface ExpeditionDraft {
  revision: number;
  selectedAgentIds: string[];
  fieldLeadIds: string[];
  itemInstanceIds: ItemInstanceId[];
  assignments: DraftItemAssignment[];
}

export interface ManifestLoadout {
  readonly agentId: CrewId;
  readonly itemInstanceIds: readonly ItemInstanceId[];
}

export interface ManifestItemSnapshot {
  readonly instanceId: ItemInstanceId;
  readonly definitionId: ItemDefinitionId;
  readonly assignedAgentId: CrewId;
}

export interface ExpeditionManifest {
  readonly schemaVersion: 1;
  readonly manifestId: string;
  readonly createdAtIso: string;
  readonly sourceDraftRevision: number;
  readonly fieldLeadId: CrewId;
  readonly selectedAgentIds: readonly CrewId[];
  readonly loadouts: readonly ManifestLoadout[];
  readonly items: readonly ManifestItemSnapshot[];
  readonly totalCapacityUnits: number;
  readonly capacityLimitUnits: 28;
}

export function createInitialExpeditionDraft(): ExpeditionDraft {
  return {
    revision: 0,
    selectedAgentIds: ["player", "mara", "ito"],
    fieldLeadIds: ["player"],
    itemInstanceIds: ["radio-01", "flare-01"],
    assignments: [
      { itemInstanceId: "radio-01", agentId: "player" },
      { itemInstanceId: "flare-01", agentId: "mara" },
    ],
  };
}
