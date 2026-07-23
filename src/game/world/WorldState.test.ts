import { describe, expect, it } from "vitest";
import { FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID } from "./floodedMarketWorld";
import {
  applyWorldDelta,
  createInitialWorldState,
  getActiveContract,
  getVisitSalvageSourceIds,
  settleWorldVisit,
} from "./WorldState";
import type { WorldDelta, WorldVisitSettlement } from "./worldTypes";

const world = FLOODED_MARKET_WORLD;

function initial() {
  return createInitialWorldState(world, FLOODED_MARKET_WORLD_INSTANCE_ID);
}

function settlement(
  delta: WorldDelta,
  id = "settlement-01",
  expectedRevision = 0,
  outcome: "complete" | "partial" | "aborted" = "partial",
): WorldVisitSettlement {
  return {
    id,
    worldInstanceId: FLOODED_MARKET_WORLD_INSTANCE_ID,
    expectedRevision,
    missionOutcomeId: `outcome-${id}`,
    outcome,
    delta,
  };
}

describe("WorldState delta and settlement", () => {
  it("creates a stable initial world with one active and one locked contract", () => {
    const state = initial();
    expect(state.schemaVersion).toBe(2);
    expect(state.securityState).toEqual({
      posture: "routine",
      confirmedContactVisitCount: 0,
      lastConfirmedContactVisitId: null,
      observedTacticTags: [],
    });
    expect(state.revision).toBe(0);
    expect(state.contractProgress.map((entry) => entry.state)).toEqual(["active", "locked"]);
    expect(getVisitSalvageSourceIds(state, world)).toEqual([
      "filter-01",
      "filter-02",
      "filter-03",
      "cooling-coil",
    ]);
  });

  it("applies all supported persistent event categories", () => {
    const delta: WorldDelta = { events: [
      { type: "porter-befriended", machineId: "porter-market-01", safeAnchorId: "anchor-loading", assistedVisit: true, visitId: "visit-01" },
      { type: "traversal-opened", traversalId: "traversal-cooling-door" },
      {
        type: "equipment-left-behind",
        itemInstanceId: "relay-01",
        definitionId: "portable-relay",
        position: { x: 1, y: 0.93, z: 2 },
        rotationY: 0.5,
        operationalState: "disabled",
      },
      { type: "unique-item-extracted", itemId: "filter-01", visitId: "visit-01" },
      { type: "evidence-discovered", evidenceId: "office-record", visitId: "visit-01" },
      {
        type: "contract-objective-recovered",
        contractId: "contract-water-filters",
        objectiveId: "filter-01",
        visitId: "visit-01",
      },
    ] };
    const result = applyWorldDelta(initial(), delta, world);
    expect(result.violations).toEqual([]);
    expect(result.state.machineRelations[0]).toMatchObject({ relation: "friendly", assistedVisitCount: 1 });
    expect(result.state.traversalStates[0]?.state).toBe("opened");
    expect(result.state.leftBehindEquipment[0]).toMatchObject({ itemInstanceId: "relay-01", operationalState: "disabled" });
    expect(result.state.uniqueItemStates.find((entry) => entry.entityId === "filter-01")?.recovered).toBe(true);
    expect(result.state.evidenceStates.find((entry) => entry.entityId === "office-record")?.firstDiscoveredVisitId).toBe("visit-01");
  });

  it("is immutable and idempotent for the same world delta", () => {
    const base = initial();
    const delta: WorldDelta = { events: [
      { type: "traversal-opened", traversalId: "traversal-cooling-door" },
      { type: "unique-item-extracted", itemId: "filter-01", visitId: "visit-01" },
      { type: "porter-befriended", machineId: "porter-market-01", safeAnchorId: "anchor-loading", assistedVisit: true, visitId: "visit-01" },
    ] };
    const once = applyWorldDelta(base, delta, world).state;
    const twice = applyWorldDelta(once, delta, world).state;
    expect(base.traversalStates[0]?.state).toBe("closed");
    expect(twice).toEqual(once);
    expect(twice.machineRelations[0]?.assistedVisitCount).toBe(1);
    expect(Object.isFrozen(twice)).toBe(true);
  });

  it("promotes a confirmed contact to watchful once and merges observed tactics", () => {
    const first = settleWorldVisit(initial(), settlement({ events: [{
      type: "security-contact-confirmed",
      visitId: "visit-security-01",
      observedTacticTags: ["flare-observed", "field-relay-observed"],
    }] }, "security-settlement-01"), world);
    expect(first.status).toBe("applied");
    expect(first.state.securityState).toEqual({
      posture: "watchful",
      confirmedContactVisitCount: 1,
      lastConfirmedContactVisitId: "visit-security-01",
      observedTacticTags: ["field-relay-observed", "flare-observed"],
    });
    if (first.status !== "applied") return;
    const duplicate = settleWorldVisit(first.state, settlement({ events: [{
      type: "security-contact-confirmed",
      visitId: "visit-security-01",
      observedTacticTags: ["porter-support-observed"],
    }] }, "security-settlement-01", 1), world);
    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.state.securityState.confirmedContactVisitCount).toBe(1);
  });

  it("caps persistent escalation at watchful across later confirmed visits", () => {
    const first = settleWorldVisit(initial(), settlement({ events: [{
      type: "security-contact-confirmed",
      visitId: "visit-security-01",
      observedTacticTags: [],
    }] }, "security-settlement-01"), world);
    if (first.status !== "applied") throw new Error("first security settlement failed");
    const second = settleWorldVisit(first.state, settlement({ events: [{
      type: "security-contact-confirmed",
      visitId: "visit-security-02",
      observedTacticTags: ["opened-traversal-observed"],
    }] }, "security-settlement-02", 1, "aborted"), world);
    expect(second.status).toBe("applied");
    expect(second.state.securityState).toMatchObject({ posture: "watchful", confirmedContactVisitCount: 2 });
  });

  it("does not update security state until a visit settlement is applied", () => {
    const state = initial();
    const uncommittedDelta: WorldDelta = { events: [{
      type: "security-contact-confirmed",
      visitId: "crashed-visit",
      observedTacticTags: ["flare-observed"],
    }] };
    expect(uncommittedDelta.events).toHaveLength(1);
    expect(state.securityState).toMatchObject({ posture: "routine", confirmedContactVisitCount: 0 });
  });

  it.each(["complete", "partial", "aborted"] as const)(
    "settles confirmed security contact for a %s return",
    (outcome) => {
      const result = settleWorldVisit(initial(), settlement({ events: [{
        type: "security-contact-confirmed",
        visitId: `visit-${outcome}`,
        observedTacticTags: [],
      }] }, `settlement-${outcome}`, 0, outcome), world);
      expect(result.status).toBe("applied");
      expect(result.state).toMatchObject({
        lastOutcome: outcome,
        securityState: { posture: "watchful", confirmedContactVisitCount: 1 },
      });
    },
  );

  it("returns structured invalid-ID violations without partial application", () => {
    const base = initial();
    const result = applyWorldDelta(base, { events: [
      { type: "traversal-opened", traversalId: "missing-route" },
      { type: "unique-item-extracted", itemId: "missing-item", visitId: "visit-x" },
      { type: "evidence-discovered", evidenceId: "missing-evidence", visitId: "visit-x" },
      { type: "porter-befriended", machineId: "missing-porter", safeAnchorId: "anchor-loading", assistedVisit: false, visitId: "visit-x" },
    ] }, world);
    expect(result.violations.map((entry) => entry.code)).toEqual([
      "UNKNOWN_TRAVERSAL",
      "UNKNOWN_UNIQUE_ITEM",
      "UNKNOWN_EVIDENCE",
      "UNKNOWN_MACHINE",
    ]);
    expect(result.state).toBe(base);
  });

  it("rejects an invalid equipment transform", () => {
    const result = applyWorldDelta(initial(), { events: [{
      type: "equipment-left-behind",
      itemInstanceId: "relay-01",
      definitionId: "portable-relay",
      position: { x: Number.NaN, y: 0, z: 0 },
      rotationY: 0,
      operationalState: "active",
    }] }, world);
    expect(result.violations[0]?.code).toBe("INVALID_EQUIPMENT_POSITION");
  });

  it("commits a partial visit and advances revision exactly once", () => {
    const result = settleWorldVisit(initial(), settlement({ events: [
      { type: "unique-item-extracted", itemId: "filter-01", visitId: "visit-01" },
      { type: "contract-objective-recovered", contractId: "contract-water-filters", objectiveId: "filter-01", visitId: "visit-01" },
    ] }), world);
    expect(result.status).toBe("applied");
    expect(result.state.revision).toBe(1);
    expect(result.state.visitCount).toBe(1);
    expect(result.state.lastOutcome).toBe("partial");
    expect(result.status === "applied" && result.effects.recoveredCargoIds).toEqual(["filter-01"]);
  });

  it("commits an aborted visit without inventing cargo or contract progress", () => {
    const result = settleWorldVisit(initial(), settlement({ events: [] }, "aborted-settlement", 0, "aborted"), world);
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.state).toMatchObject({ revision: 1, visitCount: 1, lastOutcome: "aborted" });
    expect(result.effects.recoveredCargoIds).toEqual([]);
    expect(result.state.contractProgress[0]?.recoveredObjectiveIds).toEqual([]);
  });

  it("does not apply a duplicate settlement or duplicate cargo/reward", () => {
    const first = settleWorldVisit(initial(), settlement({ events: [
      { type: "unique-item-extracted", itemId: "filter-01", visitId: "visit-01" },
    ] }), world);
    expect(first.status).toBe("applied");
    const duplicate = settleWorldVisit(first.state, settlement({ events: [
      { type: "unique-item-extracted", itemId: "filter-01", visitId: "visit-01" },
    ] }), world);
    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.state.revision).toBe(1);
    expect(duplicate.status === "duplicate" && duplicate.effects.recoveredCargoIds).toEqual([]);
    expect(duplicate.status === "duplicate" && duplicate.effects.completedContractIds).toEqual([]);
  });

  it("rejects a revision conflict without overwriting newer state", () => {
    const newer = { ...initial(), revision: 2 };
    const result = settleWorldVisit(newer, settlement({ events: [] }, "stale", 1), world);
    expect(result).toMatchObject({ status: "revision-conflict", actualRevision: 2, expectedRevision: 1 });
    expect(result.state).toBe(newer);
  });

  it("keeps cumulative partial progress at 2/3 across a revisit", () => {
    const first = settleWorldVisit(initial(), settlement({ events: [
      { type: "unique-item-extracted", itemId: "filter-01", visitId: "visit-01" },
      { type: "contract-objective-recovered", contractId: "contract-water-filters", objectiveId: "filter-01", visitId: "visit-01" },
      { type: "unique-item-extracted", itemId: "filter-02", visitId: "visit-01" },
      { type: "contract-objective-recovered", contractId: "contract-water-filters", objectiveId: "filter-02", visitId: "visit-01" },
    ] }), world);
    const progress = first.state.contractProgress[0];
    expect(progress?.recoveredObjectiveIds).toEqual(["filter-01", "filter-02"]);
    expect(progress?.state).toBe("active");
    expect(getVisitSalvageSourceIds(first.state, world)).toEqual(["filter-03", "cooling-coil"]);
  });

  it("completes the remaining objective and unlocks the second contract", () => {
    const first = settleWorldVisit(initial(), settlement({ events: [
      { type: "contract-objective-recovered", contractId: "contract-water-filters", objectiveId: "filter-01", visitId: "visit-01" },
      { type: "contract-objective-recovered", contractId: "contract-water-filters", objectiveId: "filter-02", visitId: "visit-01" },
    ] }), world);
    const second = settleWorldVisit(first.state, settlement({ events: [
      { type: "unique-item-extracted", itemId: "filter-03", visitId: "visit-02" },
      { type: "contract-objective-recovered", contractId: "contract-water-filters", objectiveId: "filter-03", visitId: "visit-02" },
    ] }, "settlement-02", 1, "complete"), world);
    expect(second.state.contractProgress.map((entry) => entry.state)).toEqual(["complete", "active"]);
    expect(getActiveContract(second.state, world)?.definition.id).toBe("contract-relay-cores");
    expect(getVisitSalvageSourceIds(second.state, world)).toContain("relay-core-01");
    expect(second.status === "applied" && second.effects.completedContractIds).toEqual(["contract-water-filters"]);
  });

  it("removes recovered equipment once and returns it in settlement effects", () => {
    const left = applyWorldDelta(initial(), { events: [{
      type: "equipment-left-behind",
      itemInstanceId: "relay-01",
      definitionId: "portable-relay",
      position: { x: 0, y: 0.93, z: 0 },
      rotationY: 0,
      operationalState: "active",
    }] }, world).state;
    const result = settleWorldVisit(left, settlement({ events: [
      { type: "equipment-recovered", itemInstanceId: "relay-01" },
    ] }), world);
    expect(result.state.leftBehindEquipment).toEqual([]);
    expect(result.status === "applied" && result.effects.recoveredEquipmentIds).toEqual(["relay-01"]);
  });
});
