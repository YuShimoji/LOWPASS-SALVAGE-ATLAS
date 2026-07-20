import { describe, expect, it } from "vitest";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import { createExpeditionManifest, createGateEvaluationContext } from "./ExpeditionPlanner";
import { reserveExpeditionItems, settleExpeditionReservation } from "./ExpeditionReservation";
import { createInitialExpeditionDraft } from "./expeditionTypes";
import { FLOODED_MARKET_MISSION } from "./fixed/floodedMarket";
import { MissionSessionController, missionItemId } from "./MissionSession";

const context = createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY);
const manifest = createExpeditionManifest(createInitialExpeditionDraft(), context, {
  manifestId: "manifest-phase-c",
  createdAtIso: "2026-07-20T00:00:00.000Z",
});

function createSession(sessionId: string) {
  const reservation = reserveExpeditionItems(manifest, createInitialItemLocations(), `reserve-${sessionId}`);
  const controller = new MissionSessionController(
    FLOODED_MARKET_MISSION,
    manifest,
    sessionId,
    reservation.locations,
  );
  return { reservation, controller };
}

describe("MissionSession", () => {
  it("rejects carrying the cooling coil, loads it into the cart, and completes", () => {
    const manifestJson = JSON.stringify(manifest);
    const { reservation, controller } = createSession("complete-run");
    for (const sourceId of ["filter-01", "filter-02", "filter-03"]) {
      controller.handleInteraction({
        type: "mission-item",
        itemInstanceId: missionItemId("complete-run", sourceId),
      });
    }

    const coilId = missionItemId("complete-run", "cooling-coil");
    const groundBefore = structuredClone(controller.state.itemLocations[coilId]);
    expect(controller.handleInteraction({ type: "mission-item", itemInstanceId: coilId }).notice).toContain(
      "手持ちできません",
    );
    expect(controller.state.itemLocations[coilId]).toEqual(groundBefore);

    controller.handleInteraction({ type: "mission-cart-toggle" });
    controller.fixedUpdate(1 / 60, { x: 0, y: 0.93, z: -1.7 }, 0);
    controller.handleInteraction({ type: "mission-item", itemInstanceId: coilId });
    expect(controller.state.itemLocations[coilId]?.kind).toBe("cart");

    for (let step = 0; step < 40; step += 1) {
      controller.fixedUpdate(1 / 60, FLOODED_MARKET_MISSION.extractionPoint, 0);
    }
    const resolution = controller.handleInteraction({ type: "mission-extract" });
    expect(resolution.result?.outcome).toBe("complete");
    expect(resolution.result?.cartRecovered).toBe(false);
    expect(resolution.result?.recoveredResourceIds).toHaveLength(4);
    expect(JSON.stringify(manifest)).toBe(manifestJson);
    expect(Object.isFrozen(manifest)).toBe(true);

    const settled = settleExpeditionReservation(
      reservation.reservation,
      controller.state.itemLocations,
      FLOODED_MARKET_MISSION.id,
    );
    expect(settled[controller.state.cartId]).toBeUndefined();
    expect(settled["radio-01"]?.kind).toBe("ship-inventory");
  });

  it("supports a partial return with one recovered required resource", () => {
    const { controller } = createSession("partial-run");
    controller.handleInteraction({
      type: "mission-item",
      itemInstanceId: missionItemId("partial-run", "filter-01"),
    });
    const resolution = controller.handleInteraction({ type: "mission-extract" });
    expect(resolution.result?.outcome).toBe("partial");
    expect(resolution.result?.recoveredResourceIds).toHaveLength(1);
  });

  it("can reserve, run, settle, and dispose three consecutive sessions", () => {
    let persistentLocations = createInitialItemLocations();
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      const sessionId = `cycle-${cycle}`;
      const reservation = reserveExpeditionItems(manifest, persistentLocations, `reserve-${cycle}`);
      const controller = new MissionSessionController(
        FLOODED_MARKET_MISSION,
        manifest,
        sessionId,
        reservation.locations,
      );
      controller.handleInteraction({
        type: "mission-item",
        itemInstanceId: missionItemId(sessionId, "filter-01"),
      });
      expect(controller.handleInteraction({ type: "mission-extract" }).result?.outcome).toBe("partial");
      persistentLocations = settleExpeditionReservation(
        reservation.reservation,
        controller.state.itemLocations,
        FLOODED_MARKET_MISSION.id,
      );
      expect(Object.keys(persistentLocations).some((id) => id.endsWith(":shopping-cart"))).toBe(false);
      expect(persistentLocations["radio-01"]?.kind).toBe("ship-inventory");
      controller.dispose();
    }
  });

  it("records deployed expedition equipment as left behind in the immutable result", () => {
    const relayDraft = createInitialExpeditionDraft();
    relayDraft.itemInstanceIds.push("relay-01");
    relayDraft.assignments.push({ itemInstanceId: "relay-01", agentId: "player" });
    const relayManifest = createExpeditionManifest(relayDraft, context, {
      manifestId: "manifest-result-left-behind",
      createdAtIso: "2026-07-20T00:00:00.000Z",
    });
    const reservation = reserveExpeditionItems(relayManifest, createInitialItemLocations(), "reserve-left-behind");
    const controller = new MissionSessionController(
      FLOODED_MARKET_MISSION,
      relayManifest,
      "left-behind-run",
      reservation.locations,
    );
    controller.state.itemLocations["relay-01"] = { kind: "mission-ground", position: { x: 0, y: 0.93, z: -2 } };
    controller.handleInteraction({
      type: "mission-item",
      itemInstanceId: missionItemId("left-behind-run", "filter-01"),
    });
    const result = controller.handleInteraction({ type: "mission-extract" }).result;
    expect(result?.leftBehindEquipmentIds).toEqual(["relay-01"]);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
