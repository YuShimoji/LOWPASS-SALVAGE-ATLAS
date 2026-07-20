import { describe, expect, it } from "vitest";
import { createInsertionPlan } from "../insertion/InsertionPlanner";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { PorterAndroidController } from "../machines/PorterAndroidController";
import { createExpeditionManifest, createGateEvaluationContext } from "../mission/ExpeditionPlanner";
import { reserveExpeditionItems } from "../mission/ExpeditionReservation";
import { createInitialExpeditionDraft } from "../mission/expeditionTypes";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { MissionSessionController, missionItemId } from "../mission/MissionSession";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import { DistributedSquadController } from "../squad/DistributedSquadController";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import { FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID } from "./floodedMarketWorld";
import { applyWorldDelta, createInitialWorldState, settleWorldVisit } from "./WorldState";
import { buildWorldVisitSettlement, createWorldVisitProjection, repairEquipmentPlacement } from "./WorldVisit";

const context = createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY);
const manifest = createExpeditionManifest(createInitialExpeditionDraft(), context, {
  manifestId: "world-visit-manifest",
  createdAtIso: "2026-07-21T00:00:00.000Z",
});

describe("world visit projection", () => {
  it("restores cumulative 2/3 progress and spawns only the remainder plus uncontracted salvage", () => {
    const base = createInitialWorldState(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    const committed = settleWorldVisit(base, {
      id: "visit-one",
      worldInstanceId: base.worldInstanceId,
      expectedRevision: 0,
      missionOutcomeId: "outcome-one",
      outcome: "partial",
      delta: { events: [
        { type: "unique-item-extracted", itemId: "filter-01", visitId: "visit-one" },
        { type: "contract-objective-recovered", contractId: "contract-water-filters", objectiveId: "filter-01", visitId: "visit-one" },
        { type: "unique-item-extracted", itemId: "filter-02", visitId: "visit-one" },
        { type: "contract-objective-recovered", contractId: "contract-water-filters", objectiveId: "filter-02", visitId: "visit-one" },
        { type: "evidence-discovered", evidenceId: "parking-manifest", visitId: "visit-one" },
        { type: "traversal-opened", traversalId: "traversal-cooling-door" },
        { type: "porter-befriended", machineId: "porter-market-01", safeAnchorId: "anchor-loading", assistedVisit: true, visitId: "visit-one" },
      ] },
    }, FLOODED_MARKET_WORLD).state;
    const projection = createWorldVisitProjection(
      committed,
      FLOODED_MARKET_WORLD,
      FLOODED_MARKET_MISSION,
      new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation),
    );
    expect(projection.definition.salvage.map((entry) => entry.sourceId)).toEqual(["filter-03", "cooling-coil"]);
    expect(projection.activeObjectiveSourceIds).toEqual(["filter-03"]);
    expect(projection.restoredTraversalIds).toEqual(["traversal-cooling-door"]);
    expect(projection.friendlyPorter?.position).toEqual({ x: 3.45, y: 0.93, z: -4.65 });
    expect(projection.definition.searchZones.find((zone) => zone.id === "parking")?.discoveries).toEqual([]);
  });

  it("projects an invalid-but-finite equipment position to an authored safe anchor", () => {
    const placement = repairEquipmentPlacement({
      itemInstanceId: "relay-01",
      definitionId: "portable-relay",
      position: { x: 999, y: 999, z: 999 },
      rotationY: 0,
      operationalState: "active",
    }, FLOODED_MARKET_WORLD, new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation));
    expect(placement.repairedPosition).toBe(true);
    expect(placement.position).toEqual({ x: 0, y: 0.93, z: 4.8 });
    expect(placement.repairReason).toContain("FALLBACK");
  });

  it("does not duplicate the same persistent relay placement", () => {
    const base = createInitialWorldState(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    const event = {
      type: "equipment-left-behind" as const,
      itemInstanceId: "relay-01",
      definitionId: "portable-relay" as const,
      position: { x: 1, y: 0.93, z: 1 },
      rotationY: 0,
      operationalState: "active" as const,
    };
    const once = applyWorldDelta(base, { events: [event] }, FLOODED_MARKET_WORLD).state;
    const twice = applyWorldDelta(once, { events: [{ ...event, operationalState: "disabled" }] }, FLOODED_MARKET_WORLD).state;
    expect(twice.leftBehindEquipment).toHaveLength(1);
    expect(twice.leftBehindEquipment[0]?.operationalState).toBe("disabled");
  });

  it("builds a settlement only from successful extraction state", () => {
    const reservation = reserveExpeditionItems(manifest, createInitialItemLocations(), "world-visit-reservation");
    const session = new MissionSessionController(
      FLOODED_MARKET_MISSION,
      manifest,
      "world-visit-session",
      reservation.locations,
    );
    const navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
    const insertion = createInsertionPlan(manifest, "stable", "world-visit", {
      missionId: FLOODED_MARKET_MISSION.id,
      extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
      anchors: FLOODED_MARKET_MISSION.insertionAnchors,
      presets: FLOODED_MARKET_MISSION.insertionPresets,
      colliders: FLOODED_MARKET_MISSION.colliders,
      navigation,
    });
    const squad = new DistributedSquadController(FLOODED_MARKET_MISSION, manifest, insertion, session.state.itemLocations);
    const porter = new PorterAndroidController(
      FLOODED_MARKET_MISSION.porterAndroid,
      squad.navigation,
      {
        missionId: FLOODED_MARKET_MISSION.id,
        itemLocations: session.state.itemLocations,
        transferResourceToMachine: (itemId, machineId) => session.transferResourceToMachine(itemId, machineId),
        placeMachineResourceAtExtraction: (itemId, machineId) => session.placeMachineResourceAtExtraction(itemId, machineId),
        placeMachineResourceSafely: (itemId, machineId, position) => session.placeMachineResourceSafely(itemId, machineId, position),
      },
      0,
      { friendly: true, position: FLOODED_MARKET_MISSION.porterAndroid.spawn },
    );
    session.handleInteraction({ type: "mission-item", itemInstanceId: missionItemId("world-visit-session", "filter-01") });
    const result = session.handleInteraction({ type: "mission-extract" }).result;
    expect(result).not.toBeNull();
    if (!result) return;
    const settlement = buildWorldVisitSettlement({
      visitId: session.state.sessionId,
      baseState: createInitialWorldState(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID),
      world: FLOODED_MARKET_WORLD,
      result,
      manifest,
      itemLocations: session.state.itemLocations,
      squad: squad.state,
      porter: porter.state,
    });
    expect(settlement.delta.events).toContainEqual({
      type: "unique-item-extracted",
      itemId: "filter-01",
      visitId: "world-visit-session",
    });
    expect(settlement.delta.events).toContainEqual({
      type: "contract-objective-recovered",
      contractId: "contract-water-filters",
      objectiveId: "filter-01",
      visitId: "world-visit-session",
    });
    expect(Object.isFrozen(settlement)).toBe(true);
  });
});
