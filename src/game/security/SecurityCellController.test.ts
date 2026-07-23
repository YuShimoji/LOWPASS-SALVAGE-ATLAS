import { describe, expect, it } from "vitest";
import { createInsertionPlan } from "../insertion/InsertionPlanner";
import { createInitialItemLocations, ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { createExpeditionManifest, createGateEvaluationContext } from "../mission/ExpeditionPlanner";
import { reserveExpeditionItems } from "../mission/ExpeditionReservation";
import type { ExpeditionDraft } from "../mission/expeditionTypes";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import { DistributedSquadController } from "../squad/DistributedSquadController";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import type { ThreatEcologyContext } from "../threat/ScoutDroneController";
import { SecurityCellController, createFloodedMarketSecurityCellDefinition } from "./SecurityCellController";

const draft: ExpeditionDraft = {
  revision: 1,
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
const manifest = createExpeditionManifest(
  draft,
  createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY),
  { manifestId: "phase-g-manifest", createdAtIso: "2026-07-23T00:00:00.000Z" },
);

function setup(posture: "routine" | "watchful" = "watchful") {
  const reservation = reserveExpeditionItems(manifest, createInitialItemLocations(), `phase-g-${posture}`);
  const navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
  const insertion = createInsertionPlan(manifest, "stable", `phase-g-${posture}`, {
    missionId: FLOODED_MARKET_MISSION.id,
    extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
    anchors: FLOODED_MARKET_MISSION.insertionAnchors,
    presets: FLOODED_MARKET_MISSION.insertionPresets,
    colliders: FLOODED_MARKET_MISSION.colliders,
    navigation,
  });
  const squad = new DistributedSquadController(FLOODED_MARKET_MISSION, manifest, insertion, reservation.locations);
  const security = new SecurityCellController(
    FLOODED_MARKET_MISSION.threatEncounter,
    manifest.selectedAgentIds,
    squad.navigation,
    0,
    posture,
    createFloodedMarketSecurityCellDefinition(FLOODED_MARKET_MISSION.signalZones),
  );
  return { squad, security };
}

function ecology(): ThreatEcologyContext {
  return {
    extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
    stimuli: [],
    relays: [],
    friendlyMachine: null,
  };
}

function update(
  squad: DistributedSquadController,
  security: SecurityCellController,
  elapsedSeconds: number,
  context = ecology(),
): void {
  security.fixedUpdate(
    0.2,
    elapsedSeconds,
    squad.state,
    () => true,
    (sourceId, targetId) => squad.getCommunicationStatus(sourceId, targetId),
    context,
  );
}

function isolateAtWatcher(squad: DistributedSquadController, security: SecurityCellController): void {
  squad.setAgentPositionForQa("player", { x: -3.45, y: 0.93, z: -5.45 });
  squad.setAgentPositionForQa("mara", { x: -6, y: 0.93, z: 6 });
  squad.setAgentPositionForQa("ito", { x: 6, y: 0.93, z: 6 });
  security.setWatcherPositionForQa({ x: -3.45, y: 2.65, z: -4.65 }, 0);
  security.setDronePositionForQa({ x: 3.45, y: 1.55, z: -4.65 }, Math.PI);
}

describe("SecurityCellController", () => {
  it("uses stable machine ids and caps routine/watchful at one or two drones", () => {
    const routine = setup("routine").security;
    expect(routine.getActiveDroneCount()).toBe(1);
    expect(routine.state.drone.id).toBe("machine:security:needle-01");
    expect(routine.state.securityCell?.watcher).toBeNull();

    routine.forcePostureForQa("watchful");
    expect(routine.getActiveDroneCount()).toBe(2);
    expect(routine.state.securityCell?.watcher?.id).toBe("machine:security:watcher-01");
    routine.forcePostureForQa("watchful");
    expect(routine.getActiveDroneCount()).toBe(2);
  });

  it("confirms continuous direct crew sighting and records only observed tactic tags", () => {
    const { squad, security } = setup();
    isolateAtWatcher(squad, security);
    for (const elapsed of [0.2, 0.4, 0.6, 0.8, 1]) update(squad, security, elapsed);
    expect(security.getSecurityObservation()).toEqual({ confirmedContact: true, observedTacticTags: [] });
  });

  it("does not share across a broken hostile link, then shares after reconnection delay", () => {
    const { squad, security } = setup();
    isolateAtWatcher(squad, security);
    security.setHostileLinkSuppressedForQa(true);
    for (const elapsed of [0.2, 0.4, 0.6, 0.8]) update(squad, security, elapsed);
    expect(security.getDebugReadback("player").security.sharedFactCount).toBe(0);

    security.setHostileLinkSuppressedForQa(false);
    for (const elapsed of [1, 1.2, 1.4, 1.6, 1.8, 2]) update(squad, security, elapsed);
    const readback = security.getDebugReadback("player").security;
    expect(readback.linkConnected).toBe(true);
    expect(readback.sharedFactCount).toBeGreaterThan(0);
    expect(readback.sharedContactRevision).toBeGreaterThan(0);
    const before = readback.sharedFacts.find((factEntry) => factEntry.id.endsWith(":player"));
    squad.setAgentPositionForQa("player", { x: -20, y: 0.93, z: 20 });
    for (const elapsed of [2.2, 2.4, 2.6, 2.8, 3]) update(squad, security, elapsed);
    const after = security.getDebugReadback("player").security.sharedFacts.find((factEntry) => factEntry.id.endsWith(":player"));
    expect(before).toBeDefined();
    expect(after?.confidence).toBeLessThan(before?.confidence ?? 0);
    expect(after?.uncertaintyRadius).toBeGreaterThan(before?.uncertaintyRadius ?? Number.POSITIVE_INFINITY);
  });

  it("moves the needle toward a shared last-known position without locking before direct reacquisition", () => {
    const { squad, security } = setup();
    isolateAtWatcher(squad, security);
    for (let index = 1; index <= 12; index += 1) update(squad, security, index * 0.2);
    expect(security.state.drone.mode).not.toBe("lock-on");
    expect(security.state.drone.mode).not.toBe("interdict");
    expect(security.state.drone.transitionReason).toContain("shared contact");
  });

  it("keeps watcher on overwatch while the needle reserves an observed active relay", () => {
    const { squad, security } = setup();
    isolateAtWatcher(squad, security);
    const context: ThreatEcologyContext = {
      ...ecology(),
      relays: [{
        id: "relay-01",
        kind: "relay",
        position: { x: -3.2, y: 0.93, z: -5.2 },
        active: true,
        disabled: false,
      }],
    };
    for (let index = 1; index <= 12; index += 1) update(squad, security, index * 0.2, context);
    const assignments = security.state.securityCell?.blackboard.currentAssignments ?? {};
    expect(assignments["machine:security:watcher-01"]?.task).toBe("maintain-overwatch");
    expect(assignments["machine:security:needle-01"]?.task).toBe("sabotage-relay");
    expect(Object.keys(security.state.securityCell?.blackboard.taskReservations ?? {})).toEqual(["sabotage-relay:relay-01"]);
  });

  it("releases the whole cell attack posture when three recognized crew outnumber it", () => {
    const { squad, security } = setup();
    squad.setAgentPositionForQa("player", { x: 3.45, y: 0.93, z: -4 });
    squad.setAgentPositionForQa("mara", { x: 3, y: 0.93, z: -4 });
    squad.setAgentPositionForQa("ito", { x: 4, y: 0.93, z: -4 });
    security.setDronePositionForQa({ x: 3.45, y: 1.55, z: -4.65 }, Math.PI);
    security.setWatcherPositionForQa({ x: 2.8, y: 2.65, z: -4.65 }, Math.PI);
    for (const elapsed of [0.2, 0.4, 0.6]) update(squad, security, elapsed);
    expect(security.state.securityCell?.presence?.band).toBe("outnumbered");
    expect(["disengage", "observe"]).toContain(security.state.drone.mode);
    expect(["disengage", "observe"]).toContain(security.state.securityCell?.watcher?.mode);
    expect(security.state.firstRetreatAnalysisRevision).toBe(1);
    expect(security.state.securityCell?.blackboard.pressureTokens).toMatchObject({
      lockOnByAgentId: {},
      activeInterdictionMachineId: null,
      relaySabotageByRelayId: {},
    });
    const retreatRevision = security.state.drone.transitionRevision;
    for (let index = 1; index <= 60; index += 1) update(squad, security, 0.6 + index * 0.2);
    expect(security.state.drone.transitionRevision - retreatRevision).toBeLessThanOrEqual(2);
  });
});
