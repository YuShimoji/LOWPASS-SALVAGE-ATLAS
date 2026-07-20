import { describe, expect, it } from "vitest";
import type { Vec3 } from "../core/types";
import { createInsertionPlan, type InsertionMode } from "../insertion/InsertionPlanner";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { createExpeditionManifest, createGateEvaluationContext } from "../mission/ExpeditionPlanner";
import { reserveExpeditionItems } from "../mission/ExpeditionReservation";
import type { ExpeditionDraft } from "../mission/expeditionTypes";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import { DistributedSquadController } from "../squad/DistributedSquadController";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import {
  ScoutDroneController,
  type ThreatEcologyContext,
  type ThreatLineOfSightQuery,
} from "./ScoutDroneController";

const draft: ExpeditionDraft = {
  revision: 9,
  selectedAgentIds: ["player", "mara", "ito"],
  fieldLeadIds: ["player"],
  itemInstanceIds: ["radio-01", "radio-02", "terminal-01", "relay-01", "flare-01"],
  assignments: [
    { itemInstanceId: "radio-01", agentId: "player" },
    { itemInstanceId: "radio-02", agentId: "ito" },
    { itemInstanceId: "terminal-01", agentId: "player" },
    { itemInstanceId: "relay-01", agentId: "player" },
    { itemInstanceId: "flare-01", agentId: "player" },
  ],
};
const context = createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY);
const manifest = createExpeditionManifest(draft, context, {
  manifestId: "phase-e-manifest",
  createdAtIso: "2026-07-20T00:00:00.000Z",
});

function createControllers(mode: InsertionMode = "stable") {
  const reservation = reserveExpeditionItems(manifest, createInitialItemLocations(), `phase-e-${mode}`);
  const navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
  const insertion = createInsertionPlan(manifest, mode, `phase-e-${mode}`, {
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
    reservation.locations,
  );
  const threat = new ScoutDroneController(
    FLOODED_MARKET_MISSION.threatEncounter,
    manifest.selectedAgentIds,
    squad.navigation,
  );
  return { squad, threat, locations: reservation.locations };
}

function updateThreat(
  squad: DistributedSquadController,
  threat: ScoutDroneController,
  elapsedSeconds: number,
  lineOfSight: ThreatLineOfSightQuery,
  dt = 0.1,
  ecology: ThreatEcologyContext | null = null,
): void {
  threat.fixedUpdate(
    dt,
    elapsedSeconds,
    squad.state,
    lineOfSight,
    (sourceId, targetId) => squad.getCommunicationStatus(sourceId, targetId),
    ecology,
  );
}

describe("ScoutDrone deterministic encounter", () => {
  it("stalks an isolated agent, locks on, and immediately disengages when reinforcement arrives", () => {
    const { squad, threat } = createControllers();
    squad.setAgentPositionForQa("ito", { x: 3.45, y: 0.93, z: -3.5 });
    squad.setAgentPositionForQa("player", { x: -6, y: 0.93, z: 6 });
    squad.setAgentPositionForQa("mara", { x: -5.5, y: 0.93, z: 6 });
    const clear = () => true;
    const ecology: ThreatEcologyContext = {
      extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
      stimuli: [],
      relays: [],
      friendlyMachine: null,
    };

    updateThreat(squad, threat, 0.8, clear);
    expect(threat.state.drone.mode).toBe("patrol");
    updateThreat(squad, threat, 1.05, clear, 0.25, ecology);
    expect(threat.state.drone.mode).toBe("stalk");
    expect(threat.state.drone.targetAgentId).toBe("ito");
    updateThreat(squad, threat, 1.3, clear, 0.25, ecology);
    expect(threat.state.drone.mode).toBe("lock-on");

    squad.setAgentPositionForQa("mara", { x: 3, y: 0.93, z: -3.5 });
    updateThreat(squad, threat, 1.35, clear, 0.05, ecology);
    expect(threat.state.drone.mode).toBe("disengage");
    expect(threat.state.firstRetreatAnalysisRevision).toBe(1);
    expect(threat.state.drone.cooldowns["reacquire:ito"]).toBeGreaterThan(5);
  });

  it("completes a two-second lock-on and emits one nonlethal interdict callback", () => {
    const { squad, threat } = createControllers();
    squad.setAgentPositionForQa("ito", { x: 3.45, y: 0.93, z: -3.5 });
    squad.setAgentPositionForQa("player", { x: -6, y: 0.93, z: 6 });
    squad.setAgentPositionForQa("mara", { x: -5.5, y: 0.93, z: 6 });
    const hits: string[] = [];
    const ecology: ThreatEcologyContext = {
      extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
      stimuli: [],
      relays: [],
      friendlyMachine: null,
      onInterdict: (agentId) => hits.push(agentId),
    };
    updateThreat(squad, threat, 0.8, () => true, 0.25, ecology);
    updateThreat(squad, threat, 1.05, () => true, 0.25, ecology);
    updateThreat(squad, threat, 1.3, () => true, 0.25, ecology);
    expect(threat.state.drone.mode).toBe("lock-on");
    updateThreat(squad, threat, 3.31, () => true, 0.1, ecology);
    expect(threat.state.drone.mode).toBe("interdict");
    expect(hits).toEqual(["ito"]);
  });

  it("aborts lock-on when line of sight is cut and honors same-target reacquire cooldown", () => {
    const { squad, threat } = createControllers();
    squad.setAgentPositionForQa("ito", { x: 3.45, y: 0.93, z: -3.5 });
    squad.setAgentPositionForQa("player", { x: -6, y: 0.93, z: 6 });
    squad.setAgentPositionForQa("mara", { x: -5.5, y: 0.93, z: 6 });
    const ecology = { extractionPoint: FLOODED_MARKET_MISSION.extractionPoint, stimuli: [], relays: [], friendlyMachine: null };
    updateThreat(squad, threat, 0.8, () => true, 0.25, ecology);
    updateThreat(squad, threat, 1.05, () => true, 0.25, ecology);
    updateThreat(squad, threat, 1.3, () => true, 0.25, ecology);
    expect(threat.state.drone.mode).toBe("lock-on");
    updateThreat(squad, threat, 1.4, () => false, 0.1, ecology);
    expect(threat.state.drone.mode).toBe("stalk");
    squad.setAgentPositionForQa("mara", { x: 3, y: 0.93, z: -3.5 });
    updateThreat(squad, threat, 1.65, () => true, 0.25, ecology);
    expect(threat.state.drone.mode).toBe("disengage");
    squad.setAgentPositionForQa("mara", { x: -5.5, y: 0.93, z: 6 });
    expect(threat.state.drone.cooldowns["reacquire:ito"]).toBeCloseTo(5.65);
  });

  it("investigates an isolated flare but only observes a flare at a grouped position", () => {
    const isolated = createControllers();
    isolated.squad.setAgentPositionForQa("player", { x: -6, y: 0.93, z: 6 });
    isolated.squad.setAgentPositionForQa("mara", { x: -5.5, y: 0.93, z: 6 });
    isolated.squad.setAgentPositionForQa("ito", { x: -5, y: 0.93, z: 6 });
    const stimulus = { id: "flare-test", kind: "flare" as const, position: { x: 3.4, y: 0.93, z: -1.5 }, active: true };
    const noCrewSight: ThreatLineOfSightQuery = (from) => from.y < 1.4;
    const ecology = { extractionPoint: FLOODED_MARKET_MISSION.extractionPoint, stimuli: [stimulus], relays: [], friendlyMachine: null };
    updateThreat(isolated.squad, isolated.threat, 0.8, noCrewSight, 0.25, ecology);
    updateThreat(isolated.squad, isolated.threat, 1.05, noCrewSight, 0.25, ecology);
    expect(isolated.threat.state.drone.mode).toBe("investigate");

    const grouped = createControllers();
    grouped.squad.setAgentPositionForQa("player", { x: 3.4, y: 0.93, z: -1.5 });
    grouped.squad.setAgentPositionForQa("mara", { x: 3.8, y: 0.93, z: -1.5 });
    grouped.squad.setAgentPositionForQa("ito", { x: -6, y: 0.93, z: 6 });
    updateThreat(grouped.squad, grouped.threat, 0.8, noCrewSight, 0.25, ecology);
    updateThreat(grouped.squad, grouped.threat, 1.05, noCrewSight, 0.25, ecology);
    expect(grouped.threat.state.drone.mode).toBe("observe");
  });

  it("sabotages an undefended active relay, but never attacks inside the extraction safe zone", () => {
    const { squad, threat } = createControllers();
    squad.setAgentPositionForQa("player", { x: -6, y: 0.93, z: 6 });
    squad.setAgentPositionForQa("mara", { x: -5.5, y: 0.93, z: 6 });
    squad.setAgentPositionForQa("ito", { x: -5, y: 0.93, z: 6 });
    threat.setDronePositionForQa({ x: 3.45, y: 1.55, z: -4.65 });
    const disabled: string[] = [];
    const relay = { id: "relay-01", kind: "relay" as const, position: { x: 3.45, y: 0.93, z: -4.65 }, active: true, disabled: false };
    const ecology: ThreatEcologyContext = {
      extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
      stimuli: [],
      relays: [relay],
      friendlyMachine: null,
      onRelaySabotage: (id) => disabled.push(id),
    };
    updateThreat(squad, threat, 0.8, () => false, 0.25, ecology);
    updateThreat(squad, threat, 1.05, () => false, 0.25, ecology);
    expect(threat.state.drone.mode).toBe("sabotage-relay");
    updateThreat(squad, threat, 3.6, () => false, 0.25, ecology);
    expect(disabled).toEqual(["relay-01"]);

    const safe = createControllers();
    safe.threat.setDronePositionForQa({ x: 0, y: 1.55, z: 3.8 }, Math.PI);
    safe.squad.setAgentPositionForQa("ito", { x: 0, y: 0.93, z: 4.4 });
    safe.squad.setAgentPositionForQa("player", { x: -6, y: 0.93, z: -6 });
    safe.squad.setAgentPositionForQa("mara", { x: 6, y: 0.93, z: -6 });
    updateThreat(safe.squad, safe.threat, 0.8, () => true, 0.25, { ...ecology, relays: [] });
    updateThreat(safe.squad, safe.threat, 1.05, () => true, 0.25, { ...ecology, relays: [] });
    expect(safe.threat.state.drone.mode).toBe("patrol");
  });

  it("does not sabotage a relay defended by nearby crew", () => {
    const { squad, threat } = createControllers();
    threat.setDronePositionForQa({ x: 3.45, y: 1.55, z: -4.65 });
    squad.setAgentPositionForQa("player", { x: 3.45, y: 0.93, z: -4.3 });
    squad.setAgentPositionForQa("mara", { x: -6, y: 0.93, z: 6 });
    squad.setAgentPositionForQa("ito", { x: -5.5, y: 0.93, z: 6 });
    const relay = { id: "relay-01", kind: "relay" as const, position: { x: 3.45, y: 0.93, z: -4.65 }, active: true, disabled: false };
    const ecology = { extractionPoint: FLOODED_MARKET_MISSION.extractionPoint, stimuli: [], relays: [relay], friendlyMachine: null };
    updateThreat(squad, threat, 0.8, () => false, 0.25, ecology);
    updateThreat(squad, threat, 1.05, () => false, 0.25, ecology);
    expect(threat.state.drone.mode).toBe("patrol");
  });

  it("reproduces the same registered encounter for fixed insertion seeds in all three modes", () => {
    for (const mode of ["stable", "paired", "scattered"] as const) {
      const first = createControllers(mode);
      const second = createControllers(mode);
      expect(first.squad.state.insertionPlan).toEqual(second.squad.state.insertionPlan);
      expect(first.threat.state.drone).toEqual(second.threat.state.drone);
      first.threat.dispose();
      second.threat.dispose();
      first.squad.dispose();
      second.squad.dispose();
    }
  });

  it("keeps direct observation local across an operator switch until communication shares it", () => {
    const { squad, threat } = createControllers("scattered");
    threat.setDronePositionForQa({ x: 0, y: 1.55, z: -6.15 });
    squad.setAgentPositionForQa("ito", { x: 0, y: 0.93, z: -6.15 });
    squad.setAgentPositionForQa("player", { x: 0, y: 0.93, z: 4.8 });
    const onlyItoSees = (from: Vec3) => from.y > 1.4 || from.z < -5.5;
    updateThreat(squad, threat, 0.1, onlyItoSees);
    expect(threat.state.byAgent.ito?.contact?.route).toBe("direct");
    expect(threat.state.byAgent.player?.contact).toBeNull();

    squad.setAgentPositionForQa("player", { x: 1, y: 0.93, z: -6.15 });
    expect(squad.attemptControlSwitch("ito", false).resolution.code).toBe("CONTROL_SWITCHED");
    expect(threat.state.byAgent.player?.contact).toBeNull();
    expect(threat.state.byAgent.ito?.contact?.observedByAgentId).toBe("ito");
  });

  it("queues a disconnected report, delivers it once through a relay, and queues the next report after recovery", () => {
    const { squad, threat, locations } = createControllers();
    threat.setDronePositionForQa({ x: 0, y: 1.55, z: -6.15 });
    squad.setAgentPositionForQa("ito", { x: 0, y: 0.93, z: -6.15 });
    squad.setAgentPositionForQa("player", { x: 0, y: 0.93, z: 4.8 });
    const undergroundObserverOnly = (from: Vec3) => from.y > 1.4 || from.z < -5.5;

    updateThreat(squad, threat, 0.1, undergroundObserverOnly);
    expect(threat.state.byAgent.player?.contact).toBeNull();
    expect(Object.values(threat.state.byAgent.ito?.pendingReports ?? {}).some((report) => report.recipientAgentId === "player")).toBe(true);

    squad.setAgentPositionForQa("player", { x: 0, y: 0.93, z: -2 });
    expect(squad.deployRelay().code).toBe("RELAY_DEPLOYED");
    expect(locations["relay-01"]?.kind).toBe("mission-ground");
    squad.setAgentPositionForQa("player", { x: 0, y: 0.93, z: 4.8 });
    updateThreat(squad, threat, 0.2, undergroundObserverOnly);
    expect(threat.state.byAgent.player?.contact?.observedByAgentId).toBe("ito");
    expect(threat.state.byAgent.player?.contact?.route).not.toBe("direct");
    const deliveryRevision = threat.state.deliveryRevision;
    const receivedCount = threat.state.byAgent.player?.receivedReportIds.length;

    squad.fixedUpdate(0.25, { x: 0, y: 0.93, z: 4.8 }, 0.3);
    updateThreat(squad, threat, 0.3, undergroundObserverOnly);
    expect(threat.state.deliveryRevision).toBe(deliveryRevision);
    expect(threat.state.byAgent.player?.receivedReportIds).toHaveLength(receivedCount ?? 0);

    squad.setAgentPositionForQa("player", { x: 0, y: 0.93, z: -2 });
    expect(squad.recoverRelay().code).toBe("RELAY_RECOVERED");
    squad.setAgentPositionForQa("player", { x: 0, y: 0.93, z: 4.8 });
    updateThreat(squad, threat, 2.3, undergroundObserverOnly);
    expect(Object.values(threat.state.byAgent.ito?.pendingReports ?? {}).some((report) => report.recipientAgentId === "player")).toBe(true);
    expect(threat.state.byAgent.player?.receivedReportIds).toHaveLength(receivedCount ?? 0);
  });

  it("allows only a nearby field-terminal holder to disable the drone without adding combat state", () => {
    const { squad, threat } = createControllers();
    threat.setDronePositionForQa({ x: 0, y: 1.55, z: 3.8 });
    const playerPosition = { x: 0, y: 0.93, z: 4.8 };
    expect(threat.attemptDisable("mara", playerPosition, false, 1, () => true).code).toBe("FIELD_TERMINAL_REQUIRED");
    const result = threat.attemptDisable(
      "player",
      playerPosition,
      squad.hasHeldItemDefinition("player", "field-terminal"),
      1.1,
      () => true,
    );
    expect(result.code).toBe("THREAT_DISABLED");
    expect(threat.state.drone.mode).toBe("disabled");
    expect(threat.state.resolution).toBe("disabled");
    expect(threat.getActiveDroneCount()).toBe(0);
    expect(Object.keys(threat.state.drone).some((key) => /health|damage|attack/i.test(key))).toBe(false);
  });

  it("preserves every Phase D squad command and structured refusal while hostile contact is active", () => {
    const { squad, threat } = createControllers();
    const player = squad.getControlledPosition();
    squad.setAgentPositionForQa("mara", { ...player, x: player.x + 0.8 });
    squad.setAgentPositionForQa("ito", { ...player, x: player.x - 0.8 });
    threat.setDronePositionForQa({ x: player.x, y: 1.55, z: player.z - 2.2 }, Math.PI);
    updateThreat(squad, threat, 0.8, () => true);
    updateThreat(squad, threat, 0.9, () => true);
    expect(threat.state.resolution).toBe("active");

    expect(squad.issueOrder("mara", { type: "follow" }, 1).code).toBe("ORDER_ACCEPTED");
    expect(squad.issueOrder("mara", { type: "hold" }, 1).code).toBe("ORDER_ACCEPTED");
    expect(squad.issueOrder("mara", { type: "move-to", targetPosition: { x: 0, y: 0.93, z: 1.1 } }, 1).code).toBe("ORDER_ACCEPTED");
    expect(squad.issueOrder("mara", { type: "search-zone", targetZoneId: "sales" }, 1).code).toBe("ORDER_ACCEPTED");
    expect(squad.deployFlare(1).code).toBe("DEPLOYED");
    expect(squad.issueOrder("mara", { type: "rally" }, 1).code).toBe("ORDER_ACCEPTED");
    expect(squad.deployRelay().code).toBe("RELAY_DEPLOYED");
    expect(squad.recoverRelay().code).toBe("RELAY_RECOVERED");

    squad.setAgentPositionForQa("ito", { x: 0, y: 0.93, z: -6.15 });
    squad.setAgentPositionForQa("player", { x: 0, y: 0.93, z: 4.8 });
    const rejection = squad.issueOrder("ito", { type: "hold" }, 2);
    expect(rejection).toMatchObject({ accepted: false, code: "COMMUNICATION_INSUFFICIENT" });
    expect(threat.state.resolution).toBe("active");
  });

  it("bounds delivered-report history and pending outboxes during a long active contact", () => {
    const { squad, threat } = createControllers();
    const player = squad.getControlledPosition();
    squad.setAgentPositionForQa("mara", { ...player, x: player.x + 0.8 });
    squad.setAgentPositionForQa("ito", { ...player, x: player.x - 0.8 });
    threat.setDronePositionForQa({ x: player.x, y: 1.55, z: player.z - 2.2 }, Math.PI);
    for (let step = 1; step <= 240; step += 1) {
      const elapsed = step * 0.25;
      squad.fixedUpdate(0.25, player, elapsed);
      updateThreat(squad, threat, elapsed, () => true, 0.25);
    }
    for (const knowledge of Object.values(threat.state.byAgent)) {
      expect(knowledge.receivedReportIds.length).toBeLessThanOrEqual(32);
      expect(Object.keys(knowledge.pendingReports).length).toBeLessThanOrEqual(2);
    }
    expect(threat.getPendingReportCount()).toBeLessThanOrEqual(6);
  });
});
