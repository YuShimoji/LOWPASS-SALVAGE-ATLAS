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
      const view = createFloodedMarket(materials, FLOODED_MARKET_MISSION, manifest, session.state, squad.state);
      expect(view.root.children.length).toBeGreaterThan(0);
      view.update(session.state, squad.state, 1);
      view.dispose();
      expect(view.root.children).toHaveLength(0);
      materials.dispose();
      squad.dispose();
      session.dispose();
    }
  });
});
