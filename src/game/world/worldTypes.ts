import type { Vec3 } from "../core/types";
import type { ItemDefinitionId } from "../items/itemDefinitions";

export type WorldEntityId = string;
export type WorldInstanceId = string;
export type ContractState = "locked" | "available" | "active" | "complete";
export type TraversalState = "closed" | "opened";
export type MachineRelation = "unknown" | "friendly";
export type EquipmentOperationalState = "active" | "disabled";
export type SecurityPosture = "routine" | "watchful";
export type SecurityObservationTag =
  | "flare-observed"
  | "field-relay-observed"
  | "porter-support-observed"
  | "opened-traversal-observed";

export interface PersistedSecurityState {
  readonly posture: SecurityPosture;
  readonly confirmedContactVisitCount: number;
  readonly lastConfirmedContactVisitId: string | null;
  readonly observedTacticTags: readonly SecurityObservationTag[];
}

export interface WorldAnchorDefinition {
  readonly id: WorldEntityId;
  readonly navigationNodeId: string;
  readonly position: Vec3;
}

export interface WorldTraversalDefinition {
  readonly id: WorldEntityId;
  readonly shortcutId: string;
  readonly colliderId: string;
  readonly navigationEdgeId: string;
  readonly initialState: TraversalState;
}

export interface WorldMachineDefinition {
  readonly id: WorldEntityId;
  readonly safeAnchorId: WorldEntityId;
}

export interface WorldUniqueItemDefinition {
  readonly id: WorldEntityId;
  readonly sourceId: string;
  readonly contractId: string | null;
}

export interface WorldEvidenceDefinition {
  readonly id: WorldEntityId;
  readonly sourceId: string;
  readonly label: string;
}

export interface WorldContractDefinition {
  readonly id: string;
  readonly label: string;
  readonly objectiveIds: readonly WorldEntityId[];
  readonly unlockAfterContractId: string | null;
  readonly rewardLabel: string;
}

export interface WorldDefinition {
  readonly id: string;
  readonly label: string;
  readonly anchors: readonly WorldAnchorDefinition[];
  readonly traversal: readonly WorldTraversalDefinition[];
  readonly machines: readonly WorldMachineDefinition[];
  readonly uniqueItems: readonly WorldUniqueItemDefinition[];
  readonly evidence: readonly WorldEvidenceDefinition[];
  readonly contracts: readonly WorldContractDefinition[];
}

export interface PersistedTraversalState {
  readonly entityId: WorldEntityId;
  readonly state: TraversalState;
}

export interface PersistedMachineRelation {
  readonly machineId: WorldEntityId;
  readonly relation: MachineRelation;
  readonly safeAnchorId: WorldEntityId;
  readonly assistedVisitCount: number;
  readonly assistedVisitIds: readonly string[];
}

export interface PersistedUniqueItemState {
  readonly entityId: WorldEntityId;
  readonly recovered: boolean;
  readonly recoveredVisitId: string | null;
}

export interface PersistedLeftBehindEquipment {
  readonly itemInstanceId: string;
  readonly definitionId: ItemDefinitionId;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly operationalState: EquipmentOperationalState;
}

export interface PersistedEvidenceState {
  readonly entityId: WorldEntityId;
  readonly discovered: boolean;
  readonly firstDiscoveredVisitId: string | null;
}

export interface ContractProgress {
  readonly contractId: string;
  readonly state: ContractState;
  readonly recoveredObjectiveIds: readonly WorldEntityId[];
  readonly completedVisitId: string | null;
}

export interface PersistedWorldStateV1 {
  readonly schemaVersion: 1;
  readonly worldInstanceId: WorldInstanceId;
  readonly worldDefinitionId: string;
  readonly revision: number;
  readonly visitCount: number;
  readonly traversalStates: readonly PersistedTraversalState[];
  readonly machineRelations: readonly PersistedMachineRelation[];
  readonly uniqueItemStates: readonly PersistedUniqueItemState[];
  readonly leftBehindEquipment: readonly PersistedLeftBehindEquipment[];
  readonly evidenceStates: readonly PersistedEvidenceState[];
  readonly contractProgress: readonly ContractProgress[];
  readonly appliedSettlementIds: readonly string[];
  readonly lastOutcome: "complete" | "partial" | "aborted" | null;
}

export interface PersistedWorldStateV2 extends Omit<PersistedWorldStateV1, "schemaVersion"> {
  readonly schemaVersion: 2;
  readonly securityState: PersistedSecurityState;
}

export type PersistedWorldState = PersistedWorldStateV2;

export type WorldDeltaEvent =
  | {
      readonly type: "porter-befriended";
      readonly machineId: WorldEntityId;
      readonly safeAnchorId: WorldEntityId;
      readonly assistedVisit: boolean;
      readonly visitId: string;
    }
  | { readonly type: "traversal-opened"; readonly traversalId: WorldEntityId }
  | {
      readonly type: "equipment-left-behind";
      readonly itemInstanceId: string;
      readonly definitionId: ItemDefinitionId;
      readonly position: Vec3;
      readonly rotationY: number;
      readonly operationalState: EquipmentOperationalState;
    }
  | { readonly type: "equipment-recovered"; readonly itemInstanceId: string }
  | { readonly type: "unique-item-extracted"; readonly itemId: WorldEntityId; readonly visitId: string }
  | { readonly type: "evidence-discovered"; readonly evidenceId: WorldEntityId; readonly visitId: string }
  | {
      readonly type: "contract-objective-recovered";
      readonly contractId: string;
      readonly objectiveId: WorldEntityId;
      readonly visitId: string;
    }
  | {
      readonly type: "security-contact-confirmed";
      readonly visitId: string;
      readonly observedTacticTags: readonly SecurityObservationTag[];
    };

export interface WorldDelta {
  readonly events: readonly WorldDeltaEvent[];
}

export type WorldStateViolationCode =
  | "UNKNOWN_TRAVERSAL"
  | "UNKNOWN_MACHINE"
  | "UNKNOWN_SAFE_ANCHOR"
  | "UNKNOWN_UNIQUE_ITEM"
  | "UNKNOWN_EVIDENCE"
  | "UNKNOWN_CONTRACT"
  | "OBJECTIVE_NOT_IN_CONTRACT"
  | "INVALID_EQUIPMENT_POSITION";

export interface WorldStateViolation {
  readonly code: WorldStateViolationCode;
  readonly entityId: string;
  readonly reason: string;
}

export interface WorldVisitSettlement {
  readonly id: string;
  readonly worldInstanceId: WorldInstanceId;
  readonly expectedRevision: number;
  readonly missionOutcomeId: string;
  readonly outcome: "complete" | "partial" | "aborted";
  readonly delta: WorldDelta;
}

export interface WorldSettlementEffects {
  readonly recoveredCargoIds: readonly WorldEntityId[];
  readonly recoveredEquipmentIds: readonly string[];
  readonly completedContractIds: readonly string[];
  readonly securityPostureChanged: boolean;
}

export type WorldSettlementResult =
  | {
      readonly status: "applied";
      readonly state: PersistedWorldState;
      readonly effects: WorldSettlementEffects;
    }
  | {
      readonly status: "duplicate";
      readonly state: PersistedWorldState;
      readonly effects: WorldSettlementEffects;
    }
  | {
      readonly status: "revision-conflict";
      readonly state: PersistedWorldState;
      readonly actualRevision: number;
      readonly expectedRevision: number;
    }
  | {
      readonly status: "invalid";
      readonly state: PersistedWorldState;
      readonly violations: readonly WorldStateViolation[];
    };

export function freezeWorldState<T extends PersistedWorldStateV1 | PersistedWorldStateV2>(state: T): T {
  return deepFreeze(structuredClone(state));
}

export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
