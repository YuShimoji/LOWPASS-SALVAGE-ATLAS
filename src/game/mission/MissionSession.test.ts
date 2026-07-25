import { describe, expect, it } from "vitest";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import { createExpeditionManifest, createGateEvaluationContext } from "./ExpeditionPlanner";
import { reserveExpeditionItems, settleExpeditionReservation } from "./ExpeditionReservation";
import { createInitialExpeditionDraft } from "./expeditionTypes";
import { FLOODED_MARKET_MISSION } from "./fixed/floodedMarket";
import { MissionSessionController, missionItemId, type CartMotionRequest } from "./MissionSession";

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
    const cartLocation = controller.state.itemLocations[controller.state.cartId];
    if (cartLocation?.kind !== "mission-ground") throw new Error("cart missing");
    cartLocation.position.x = 0;
    cartLocation.position.y = 0.48;
    cartLocation.position.z = -0.6;
    expect(controller.getInteractions().some((entry) => entry.action.type === "mission-cart-toggle")).toBe(false);
    expect(controller.getInteractions().find((entry) =>
      entry.action.type === "mission-item" && entry.action.itemInstanceId === coilId
    )?.prompt).toContain("カートへ積載");
    controller.handleInteraction({ type: "mission-item", itemInstanceId: coilId });
    expect(controller.state.itemLocations[coilId]?.kind).toBe("cart");
    expect(controller.getInteractions().some((entry) => entry.action.type === "mission-cart-toggle")).toBe(true);

    controller.setCartPoseForQa(FLOODED_MARKET_MISSION.extractionPoint);
    expect(controller.getInteractions().some((entry) => entry.action.type === "mission-cart-toggle")).toBe(false);
    expect(controller.getInteractions().some((entry) => entry.action.type === "mission-extract")).toBe(true);
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

  it("supports an aborted gate return with no recovered resources", () => {
    const { controller } = createSession("aborted-run");
    const resolution = controller.handleInteraction({ type: "mission-extract" });
    expect(resolution.notice).toContain("ABORTED");
    expect(resolution.result).toMatchObject({ outcome: "aborted", recoveredResourceIds: [] });
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

  it("extracts a porter-placed coil and records an immutable friendly-left-behind outcome", () => {
    const { controller } = createSession("porter-run");
    const coilId = missionItemId("porter-run", "cooling-coil");
    expect(controller.transferResourceToMachine(coilId, "porter-market-01")).toBe(true);
    expect(controller.state.itemLocations[coilId]).toEqual({ kind: "machine-carried", machineId: "porter-market-01" });
    expect(controller.placeMachineResourceAtExtraction(coilId, "porter-market-01")).toBe(true);
    controller.setAlliedMachineOutcomes([{
      machineId: "porter-market-01",
      disposition: "friendly-left-behind",
      assistedItemIds: [coilId],
    }]);
    const result = controller.handleInteraction({ type: "mission-extract" }).result;
    expect(result?.outcome).toBe("partial");
    expect(result?.recoveredResourceIds).toEqual([coilId]);
    expect(result?.alliedMachineOutcomes).toEqual([{
      machineId: "porter-market-01",
      disposition: "friendly-left-behind",
      assistedItemIds: [coilId],
    }]);
    expect(Object.isFrozen(result?.alliedMachineOutcomes[0])).toBe(true);
    controller.state.alliedMachineOutcomes[0]?.assistedItemIds.slice();
    expect(result?.alliedMachineOutcomes[0]?.disposition).toBe("friendly-left-behind");
  });

  it("attaches from the handle side and drives a bounded push/reverse/turn model", () => {
    const { controller } = createSession("cart-controls");
    const cartInteraction = controller.getInteractions().find((entry) => entry.action.type === "mission-cart-toggle");
    expect(cartInteraction?.prompt).toBe("E  カートを押す");
    expect(cartInteraction?.position.z).toBeGreaterThan(controller.getCartPosition().z);
    controller.handleInteraction({ type: "mission-cart-toggle" });
    const unrestricted = (request: CartMotionRequest) => ({
      position: request.desiredPosition,
      facingYaw: request.desiredFacingYaw,
      collisionBlocked: false,
    });
    const start = { ...controller.getCartPosition() };
    for (let step = 0; step < 60; step += 1) {
      controller.stepCartControl(1 / 60, { rawX: 0, rawY: 1 }, unrestricted);
    }
    const forward = { ...controller.getCartPosition() };
    const forwardDistance = start.z - forward.z;
    expect(forward.x).toBeCloseTo(start.x);
    expect(forwardDistance).toBeGreaterThan(1);

    controller.releaseCart();
    controller.handleInteraction({ type: "mission-cart-toggle" });
    for (let step = 0; step < 60; step += 1) {
      controller.stepCartControl(1 / 60, { rawX: 0, rawY: -1 }, unrestricted);
    }
    const reversed = { ...controller.getCartPosition() };
    expect(reversed.z).toBeGreaterThan(forward.z);
    expect(reversed.z - forward.z).toBeLessThan(forwardDistance);

    const yawBefore = controller.state.cartFacingYaw;
    for (let step = 0; step < 30; step += 1) {
      controller.stepCartControl(1 / 60, { rawX: -1, rawY: 0.5 }, unrestricted);
    }
    expect(controller.state.cartFacingYaw).toBeLessThan(yawBefore);
    expect(Math.abs(controller.getCartPosition().x - start.x)).toBeLessThan(1);
  });

  it("stops on collision and releases on cancel-equivalent or interference", () => {
    const { controller } = createSession("cart-release");
    controller.handleInteraction({ type: "mission-cart-toggle" });
    const before = { ...controller.getCartPosition() };
    const blocked = controller.stepCartControl(1 / 60, { rawX: 0, rawY: 1 }, (request) => ({
      position: request.currentPosition,
      facingYaw: request.currentFacingYaw,
      collisionBlocked: true,
    }));
    expect(blocked?.collisionBlocked).toBe(true);
    expect(controller.getCartPosition()).toEqual(before);
    expect(controller.state.cartSpeed).toBe(0);
    expect(controller.releaseCart().notice).toBe("カートを離しました");
    expect(controller.state.cartAttached).toBe(false);

    controller.handleInteraction({ type: "mission-cart-toggle" });
    controller.applyInterference("player", { x: 0, y: 0.93, z: 0 }, 1);
    expect(controller.state.cartAttached).toBe(false);
  });
});
