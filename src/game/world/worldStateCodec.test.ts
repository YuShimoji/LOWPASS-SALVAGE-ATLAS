import { describe, expect, it } from "vitest";
import { FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID } from "./floodedMarketWorld";
import { createInitialWorldState } from "./WorldState";
import { decodeWorldState, encodeWorldState, migratePersistedWorldState } from "./worldStateCodec";

describe("world state codec", () => {
  it("round-trips the initial schema without Maps or Sets", () => {
    const initial = createInitialWorldState(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    const encoded = encodeWorldState(initial);
    const decoded = decodeWorldState(encoded);
    expect(decoded).toEqual({ ok: true, state: initial });
    expect(containsMapOrSet(initial)).toBe(false);
  });

  it("round-trips the aborted outcome used by gate-return settlement", () => {
    const initial = createInitialWorldState(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    const aborted = { ...structuredClone(initial), lastOutcome: "aborted" as const };
    expect(decodeWorldState(encodeWorldState(aborted))).toEqual({ ok: true, state: aborted });
  });

  it("reports corrupt JSON", () => {
    expect(decodeWorldState("{not-json")).toMatchObject({ ok: false, code: "CORRUPT_JSON" });
  });

  it("reports a missing schema version", () => {
    expect(migratePersistedWorldState({ worldInstanceId: "x" })).toMatchObject({
      ok: false,
      code: "MISSING_SCHEMA_VERSION",
    });
  });

  it("rejects an unsupported future schema at the migration boundary", () => {
    expect(migratePersistedWorldState({ schemaVersion: 3 })).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_SCHEMA_VERSION",
    });
  });

  it("migrates a complete v1 payload without losing phase-f progress", () => {
    const current = createInitialWorldState(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    const { securityState: _securityState, ...legacyWithoutSecurity } = current;
    const legacy = {
      ...legacyWithoutSecurity,
      schemaVersion: 1 as const,
      revision: 7,
      visitCount: 3,
      traversalStates: current.traversalStates.map((entry, index) => index === 0 ? { ...entry, state: "opened" as const } : entry),
      machineRelations: current.machineRelations.map((entry, index) => index === 0 ? {
        ...entry,
        relation: "friendly" as const,
        assistedVisitCount: 2,
        assistedVisitIds: ["visit-1", "visit-2"],
      } : entry),
      leftBehindEquipment: [{
        itemInstanceId: "relay-legacy",
        definitionId: "portable-relay" as const,
        position: { x: 1, y: 0.93, z: -1 },
        rotationY: 0,
        operationalState: "active" as const,
      }],
      evidenceStates: current.evidenceStates.map((entry, index) => index === 0 ? {
        ...entry,
        discovered: true,
        firstDiscoveredVisitId: "visit-1",
      } : entry),
      appliedSettlementIds: ["settlement-legacy"],
    };

    const migrated = migratePersistedWorldState(legacy);

    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.state).toMatchObject({
      schemaVersion: 2,
      revision: 7,
      visitCount: 3,
      appliedSettlementIds: ["settlement-legacy"],
      securityState: { posture: "routine", confirmedContactVisitCount: 0 },
    });
    expect(migrated.state.traversalStates[0]?.state).toBe("opened");
    expect(migrated.state.machineRelations[0]?.relation).toBe("friendly");
    expect(migrated.state.leftBehindEquipment[0]?.itemInstanceId).toBe("relay-legacy");
    expect(migrated.state.evidenceStates[0]?.discovered).toBe(true);
  });

  it("rejects a structurally invalid v1 payload", () => {
    expect(migratePersistedWorldState({ schemaVersion: 1, revision: -1 })).toMatchObject({
      ok: false,
      code: "INVALID_WORLD_STATE",
    });
  });

  it("freezes decoded persistence data", () => {
    const initial = createInitialWorldState(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    const decoded = decodeWorldState(JSON.stringify(initial));
    expect(decoded.ok && Object.isFrozen(decoded.state)).toBe(true);
    expect(decoded.ok && Object.isFrozen(decoded.state.contractProgress)).toBe(true);
  });
});

function containsMapOrSet(value: unknown): boolean {
  if (value instanceof Map || value instanceof Set) return true;
  if (Array.isArray(value)) return value.some(containsMapOrSet);
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some(containsMapOrSet);
}
