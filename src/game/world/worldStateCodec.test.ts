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
    expect(migratePersistedWorldState({ schemaVersion: 2 })).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_SCHEMA_VERSION",
    });
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
