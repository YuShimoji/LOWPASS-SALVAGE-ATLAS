import type {
  PersistedWorldState,
  PersistedWorldStateV1,
  PersistedWorldStateV2,
  SecurityObservationTag,
} from "./worldTypes";
import { freezeWorldState } from "./worldTypes";

export type WorldStateCodecErrorCode =
  | "CORRUPT_JSON"
  | "MISSING_SCHEMA_VERSION"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INVALID_WORLD_STATE";

export type WorldStateDecodeResult =
  | { readonly ok: true; readonly state: PersistedWorldState }
  | { readonly ok: false; readonly code: WorldStateCodecErrorCode; readonly reason: string };

export function encodeWorldState(state: PersistedWorldState): string {
  return JSON.stringify(state);
}

export function decodeWorldState(serialized: string): WorldStateDecodeResult {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return { ok: false, code: "CORRUPT_JSON", reason: "世界状態JSONを解析できません" };
  }
  return migratePersistedWorldState(value);
}

export function migratePersistedWorldState(value: unknown): WorldStateDecodeResult {
  if (!isRecord(value) || !("schemaVersion" in value)) {
    return { ok: false, code: "MISSING_SCHEMA_VERSION", reason: "世界状態にschemaVersionがありません" };
  }
  if (value.schemaVersion === 1) {
    if (!isPersistedWorldStateV1(value)) {
      return { ok: false, code: "INVALID_WORLD_STATE", reason: "世界状態V1の必須フィールドまたは値が不正です" };
    }
    const { schemaVersion: _legacyVersion, ...legacy } = structuredClone(value);
    return {
      ok: true,
      state: freezeWorldState({
        ...legacy,
        schemaVersion: 2,
        securityState: {
          posture: "routine",
          confirmedContactVisitCount: 0,
          lastConfirmedContactVisitId: null,
          observedTacticTags: [],
        },
      } satisfies PersistedWorldStateV2),
    };
  }
  if (value.schemaVersion === 2) {
    if (!isPersistedWorldStateV2(value)) {
      return { ok: false, code: "INVALID_WORLD_STATE", reason: "世界状態V2の必須フィールドまたは値が不正です" };
    }
    return { ok: true, state: freezeWorldState(value) };
  }
  {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEMA_VERSION",
      reason: `未対応の世界状態schemaVersionです: ${String(value.schemaVersion)}`,
    };
  }
}

function isPersistedWorldStateV1(
  value: Record<string, unknown>,
): value is Record<string, unknown> & PersistedWorldStateV1 {
  return value.schemaVersion === 1 && isCommonWorldState(value);
}

function isPersistedWorldStateV2(
  value: Record<string, unknown>,
): value is Record<string, unknown> & PersistedWorldStateV2 {
  return value.schemaVersion === 2
    && isCommonWorldState(value)
    && isRecord(value.securityState)
    && (value.securityState.posture === "routine" || value.securityState.posture === "watchful")
    && isNonNegativeInteger(value.securityState.confirmedContactVisitCount)
    && isNullableString(value.securityState.lastConfirmedContactVisitId)
    && Array.isArray(value.securityState.observedTacticTags)
    && value.securityState.observedTacticTags.every(isSecurityObservationTag);
}

function isCommonWorldState(value: Record<string, unknown>): boolean {
  return typeof value.worldInstanceId === "string"
    && typeof value.worldDefinitionId === "string"
    && isNonNegativeInteger(value.revision)
    && isNonNegativeInteger(value.visitCount)
    && Array.isArray(value.traversalStates)
    && value.traversalStates.every((entry) => isRecord(entry)
      && typeof entry.entityId === "string"
      && (entry.state === "closed" || entry.state === "opened"))
    && Array.isArray(value.machineRelations)
    && value.machineRelations.every((entry) => isRecord(entry)
      && typeof entry.machineId === "string"
      && (entry.relation === "unknown" || entry.relation === "friendly")
      && typeof entry.safeAnchorId === "string"
      && isNonNegativeInteger(entry.assistedVisitCount)
      && Array.isArray(entry.assistedVisitIds)
      && entry.assistedVisitIds.every((id) => typeof id === "string"))
    && Array.isArray(value.uniqueItemStates)
    && value.uniqueItemStates.every((entry) => isRecord(entry)
      && typeof entry.entityId === "string"
      && typeof entry.recovered === "boolean"
      && isNullableString(entry.recoveredVisitId))
    && Array.isArray(value.leftBehindEquipment)
    && value.leftBehindEquipment.every((entry) => isRecord(entry)
      && typeof entry.itemInstanceId === "string"
      && typeof entry.definitionId === "string"
      && isVec3(entry.position)
      && typeof entry.rotationY === "number"
      && Number.isFinite(entry.rotationY)
      && (entry.operationalState === "active" || entry.operationalState === "disabled"))
    && Array.isArray(value.evidenceStates)
    && value.evidenceStates.every((entry) => isRecord(entry)
      && typeof entry.entityId === "string"
      && typeof entry.discovered === "boolean"
      && isNullableString(entry.firstDiscoveredVisitId))
    && Array.isArray(value.contractProgress)
    && value.contractProgress.every((entry) => isRecord(entry)
      && typeof entry.contractId === "string"
      && ["locked", "available", "active", "complete"].includes(String(entry.state))
      && Array.isArray(entry.recoveredObjectiveIds)
      && entry.recoveredObjectiveIds.every((id) => typeof id === "string")
      && isNullableString(entry.completedVisitId))
    && Array.isArray(value.appliedSettlementIds)
    && value.appliedSettlementIds.every((id) => typeof id === "string")
    && (value.lastOutcome === null
      || value.lastOutcome === "complete"
      || value.lastOutcome === "partial"
      || value.lastOutcome === "aborted");
}

function isSecurityObservationTag(value: unknown): value is SecurityObservationTag {
  return value === "flare-observed"
    || value === "field-relay-observed"
    || value === "porter-support-observed"
    || value === "opened-traversal-observed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isVec3(value: unknown): boolean {
  return isRecord(value)
    && typeof value.x === "number" && Number.isFinite(value.x)
    && typeof value.y === "number" && Number.isFinite(value.y)
    && typeof value.z === "number" && Number.isFinite(value.z);
}
