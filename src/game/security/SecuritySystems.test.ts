import { describe, expect, it } from "vitest";
import { assessPresence, type PresenceEntity } from "../threat/PresenceService";
import {
  collectReadyBroadcasts,
  createHostileMachineKnowledge,
  decayHostileMachineKnowledge,
  observeSecurityFact,
  queueSecurityBroadcast,
} from "./HostileMachineKnowledge";
import { createSecurityBlackboard, expireSecurityFacts, shareSecurityFact } from "./SecurityBlackboard";
import { HostileMachineLinkGraph } from "./HostileMachineLinkGraph";
import { SecurityPressureController } from "./SecurityPressureController";
import { allocateSecurityTasks } from "./SecurityTaskAllocator";
import type {
  HostileMachineId,
  SecurityBlackboardState,
  SecurityFact,
  SecurityMachineDescriptor,
} from "./securityTypes";

const needleId = "machine:security:needle-01" as const;
const watcherId = "machine:security:watcher-01" as const;
const origin = { x: 0, y: 1, z: 0 };

function fact(
  kind: SecurityFact["kind"],
  targetId: string,
  sourceMachineId: HostileMachineId = watcherId,
  observedAtSeconds = 1,
  directlyObserved = true,
): SecurityFact {
  return {
    id: `security-fact:${kind}:${targetId}`,
    kind,
    sourceMachineId,
    targetId,
    position: { ...origin },
    observedAtSeconds,
    confidence: 1,
    uncertaintyRadius: 0,
    expiresAtSeconds: observedAtSeconds + 8,
    directlyObserved,
  };
}

function machines(): SecurityMachineDescriptor[] {
  return [
    { id: needleId, kind: "needle", position: { x: 2, y: 1, z: 0 }, operational: true },
    { id: watcherId, kind: "watcher", position: { x: -2, y: 2, z: 0 }, operational: true },
  ];
}

function allocate(
  blackboard: SecurityBlackboardState,
  presenceBand: "predatory" | "cautious" | "outnumbered" = "predatory",
  isReachable: () => boolean = () => true,
  elapsedSeconds = 2,
): void {
  allocateSecurityTasks(blackboard, machines(), {
    elapsedSeconds,
    presenceBand,
    safeTargetIds: new Set(),
    isReachable,
  });
}

describe("hostile machine knowledge and links", () => {
  it("keeps a direct sighting local until a delayed connected broadcast is ready", () => {
    const watcher = createHostileMachineKnowledge(watcherId);
    const sighting = observeSecurityFact(watcher, fact("agent-sighting", "player"));
    queueSecurityBroadcast(watcher, {
      id: "broadcast-1",
      factId: sighting.id,
      sourceMachineId: watcherId,
      recipientMachineId: needleId,
      queuedAtSeconds: 1,
      readyAtSeconds: 1.5,
    });
    expect(collectReadyBroadcasts(watcher, 1.49, () => true)).toEqual([]);
    expect(collectReadyBroadcasts(watcher, 1.5, () => false)).toEqual([]);
    const delivered = collectReadyBroadcasts(watcher, 2, () => true);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.fact).toMatchObject({ targetId: "player", directlyObserved: false });
  });

  it("decays confidence, grows uncertainty, and drops a fact at TTL", () => {
    const knowledge = createHostileMachineKnowledge(watcherId, 1);
    observeSecurityFact(knowledge, fact("flare-sighting", "flare-01"));
    decayHostileMachineKnowledge(knowledge, 2, 0.1, 0.5);
    expect(knowledge.localFacts["security-fact:flare-sighting:flare-01"]).toMatchObject({
      confidence: 0.9,
      uncertaintyRadius: 0.5,
    });
    expect(decayHostileMachineKnowledge(knowledge, 9, 0.1, 0.5)).toEqual(["security-fact:flare-sighting:flare-01"]);
  });

  it("uses a separate 32m hostile link and degrades through partitions and signal zones", () => {
    const graph = new HostileMachineLinkGraph([{
      id: "deep-zone",
      label: "deep",
      center: origin,
      halfExtents: { x: 4, y: 4, z: 4 },
      attenuation: 0.44,
    }], 32);
    graph.setNode({ id: watcherId, position: origin, enabled: true });
    graph.setNode({ id: needleId, position: { x: 8, y: 1, z: 0 }, enabled: true });
    const clear = graph.evaluate(watcherId, needleId, 1, () => true);
    const partitioned = graph.evaluate(watcherId, needleId, 2, () => false);
    expect(clear).toMatchObject({ connected: true });
    expect(partitioned.quality).toBeLessThan(clear.quality);
    graph.setNode({ id: needleId, position: { x: 33, y: 1, z: 0 }, enabled: true });
    expect(graph.evaluate(watcherId, needleId, 3, () => true).connected).toBe(false);
  });
});

describe("security blackboard and task allocation", () => {
  it("shares by stable fact id and newer observation time, then releases expired dependencies", () => {
    const blackboard = createSecurityBlackboard();
    const initial = fact("agent-sighting", "player", watcherId, 1);
    expect(shareSecurityFact(blackboard, initial)).toBe(true);
    expect(shareSecurityFact(blackboard, initial)).toBe(false);
    allocate(blackboard);
    expect(Object.keys(blackboard.currentAssignments)).toHaveLength(2);
    expect(expireSecurityFacts(blackboard, 10)).toEqual([initial.id]);
    expect(blackboard.currentAssignments).toEqual({});
    expect(blackboard.taskReservations).toEqual({});
  });

  it("splits watcher overwatch from needle relay sabotage and reserves the relay once", () => {
    const blackboard = createSecurityBlackboard();
    shareSecurityFact(blackboard, fact("agent-sighting", "player"));
    shareSecurityFact(blackboard, fact("relay-sighting", "relay-01"));
    allocate(blackboard);
    expect(blackboard.currentAssignments[watcherId]?.task).toBe("maintain-overwatch");
    expect(blackboard.currentAssignments[needleId]?.task).toBe("sabotage-relay");
    expect(Object.keys(blackboard.taskReservations)).toEqual(["sabotage-relay:relay-01"]);
  });

  it("investigates a flare only when no agent fact has priority", () => {
    const blackboard = createSecurityBlackboard();
    shareSecurityFact(blackboard, fact("flare-sighting", "flare-01"));
    allocate(blackboard);
    expect(blackboard.currentAssignments[watcherId]?.task).toBe("investigate-flare");
    expect(blackboard.currentAssignments[needleId]?.task).toBe("investigate-flare");
  });

  it("rejects unreachable facts and keeps deterministic assignments during hysteresis", () => {
    const unreachable = createSecurityBlackboard();
    shareSecurityFact(unreachable, fact("agent-sighting", "player"));
    allocate(unreachable, "predatory", () => false);
    expect(Object.values(unreachable.currentAssignments).map((entry) => entry.task)).toEqual(["patrol", "patrol"]);

    const stable = createSecurityBlackboard();
    shareSecurityFact(stable, fact("agent-sighting", "player"));
    allocate(stable, "predatory", () => true, 2);
    const first = structuredClone(stable.currentAssignments);
    allocate(stable, "predatory", () => true, 2.3);
    expect(stable.currentAssignments).toEqual(first);
  });

  it("blocks attack assignments when cautious and disengages the whole cell when outnumbered", () => {
    const cautious = createSecurityBlackboard();
    shareSecurityFact(cautious, fact("agent-sighting", "player"));
    shareSecurityFact(cautious, fact("relay-sighting", "relay-01"));
    allocate(cautious, "cautious");
    expect(cautious.currentAssignments[needleId]?.task).toBe("observe-agent");
    expect(Object.values(cautious.currentAssignments).some((entry) => entry.task === "sabotage-relay")).toBe(false);

    allocate(cautious, "outnumbered", () => true, 4);
    expect(Object.values(cautious.currentAssignments).map((entry) => entry.task)).toEqual(["disengage", "disengage"]);
    expect(cautious.taskReservations).toEqual({});
  });
});

describe("security pressure budget", () => {
  function controller() {
    return new SecurityPressureController({
      lockOnByAgentId: {},
      activeInterdictionMachineId: null,
      relaySabotageByRelayId: {},
      graceUntilByAgentId: {},
    }, {
      maximumConcurrentLockOnsPerAgent: 1,
      maximumConcurrentInterdictions: 1,
      maximumConcurrentRelaySabotages: 1,
      postInterferenceGraceSeconds: 4,
    });
  }

  it("requires direct sight, predatory presence, and a non-safe target for lock-on", () => {
    const pressure = controller();
    expect(pressure.canBeginLockOn(needleId, "player", 1, "predatory", false, false)).toBe(false);
    expect(pressure.canBeginLockOn(needleId, "player", 1, "cautious", true, false)).toBe(false);
    expect(pressure.canBeginLockOn(needleId, "player", 1, "predatory", true, true)).toBe(false);
    expect(pressure.canBeginLockOn(needleId, "player", 1, "predatory", true, false)).toBe(true);
  });

  it("enforces a four-second grace after interference and clears all attack tokens", () => {
    const pressure = controller();
    pressure.beginLockOn(needleId, "player");
    expect(pressure.beginInterdiction(needleId, "player", 2)).toBe(true);
    expect(pressure.canBeginLockOn(needleId, "player", 5.99, "predatory", true, false)).toBe(false);
    expect(pressure.canBeginLockOn(needleId, "player", 6, "predatory", true, false)).toBe(true);
    pressure.beginRelaySabotage(needleId, "relay-01");
    pressure.clearAttackTokens(needleId);
    expect(pressure.tokens).toMatchObject({
      lockOnByAgentId: {},
      activeInterdictionMachineId: null,
      relaySabotageByRelayId: {},
    });
  });
});

describe("watchful presence weights", () => {
  const visible = () => true;
  const entity = (
    id: string,
    side: PresenceEntity["side"],
    kind: PresenceEntity["kind"],
    x = 0,
  ): PresenceEntity => ({ id, side, kind, position: { x, y: 1, z: 0 }, operational: true, perceptible: true });
  const hostiles = [entity(needleId, "hostile", "hostile-drone"), entity(watcherId, "hostile", "hostile-observer", 1)];

  it.each([
    ["one crew", [entity("player", "allied", "crew")], "predatory", 1],
    ["one crew plus Porter", [entity("player", "allied", "crew"), entity("porter", "allied", "friendly-machine", 1)], "cautious", 1.75],
    ["two crew", [entity("player", "allied", "crew"), entity("mara", "allied", "crew", 1)], "cautious", 2],
    ["two crew plus Porter", [entity("player", "allied", "crew"), entity("mara", "allied", "crew", 1), entity("porter", "allied", "friendly-machine", 2)], "outnumbered", 2.75],
    ["three crew", [entity("player", "allied", "crew"), entity("mara", "allied", "crew", 1), entity("ito", "allied", "crew", 2)], "outnumbered", 3],
  ] as const)("classifies %s against a 1.5 security cell", (_label, allies, expectedBand, expectedAllied) => {
    const result = assessPresence("player", origin, [...allies, ...hostiles], 0, visible);
    expect(result).toMatchObject({ alliedPresence: expectedAllied, hostilePresence: 1.5, band: expectedBand });
  });

  it("does not count an ally hidden behind a partition", () => {
    const result = assessPresence("player", origin, [
      entity("player", "allied", "crew"),
      entity("mara", "allied", "crew", 4),
      ...hostiles,
    ], 0, (_from, to) => to.x !== 4);
    expect(result).toMatchObject({ alliedPresence: 1, hostilePresence: 1.5, band: "predatory" });
  });
});
