import { describe, expect, it } from "vitest";
import { createInsertionPlan } from "../insertion/InsertionPlanner";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { PorterAndroidController } from "../machines/PorterAndroidController";
import { createExpeditionManifest, createGateEvaluationContext } from "../mission/ExpeditionPlanner";
import { reserveExpeditionItems } from "../mission/ExpeditionReservation";
import { createInitialExpeditionDraft } from "../mission/expeditionTypes";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { MissionSessionController } from "../mission/MissionSession";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import { DistributedSquadController } from "../squad/DistributedSquadController";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import { ScoutDroneController } from "../threat/ScoutDroneController";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import { Ps1MaterialFactory } from "../../render/materials/Ps1MaterialFactory";
import { createFloodedMarket } from "../../render/objects/createFloodedMarket";
import { FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID } from "./floodedMarketWorld";
import { applyWorldDelta, createInitialWorldState } from "./WorldState";
import { createWorldVisitProjection } from "./WorldVisit";

const context = createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY);
const manifest = createExpeditionManifest(createInitialExpeditionDraft(), context, {
  manifestId: "world-restore-manifest",
  createdAtIso: "2026-07-21T00:00:00.000Z",
});

describe("world restoration projections", () => {
  it("restores traversal consistently in render, Rapier, and navigation", async () => {
    const persisted = applyWorldDelta(
      createInitialWorldState(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID),
      { events: [
        { type: "traversal-opened", traversalId: "traversal-cooling-door" },
        { type: "traversal-opened", traversalId: "traversal-loading-chain" },
      ] },
      FLOODED_MARKET_WORLD,
    ).state;
    const baseNavigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
    const projection = createWorldVisitProjection(
      persisted,
      FLOODED_MARKET_WORLD,
      FLOODED_MARKET_MISSION,
      baseNavigation,
    );
    const reservation = reserveExpeditionItems(manifest, createInitialItemLocations(), "world-restore-reservation");
    const session = new MissionSessionController(projection.definition, manifest, "world-restore-session", reservation.locations);
    const insertion = createInsertionPlan(manifest, "stable", "world-restore", {
      missionId: projection.definition.id,
      extractionPoint: projection.definition.extractionPoint,
      anchors: projection.definition.insertionAnchors,
      presets: projection.definition.insertionPresets,
      colliders: projection.definition.colliders,
      navigation: baseNavigation,
    });
    const squad = new DistributedSquadController(projection.definition, manifest, insertion, session.state.itemLocations);
    for (const traversal of FLOODED_MARKET_WORLD.traversal) squad.state.shortcutOpenById[traversal.shortcutId] = true;
    const physics = await PhysicsWorld.create({
      colliders: projection.definition.colliders,
      initialPlayerPosition: projection.definition.playerSpawn,
    });
    for (const traversal of FLOODED_MARKET_WORLD.traversal) {
      physics.setWorldColliderEnabled(traversal.colliderId, false);
      expect(squad.restoreOpenedShortcut(traversal.shortcutId).accepted).toBe(true);
      expect(squad.navigation.isEdgeEnabled(traversal.navigationEdgeId)).toBe(true);
      expect(physics.isWorldColliderEnabled(traversal.colliderId)).toBe(false);
    }
    const threat = new ScoutDroneController(
      projection.definition.threatEncounter,
      manifest.selectedAgentIds,
      squad.navigation,
    );
    const porter = new PorterAndroidController(
      projection.definition.porterAndroid,
      squad.navigation,
      {
        missionId: projection.definition.id,
        itemLocations: session.state.itemLocations,
        transferResourceToMachine: (itemId, machineId) => session.transferResourceToMachine(itemId, machineId),
        placeMachineResourceAtExtraction: (itemId, machineId) => session.placeMachineResourceAtExtraction(itemId, machineId),
        placeMachineResourceSafely: (itemId, machineId, position) => session.placeMachineResourceSafely(itemId, machineId, position),
      },
    );
    const materials = new Ps1MaterialFactory();
    const view = createFloodedMarket(
      materials,
      projection.definition,
      manifest,
      session.state,
      squad.state,
      threat.state,
      porter.state,
    );
    view.update(session.state, squad.state, threat.state, porter.state, 0);
    expect(view.root.getObjectByName("market-cooling-shortcut-gate")?.visible).toBe(false);
    expect(view.root.getObjectByName("market-loading-chain-gate")?.visible).toBe(false);
    view.dispose();
    materials.dispose();
    porter.dispose();
    threat.dispose();
    squad.dispose();
    session.dispose();
    physics.dispose();
  });

  it("restores an active or disabled relay exactly once into squad state", () => {
    const reservation = reserveExpeditionItems(manifest, createInitialItemLocations(), "relay-restore-reservation");
    const session = new MissionSessionController(FLOODED_MARKET_MISSION, manifest, "relay-restore", reservation.locations);
    const navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
    const insertion = createInsertionPlan(manifest, "stable", "relay-restore", {
      missionId: FLOODED_MARKET_MISSION.id,
      extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
      anchors: FLOODED_MARKET_MISSION.insertionAnchors,
      presets: FLOODED_MARKET_MISSION.insertionPresets,
      colliders: FLOODED_MARKET_MISSION.colliders,
      navigation,
    });
    const squad = new DistributedSquadController(FLOODED_MARKET_MISSION, manifest, insertion, session.state.itemLocations);
    squad.restoreDeployedRelay("relay-01", { x: 0, y: 0.93, z: 1 }, "active");
    squad.restoreDeployedRelay("relay-01", { x: 0, y: 0.93, z: 1 }, "disabled");
    expect(squad.state.deployedRelayItemIds).toEqual(["relay-01"]);
    expect(squad.state.disabledRelayItemIds).toEqual(["relay-01"]);
    expect(session.state.itemLocations["relay-01"]).toEqual({ kind: "mission-ground", position: { x: 0, y: 0.93, z: 1 } });
    squad.dispose();
    session.dispose();
  });
});
