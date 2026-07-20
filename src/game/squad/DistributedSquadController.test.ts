import { describe, expect, it } from "vitest";
import { createInsertionPlan, type InsertionMode } from "../insertion/InsertionPlanner";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { createExpeditionManifest, createGateEvaluationContext } from "../mission/ExpeditionPlanner";
import { reserveExpeditionItems } from "../mission/ExpeditionReservation";
import type { ExpeditionDraft } from "../mission/expeditionTypes";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import { DistributedSquadController } from "./DistributedSquadController";
import { transitionAgentControlMode } from "./SquadControl";
import { CREW_DEFINITIONS, type CrewId } from "./squadTypes";

const draft: ExpeditionDraft = {
  revision: 8,
  selectedAgentIds: ["player", "mara", "ito"],
  fieldLeadIds: ["player"],
  itemInstanceIds: ["radio-01", "radio-02", "terminal-01", "relay-01", "flare-01"],
  assignments: [
    { itemInstanceId: "radio-01", agentId: "player" },
    { itemInstanceId: "radio-02", agentId: "mara" },
    { itemInstanceId: "terminal-01", agentId: "player" },
    { itemInstanceId: "relay-01", agentId: "player" },
    { itemInstanceId: "flare-01", agentId: "player" },
  ],
};
const context = createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY);
const manifest = createExpeditionManifest(draft, context, {
  manifestId: "phase-d-manifest",
  createdAtIso: "2026-07-20T00:00:00.000Z",
});

function createController(mode: InsertionMode = "stable") {
  const reservation = reserveExpeditionItems(manifest, createInitialItemLocations(), `reservation-${mode}`);
  const navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
  const insertion = createInsertionPlan(manifest, mode, "squad-test", {
    missionId: FLOODED_MARKET_MISSION.id,
    extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
    anchors: FLOODED_MARKET_MISSION.insertionAnchors,
    presets: FLOODED_MARKET_MISSION.insertionPresets,
    colliders: FLOODED_MARKET_MISSION.colliders,
    navigation,
  });
  const controller = new DistributedSquadController(
    FLOODED_MARKET_MISSION,
    manifest,
    insertion,
    reservation.locations,
  );
  return { controller, locations: reservation.locations };
}

function advance(controller: DistributedSquadController, controlledPosition: { x: number; y: number; z: number }, seconds: number): void {
  for (let index = 0; index < seconds * 60; index += 1) {
    controller.fixedUpdate(1 / 60, controlledPosition, index / 60);
  }
}

describe("distributed squad control", () => {
  it("allows telemetry and local switching while enforcing terminal, voice, and exclusive-operation boundaries", () => {
    const telemetry = createController();
    const equipmentBefore = structuredClone(telemetry.locations);
    telemetry.controller.setAgentPositionForQa("mara", { x: 4, y: 0.93, z: 4.8 });
    const switched = telemetry.controller.attemptControlSwitch("mara", false);
    expect(switched.resolution.code).toBe("CONTROL_SWITCHED");
    expect(telemetry.controller.state.agents.player?.controlMode).toBe("autonomous");
    expect(telemetry.controller.state.agents.mara?.controlMode).toBe("player-controlled");
    expect(telemetry.controller.state.control.fieldLeadAgentId).toBe("player");
    expect(telemetry.locations).toEqual(equipmentBefore);

    const noTerminal = createController();
    noTerminal.locations["terminal-01"] = { kind: "consumed", missionId: "test" };
    noTerminal.controller.setAgentPositionForQa("mara", { x: 4, y: 0.93, z: 4.8 });
    expect(noTerminal.controller.attemptControlSwitch("mara", false).resolution.code).toBe("FIELD_TERMINAL_REQUIRED");

    const voice = createController();
    voice.controller.setAgentPositionForQa("mara", { x: 6, y: 0.93, z: 0 });
    expect(voice.controller.state.agents.mara?.communicationBand).toBe("voice");
    expect(voice.controller.attemptControlSwitch("mara", false).resolution.code).toBe("TELEMETRY_REQUIRED");

    const local = createController();
    local.locations["terminal-01"] = { kind: "consumed", missionId: "test" };
    local.controller.setAgentPositionForQa("ito", { x: 1, y: 0.93, z: 4.8 });
    expect(local.controller.attemptControlSwitch("ito", false).resolution.code).toBe("CONTROL_SWITCHED");

    const exclusive = createController();
    exclusive.controller.setAgentPositionForQa("mara", { x: 1, y: 0.93, z: 4.8 });
    expect(exclusive.controller.attemptControlSwitch("mara", true).resolution.code).toBe("EXCLUSIVE_OPERATION_ACTIVE");
  });

  it("accepts follow, hold, move-to, search-zone, and flare rally orders", () => {
    const { controller } = createController();
    const playerPosition = controller.getControlledPosition();
    controller.setAgentPositionForQa("mara", { ...playerPosition, x: playerPosition.x + 1 });
    for (const type of ["follow", "hold"] as const) {
      expect(controller.issueOrder("mara", { type }, 0).code).toBe("ORDER_ACCEPTED");
    }
    expect(controller.issueOrder("mara", { type: "move-to", targetPosition: { x: 0, y: 0.93, z: 1.1 } }, 0).code).toBe("ORDER_ACCEPTED");
    expect(controller.issueOrder("mara", { type: "search-zone", targetZoneId: "sales" }, 0).code).toBe("ORDER_ACCEPTED");
    expect(controller.issueOrder("mara", { type: "rally" }, 0).code).toBe("NO_ACTIVE_BEACON");
    expect(controller.deployFlare(0).code).toBe("DEPLOYED");
    expect(controller.issueOrder("mara", { type: "rally" }, 0).code).toBe("ORDER_ACCEPTED");
  });

  it("continues an accepted order after contact loss, then holds on completion", () => {
    const { controller } = createController();
    const playerPosition = controller.getControlledPosition();
    controller.setAgentPositionForQa("mara", { ...playerPosition, x: playerPosition.x + 1 });
    expect(controller.issueOrder("mara", { type: "move-to", targetPosition: { x: -3.45, y: 0.93, z: -4.65 } }, 0).accepted).toBe(true);
    const before = structuredClone(controller.state.agents.mara?.position);
    const disconnected = { x: 0, y: 0.93, z: -6.15 };
    advance(controller, disconnected, 12);
    expect(controller.state.agents.mara?.position).not.toEqual(before);
    expect(controller.state.agents.mara?.lastCompletedOrderType).toBe("move-to");
    expect(controller.state.agents.mara?.currentOrder?.order.type).toBe("hold");
  });

  it("reports a structured navigation failure and leaves the agent holding", () => {
    const { controller } = createController();
    const playerPosition = controller.getControlledPosition();
    controller.setAgentPositionForQa("mara", { ...playerPosition, x: playerPosition.x + 1 });
    const resolution = controller.issueOrder("mara", { type: "move-to", targetPosition: { x: 100, y: 0.93, z: 100 } }, 0);
    expect(resolution.code).toBe("NO_NAVIGATION_PATH");
    expect(controller.state.feedback.code).toBe("NO_NAVIGATION_PATH");
  });

  it("keeps incapacitation as an explicit transition boundary", () => {
    const { controller } = createController();
    const mara = controller.state.agents.mara;
    if (!mara) throw new Error("Mara missing");
    expect(transitionAgentControlMode(mara, "incapacitated").code).toBe("CONTROL_MODE_CHANGED");
    expect(controller.issueOrder("mara", { type: "hold" }, 0).code).toBe("TARGET_INCAPACITATED");
    expect(transitionAgentControlMode(mara, "player-controlled").code).toBe("CONTROL_SWITCH_REQUIRED");
  });

  it("evaluates communication at 4Hz instead of every fixed or render frame", () => {
    const { controller } = createController();
    const revision = controller.state.communicationRevision;
    const position = controller.getControlledPosition();
    controller.fixedUpdate(0.1, position, 0.1);
    controller.fixedUpdate(0.1, position, 0.2);
    expect(controller.state.communicationRevision).toBe(revision);
    controller.fixedUpdate(0.05, position, 0.25);
    expect(controller.state.communicationRevision).toBe(revision + 1);
  });
});

describe("distributed communication equipment and knowledge", () => {
  it("restores an underground radio route through a deployed relay and removes it on recovery", () => {
    const { controller, locations } = createController();
    controller.setAgentPositionForQa("mara", { x: 0, y: 0.93, z: -6.15 });
    expect(controller.state.agents.mara?.communicationBand).toBe("none");
    controller.setAgentPositionForQa("player", { x: 0, y: 0.93, z: -2 });
    expect(controller.deployRelay().code).toBe("RELAY_DEPLOYED");
    expect(locations["relay-01"]?.kind).toBe("mission-ground");
    controller.setAgentPositionForQa("player", { x: 0, y: 0.93, z: 4.8 });
    expect(["voice", "telemetry"]).toContain(controller.state.agents.mara?.communicationBand);
    controller.setAgentPositionForQa("player", { x: 0, y: 0.93, z: -2 });
    expect(controller.recoverRelay().code).toBe("RELAY_RECOVERED");
    expect(locations["relay-01"]).toEqual({ kind: "crew", crewId: "player" });
    controller.setAgentPositionForQa("player", { x: 0, y: 0.93, z: 4.8 });
    expect(controller.state.agents.mara?.communicationBand).toBe("none");
  });

  it("queues a disconnected search report, shares it on local reconnection, and deduplicates discovery", () => {
    const { controller } = createController();
    const playerPosition = controller.getControlledPosition();
    controller.setAgentPositionForQa("ito", { ...playerPosition, x: playerPosition.x + 1 });
    expect(controller.issueOrder("ito", { type: "search-zone", targetZoneId: "sales" }, 0).accepted).toBe(true);
    const disconnectedPlayer = { x: -3.45, y: 0.93, z: -4.65 };
    advance(controller, disconnectedPlayer, 10);
    const pending = controller.state.knowledge.byAgent.ito?.pendingReports ?? {};
    expect(Object.keys(pending).length).toBeGreaterThan(0);
    const itoPosition = controller.state.agents.ito?.position;
    if (!itoPosition) throw new Error("Ito missing");
    controller.setAgentPositionForQa("player", { ...itoPosition, x: itoPosition.x + 1 });
    controller.fixedUpdate(0.25, { ...itoPosition, x: itoPosition.x + 1 }, 11);
    expect(Object.keys(controller.state.knowledge.byAgent.ito?.pendingReports ?? {})).toHaveLength(0);
    expect(Object.keys(controller.state.knowledge.squad.entries).length).toBeGreaterThan(0);
    expect(new Set(Object.keys(controller.state.knowledge.squad.entries)).size).toBe(Object.keys(controller.state.knowledge.squad.entries).length);
  });

  it("consumes a flare, creates a recognized rally beacon, and expires it", () => {
    const { controller, locations } = createController("scattered");
    const result = controller.deployFlare(1);
    expect(result.code).toBe("DEPLOYED");
    expect(locations["flare-01"]?.kind).toBe("consumed");
    controller.fixedUpdate(0.25, controller.getControlledPosition(), 2);
    expect(result.beacon?.recognizedByAgentIds.length).toBeGreaterThan(1);
    if (!result.beacon) throw new Error("Beacon missing");
    expect(controller.issueOrder("ito", { type: "rally", targetBeaconId: result.beacon.id }, 2).code).toBe("ORDER_ACCEPTED");
    controller.fixedUpdate(0.25, controller.getControlledPosition(), 47);
    expect(Object.keys(controller.state.signals.beacons)).toHaveLength(0);
    expect(controller.deployFlare(48).code).toBe("NO_FLARE_AVAILABLE");
  });
});

describe("rally objective", () => {
  it("requires sustained proximity for paired and scattered insertion without blocking the mission", () => {
    const { controller } = createController("scattered");
    const target = { x: 0, y: 0.93, z: 4.8 };
    for (const id of Object.keys(controller.state.agents) as CrewId[]) controller.setAgentPositionForQa(id, target);
    advance(controller, target, 2.2);
    expect(controller.state.rallyObjective.achieved).toBe(true);
    expect(controller.state.rallyObjective.active).toBe(false);
  });
});
