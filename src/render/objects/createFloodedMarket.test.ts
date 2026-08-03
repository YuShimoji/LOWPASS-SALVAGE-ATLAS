import { describe, expect, it } from "vitest";
import { createInsertionPlan } from "../../game/insertion/InsertionPlanner";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../../game/items/itemDefinitions";
import { createExpeditionManifest, createGateEvaluationContext } from "../../game/mission/ExpeditionPlanner";
import { reserveExpeditionItems } from "../../game/mission/ExpeditionReservation";
import { createInitialExpeditionDraft } from "../../game/mission/expeditionTypes";
import { FLOODED_MARKET_MISSION } from "../../game/mission/fixed/floodedMarket";
import { MissionSessionController } from "../../game/mission/MissionSession";
import { WaypointNavigationService } from "../../game/navigation/WaypointNavigationService";
import { CREW_DEFINITIONS } from "../../game/squad/squadTypes";
import { DistributedSquadController } from "../../game/squad/DistributedSquadController";
import { ScoutDroneController } from "../../game/threat/ScoutDroneController";
import { PorterAndroidController } from "../../game/machines/PorterAndroidController";
import { Ps1MaterialFactory } from "../materials/Ps1MaterialFactory";
import { createFloodedMarket } from "./createFloodedMarket";

const context = createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY);
const manifest = createExpeditionManifest(createInitialExpeditionDraft(), context, {
  manifestId: "render-dispose-manifest",
  createdAtIso: "2026-07-20T00:00:00.000Z",
});

describe("flooded market render adapter", () => {
  it("creates, updates, and disposes three mission views without retaining scene children", () => {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const reservation = reserveExpeditionItems(manifest, createInitialItemLocations(), `render-${cycle}`);
      const session = new MissionSessionController(
        FLOODED_MARKET_MISSION,
        manifest,
        `render-session-${cycle}`,
        reservation.locations,
      );
      const navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
      const insertion = createInsertionPlan(manifest, "stable", `render-${cycle}`, {
        missionId: FLOODED_MARKET_MISSION.id,
        extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
        anchors: FLOODED_MARKET_MISSION.insertionAnchors,
        presets: FLOODED_MARKET_MISSION.insertionPresets,
        colliders: FLOODED_MARKET_MISSION.colliders,
        navigation,
      });
      const squad = new DistributedSquadController(
        FLOODED_MARKET_MISSION,
        manifest,
        insertion,
        session.state.itemLocations,
      );
      const materials = new Ps1MaterialFactory();
      const threat = new ScoutDroneController(
        FLOODED_MARKET_MISSION.threatEncounter,
        manifest.selectedAgentIds,
        squad.navigation,
      );
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
      );
      const view = createFloodedMarket(
        materials,
        FLOODED_MARKET_MISSION,
        manifest,
        session.state,
        squad.state,
        threat.state,
        porter.state,
      );
      expect(view.root.children.length).toBeGreaterThan(0);
      expect(view.root.getObjectByName("salvage-ground-marker-filter-01")).toBeDefined();
      expect(view.root.getObjectByName("salvage-ground-marker-cooling-coil")).toBeDefined();
      expect(view.root.getObjectByName("salvage-ground-marker-relay-core-01")).toBeDefined();
      expect(view.root.getObjectByName("extraction-route-chevron-1.8")).toBeDefined();
      view.update(session.state, squad.state, threat.state, porter.state, 1);
      view.dispose();
      expect(view.root.children).toHaveLength(0);
      materials.dispose();
      threat.dispose();
      porter.dispose();
      squad.dispose();
      session.dispose();
    }
  });
});
