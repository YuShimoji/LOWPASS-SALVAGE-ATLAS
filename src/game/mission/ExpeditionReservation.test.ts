import { describe, expect, it } from "vitest";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import { createExpeditionManifest, createGateEvaluationContext } from "./ExpeditionPlanner";
import { createInitialExpeditionDraft } from "./expeditionTypes";
import {
  reserveExpeditionItems,
  rollbackExpeditionReservation,
  settleExpeditionReservation,
} from "./ExpeditionReservation";

const context = createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY);
const manifest = createExpeditionManifest(createInitialExpeditionDraft(), context, {
  manifestId: "manifest-reservation",
  createdAtIso: "2026-07-20T00:00:00.000Z",
});

describe("expedition reservation transaction", () => {
  it("moves all manifest items atomically and can roll back", () => {
    const initial = createInitialItemLocations();
    const commit = reserveExpeditionItems(manifest, initial, "reservation-01");
    expect(commit.locations["radio-01"]).toEqual({ kind: "crew", crewId: "player" });
    expect(commit.locations["flare-01"]).toEqual({ kind: "crew", crewId: "mara" });
    expect(initial["radio-01"]).toEqual({ kind: "ship-inventory" });
    expect(rollbackExpeditionReservation(commit.reservation)).toEqual(initial);
  });

  it("rejects before changing anything when one item is unavailable", () => {
    const initial = createInitialItemLocations();
    initial["radio-01"] = { kind: "crew", crewId: "ito" };
    const before = structuredClone(initial);
    expect(() => reserveExpeditionItems(manifest, initial, "reservation-02")).toThrow(
      "radio-01 is not available",
    );
    expect(initial).toEqual(before);
  });

  it("returns expedition equipment and only recovered mission resources", () => {
    const commit = reserveExpeditionItems(manifest, createInitialItemLocations(), "reservation-03");
    commit.locations["session:resource"] = {
      kind: "recovered-to-ship",
      missionId: "flooded-market-01",
    };
    commit.locations["session:shopping-cart"] = {
      kind: "mission-ground",
      position: { x: 0, y: 0, z: 0 },
    };
    const settled = settleExpeditionReservation(
      commit.reservation,
      commit.locations,
      "flooded-market-01",
    );
    expect(settled["radio-01"]).toEqual({ kind: "ship-inventory" });
    expect(settled["session:resource"]?.kind).toBe("recovered-to-ship");
    expect(settled["session:shopping-cart"]).toBeUndefined();
  });

  it("does not return expedition equipment left on mission ground", () => {
    const relayDraft = createInitialExpeditionDraft();
    relayDraft.itemInstanceIds.push("relay-01");
    relayDraft.assignments.push({ itemInstanceId: "relay-01", agentId: "player" });
    const relayManifest = createExpeditionManifest(relayDraft, context, {
      manifestId: "manifest-left-behind",
      createdAtIso: "2026-07-20T00:00:00.000Z",
    });
    const commit = reserveExpeditionItems(relayManifest, createInitialItemLocations(), "reservation-left-behind");
    commit.locations["relay-01"] = { kind: "mission-ground", position: { x: 0, y: 0.93, z: -2 } };
    const settled = settleExpeditionReservation(commit.reservation, commit.locations, "flooded-market-01");
    expect(settled["relay-01"]).toEqual({ kind: "mission-ground", position: { x: 0, y: 0.93, z: -2 } });
    expect(settled["radio-01"]?.kind).toBe("ship-inventory");
  });
});
