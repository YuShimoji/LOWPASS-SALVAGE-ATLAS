import type { ItemDefinitionId } from "../items/itemDefinitions";
import type {
  ContractProgress,
  PersistedWorldState,
  WorldDefinition,
  WorldDelta,
  WorldSettlementEffects,
  WorldSettlementResult,
  WorldStateViolation,
  WorldVisitSettlement,
} from "./worldTypes";
import { freezeWorldState } from "./worldTypes";

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

export interface WorldDeltaApplyResult {
  readonly state: PersistedWorldState;
  readonly violations: readonly WorldStateViolation[];
}

export function createInitialWorldState(
  definition: WorldDefinition,
  worldInstanceId: string,
): PersistedWorldState {
  return freezeWorldState({
    schemaVersion: 2,
    worldInstanceId,
    worldDefinitionId: definition.id,
    revision: 0,
    visitCount: 0,
    traversalStates: definition.traversal.map((entry) => ({ entityId: entry.id, state: entry.initialState })),
    machineRelations: definition.machines.map((machine) => ({
      machineId: machine.id,
      relation: "unknown",
      safeAnchorId: machine.safeAnchorId,
      assistedVisitCount: 0,
      assistedVisitIds: [],
    })),
    uniqueItemStates: definition.uniqueItems.map((item) => ({
      entityId: item.id,
      recovered: false,
      recoveredVisitId: null,
    })),
    leftBehindEquipment: [],
    evidenceStates: definition.evidence.map((entry) => ({
      entityId: entry.id,
      discovered: false,
      firstDiscoveredVisitId: null,
    })),
    contractProgress: definition.contracts.map((contract, index) => ({
      contractId: contract.id,
      state: index === 0 && contract.unlockAfterContractId === null ? "active" : "locked",
      recoveredObjectiveIds: [],
      completedVisitId: null,
    })),
    appliedSettlementIds: [],
    lastOutcome: null,
    securityState: {
      posture: "routine",
      confirmedContactVisitCount: 0,
      lastConfirmedContactVisitId: null,
      observedTacticTags: [],
    },
  });
}

export function applyWorldDelta(
  current: PersistedWorldState,
  delta: WorldDelta,
  definition: WorldDefinition,
): WorldDeltaApplyResult {
  const next = structuredClone(current) as Mutable<PersistedWorldState>;
  const violations: WorldStateViolation[] = [];

  for (const event of delta.events) {
    if (event.type === "security-contact-confirmed") {
      if (next.securityState.lastConfirmedContactVisitId !== event.visitId) {
        next.securityState.posture = "watchful";
        next.securityState.confirmedContactVisitCount += 1;
        next.securityState.lastConfirmedContactVisitId = event.visitId;
      }
      next.securityState.observedTacticTags = [...new Set([
        ...next.securityState.observedTacticTags,
        ...event.observedTacticTags,
      ])].sort();
      continue;
    }
    if (event.type === "traversal-opened") {
      const definitionEntry = definition.traversal.find((entry) => entry.id === event.traversalId);
      const stateEntry = next.traversalStates.find((entry) => entry.entityId === event.traversalId);
      if (!definitionEntry || !stateEntry) {
        violations.push(violation("UNKNOWN_TRAVERSAL", event.traversalId, "永続化対象の経路IDが世界定義にありません"));
      } else {
        stateEntry.state = "opened";
      }
      continue;
    }

    if (event.type === "porter-befriended") {
      const machine = definition.machines.find((entry) => entry.id === event.machineId);
      const anchor = definition.anchors.find((entry) => entry.id === event.safeAnchorId);
      const relation = next.machineRelations.find((entry) => entry.machineId === event.machineId);
      if (!machine || !relation) {
        violations.push(violation("UNKNOWN_MACHINE", event.machineId, "永続化対象の機械IDが世界定義にありません"));
      } else if (!anchor) {
        violations.push(violation("UNKNOWN_SAFE_ANCHOR", event.safeAnchorId, "機械の安全アンカーIDが世界定義にありません"));
      } else {
        relation.relation = "friendly";
        relation.safeAnchorId = event.safeAnchorId;
        if (event.assistedVisit && !relation.assistedVisitIds.includes(event.visitId)) {
          relation.assistedVisitCount += 1;
          relation.assistedVisitIds = [...relation.assistedVisitIds, event.visitId];
        }
      }
      continue;
    }

    if (event.type === "equipment-left-behind") {
      if (!isFinitePosition(event.position) || !Number.isFinite(event.rotationY)) {
        violations.push(violation("INVALID_EQUIPMENT_POSITION", event.itemInstanceId, "置き去り装備の位置または向きが不正です"));
      } else {
        const index = next.leftBehindEquipment.findIndex((entry) => entry.itemInstanceId === event.itemInstanceId);
        const replacement = {
          itemInstanceId: event.itemInstanceId,
          definitionId: event.definitionId as ItemDefinitionId,
          position: { ...event.position },
          rotationY: event.rotationY,
          operationalState: event.operationalState,
        };
        if (index >= 0) next.leftBehindEquipment[index] = replacement;
        else next.leftBehindEquipment.push(replacement);
      }
      continue;
    }

    if (event.type === "equipment-recovered") {
      const index = next.leftBehindEquipment.findIndex((entry) => entry.itemInstanceId === event.itemInstanceId);
      if (index >= 0) next.leftBehindEquipment.splice(index, 1);
      continue;
    }

    if (event.type === "unique-item-extracted") {
      const item = definition.uniqueItems.find((entry) => entry.id === event.itemId);
      const itemState = next.uniqueItemStates.find((entry) => entry.entityId === event.itemId);
      if (!item || !itemState) {
        violations.push(violation("UNKNOWN_UNIQUE_ITEM", event.itemId, "回収物IDが世界定義にありません"));
      } else if (!itemState.recovered) {
        itemState.recovered = true;
        itemState.recoveredVisitId = event.visitId;
      }
      continue;
    }

    if (event.type === "evidence-discovered") {
      const evidence = definition.evidence.find((entry) => entry.id === event.evidenceId);
      const evidenceState = next.evidenceStates.find((entry) => entry.entityId === event.evidenceId);
      if (!evidence || !evidenceState) {
        violations.push(violation("UNKNOWN_EVIDENCE", event.evidenceId, "証拠IDが世界定義にありません"));
      } else if (!evidenceState.discovered) {
        evidenceState.discovered = true;
        evidenceState.firstDiscoveredVisitId = event.visitId;
      }
      continue;
    }

    const contract = definition.contracts.find((entry) => entry.id === event.contractId);
    const progress = next.contractProgress.find((entry) => entry.contractId === event.contractId);
    if (!contract || !progress) {
      violations.push(violation("UNKNOWN_CONTRACT", event.contractId, "契約IDが世界定義にありません"));
    } else if (!contract.objectiveIds.includes(event.objectiveId)) {
      violations.push(violation("OBJECTIVE_NOT_IN_CONTRACT", event.objectiveId, "回収物は指定契約の目的に含まれません"));
    } else if (!progress.recoveredObjectiveIds.includes(event.objectiveId)) {
      progress.recoveredObjectiveIds = [...progress.recoveredObjectiveIds, event.objectiveId];
      if (contract.objectiveIds.every((id) => progress.recoveredObjectiveIds.includes(id))) {
        progress.state = "complete";
        progress.completedVisitId = event.visitId;
      }
    }
  }

  unlockContracts(next.contractProgress, definition);
  return {
    state: violations.length === 0 ? freezeWorldState(next) : current,
    violations: Object.freeze(violations),
  };
}

export function settleWorldVisit(
  current: PersistedWorldState,
  settlement: WorldVisitSettlement,
  definition: WorldDefinition,
): WorldSettlementResult {
  if (current.appliedSettlementIds.includes(settlement.id)) {
    return { status: "duplicate", state: current, effects: emptyEffects() };
  }
  if (current.revision !== settlement.expectedRevision || current.worldInstanceId !== settlement.worldInstanceId) {
    return {
      status: "revision-conflict",
      state: current,
      actualRevision: current.revision,
      expectedRevision: settlement.expectedRevision,
    };
  }

  const beforePosture = current.securityState.posture;
  const beforeCargo = new Set(current.uniqueItemStates.filter((entry) => entry.recovered).map((entry) => entry.entityId));
  const beforeEquipment = new Set(current.leftBehindEquipment.map((entry) => entry.itemInstanceId));
  const beforeComplete = new Set(current.contractProgress.filter((entry) => entry.state === "complete").map((entry) => entry.contractId));
  const applied = applyWorldDelta(current, settlement.delta, definition);
  if (applied.violations.length > 0) return { status: "invalid", state: current, violations: applied.violations };

  const committed = structuredClone(applied.state) as Mutable<PersistedWorldState>;
  committed.revision += 1;
  committed.visitCount += 1;
  committed.appliedSettlementIds = [...committed.appliedSettlementIds, settlement.id];
  committed.lastOutcome = settlement.outcome;
  const state = freezeWorldState(committed);
  const effects: WorldSettlementEffects = Object.freeze({
    recoveredCargoIds: Object.freeze(state.uniqueItemStates
      .filter((entry) => entry.recovered && !beforeCargo.has(entry.entityId))
      .map((entry) => entry.entityId)),
    recoveredEquipmentIds: Object.freeze([...beforeEquipment]
      .filter((itemId) => !state.leftBehindEquipment.some((entry) => entry.itemInstanceId === itemId))),
    completedContractIds: Object.freeze(state.contractProgress
      .filter((entry) => entry.state === "complete" && !beforeComplete.has(entry.contractId))
      .map((entry) => entry.contractId)),
    securityPostureChanged: beforePosture !== state.securityState.posture,
  });
  return { status: "applied", state, effects };
}

export function getActiveContract(
  state: PersistedWorldState,
  definition: WorldDefinition,
): { readonly definition: WorldDefinition["contracts"][number]; readonly progress: ContractProgress } | null {
  const progress = state.contractProgress.find((entry) => entry.state === "active")
    ?? state.contractProgress.find((entry) => entry.state === "available");
  if (!progress) return null;
  const contract = definition.contracts.find((entry) => entry.id === progress.contractId);
  return contract ? { definition: contract, progress } : null;
}

export function getVisitSalvageSourceIds(state: PersistedWorldState, definition: WorldDefinition): readonly string[] {
  const active = getActiveContract(state, definition);
  return definition.uniqueItems
    .filter((item) => {
      const recovered = state.uniqueItemStates.find((entry) => entry.entityId === item.id)?.recovered ?? false;
      return !recovered && (item.contractId === null || item.contractId === active?.definition.id);
    })
    .map((item) => item.sourceId);
}

function unlockContracts(progress: Mutable<ContractProgress>[], definition: WorldDefinition): void {
  for (const contract of definition.contracts) {
    const entry = progress.find((candidate) => candidate.contractId === contract.id);
    if (!entry || entry.state !== "locked" || contract.unlockAfterContractId === null) continue;
    const dependency = progress.find((candidate) => candidate.contractId === contract.unlockAfterContractId);
    if (dependency?.state === "complete") entry.state = "available";
  }
  if (!progress.some((entry) => entry.state === "active")) {
    const next = progress.find((entry) => entry.state === "available");
    if (next) next.state = "active";
  }
}

function emptyEffects(): WorldSettlementEffects {
  return Object.freeze({ recoveredCargoIds: [], recoveredEquipmentIds: [], completedContractIds: [], securityPostureChanged: false });
}

function violation(code: WorldStateViolation["code"], entityId: string, reason: string): WorldStateViolation {
  return Object.freeze({ code, entityId, reason });
}

function isFinitePosition(position: { readonly x: number; readonly y: number; readonly z: number }): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}
