import { describe, expect, it } from "vitest";
import { createInsertionPlan } from "../insertion/InsertionPlanner";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { createExpeditionManifest, createGateEvaluationContext } from "../mission/ExpeditionPlanner";
import { reserveExpeditionItems } from "../mission/ExpeditionReservation";
import type { ExpeditionDraft } from "../mission/expeditionTypes";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { MissionSessionController, missionItemId } from "../mission/MissionSession";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import { DistributedSquadController } from "../squad/DistributedSquadController";
import { CREW_DEFINITIONS } from "../squad/squadTypes";

const draft: ExpeditionDraft = {
  revision: 1,
  selectedAgentIds: ["player", "mara"],
  fieldLeadIds: ["player"],
  itemInstanceIds: ["radio-01", "radio-02", "terminal-01", "relay-01"],
  assignments: [
    { itemInstanceId: "radio-01", agentId: "player" },
    { itemInstanceId: "radio-02", agentId: "mara" },
    { itemInstanceId: "terminal-01", agentId: "player" },
    { itemInstanceId: "relay-01", agentId: "player" },
  ],
};
const context = createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY);
const manifest = createExpeditionManifest(draft, context, {
  manifestId: "interference-manifest",
  createdAtIso: "2026-07-20T00:00:00.000Z",
});

function createRuntime() {
  const reservation = reserveExpeditionItems(manifest, createInitialItemLocations(), "interference-reservation");
  const session = new MissionSessionController(FLOODED_MARKET_MISSION, manifest, "interference-session", reservation.locations);
  const navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
  const insertion = createInsertionPlan(manifest, "stable", "interference", {
    missionId: FLOODED_MARKET_MISSION.id,
    extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
    anchors: FLOODED_MARKET_MISSION.insertionAnchors,
    presets: FLOODED_MARKET_MISSION.insertionPresets,
    colliders: FLOODED_MARKET_MISSION.colliders,
    navigation,
  });
  const squad = new DistributedSquadController(FLOODED_MARKET_MISSION, manifest, insertion, session.state.itemLocations);
  return { session, squad };
}

describe("interference pulse and relay recovery", () => {
  it("caps communication at burst, blocks remote switching, and expires after eight seconds", () => {
    const { squad } = createRuntime();
    const player = squad.state.agents.player?.position;
    if (!player) throw new Error("player missing");
    squad.setAgentPositionForQa("mara", { ...player, x: player.x + 4 });
    squad.applyInterference("mara", 8);
    expect(squad.state.agents.mara?.communicationBand).toBe("burst");
    expect(squad.attemptControlSwitch("mara", false).resolution.code).toBe("TELEMETRY_REQUIRED");
    squad.fixedUpdate(1 / 60, player, 8.01);
    expect(squad.getInterferenceRemaining("mara", 8.01)).toBe(0);
    expect(squad.state.agents.mara?.communicationBand).toBe("telemetry");
  });

  it("drops one agent-carried hand resource without dropping equipment or duplicating items", () => {
    const { session } = createRuntime();
    const filterId = missionItemId("interference-session", "filter-01");
    session.handleInteraction({ type: "mission-item", itemInstanceId: filterId }, "player");
    const beforeKeys = Object.keys(session.state.itemLocations).sort();
    const result = session.applyInterference("player", { x: 1, y: 0.93, z: 2 }, 4);
    expect(result.droppedItemId).toBe(filterId);
    expect(session.state.itemLocations[filterId]?.kind).toBe("mission-ground");
    expect(session.state.itemLocations["radio-01"]).toEqual({ kind: "crew", crewId: "player" });
    expect(session.state.itemLocations["terminal-01"]).toEqual({ kind: "crew", crewId: "player" });
    expect(Object.keys(session.state.itemLocations).sort()).toEqual(beforeKeys);
  });

  it("disables an active relay without moving it and restores it after a 1.5 second restart", () => {
    const { session, squad } = createRuntime();
    expect(squad.deployRelay().code).toBe("RELAY_DEPLOYED");
    const locationBefore = structuredClone(session.state.itemLocations["relay-01"]);
    expect(squad.disableRelay("relay-01", 1).code).toBe("RELAY_DISABLED");
    expect(squad.isRelayDisabled("relay-01")).toBe(true);
    expect(session.state.itemLocations["relay-01"]).toEqual(locationBefore);
    expect(squad.beginRelayRestart("relay-01", 2).code).toBe("RELAY_RESTARTING");
    const player = squad.getControlledPosition();
    squad.fixedUpdate(1 / 60, player, 3.51);
    expect(squad.isRelayDisabled("relay-01")).toBe(false);
    expect(session.state.itemLocations["relay-01"]).toEqual(locationBefore);
  });

  it("interrupts a relay restart performed by the affected agent", () => {
    const { session, squad } = createRuntime();
    expect(squad.deployRelay().code).toBe("RELAY_DEPLOYED");
    expect(squad.disableRelay("relay-01", 1).code).toBe("RELAY_DISABLED");
    expect(squad.beginRelayRestart("relay-01", 2).code).toBe("RELAY_RESTARTING");
    squad.applyInterference("player", 10.5);
    expect(squad.state.relayRestartByItemId["relay-01"]).toBeUndefined();
    const player = squad.getControlledPosition();
    squad.fixedUpdate(1 / 60, player, 4);
    expect(squad.isRelayDisabled("relay-01")).toBe(true);
    expect(session.state.itemLocations["relay-01"]?.kind).toBe("mission-ground");
  });
});
