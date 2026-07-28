import { describe, expect, it } from "vitest";
import {
  GUIDED_PHASE_G_AUDIT_STEPS,
  runGuidedPhaseGAudit,
  type GuidedAuditDriver,
  type GuidedQaActionId,
  type GuidedQaReadback,
} from "./GuidedPhaseGAudit";

const base: GuidedQaReadback = {
  tick: 0,
  elapsedSeconds: 0,
  world: "ship",
  controlledAgent: "player",
  playerIsolationState: "unknown",
  alliedPresence: 0,
  hostilePresence: 0,
  presenceBand: "none",
  watcherTask: "none",
  needleTask: "none",
  hostileLinkState: "unavailable",
  relayState: "not-deployed",
  flareState: "not-deployed",
  porterState: "unavailable",
  lockState: "inactive",
  interferenceState: "inactive",
  watcherLocalFactKinds: [],
  needleLocalFactKinds: [],
  sharedFactKinds: [],
  revisions: {},
  duplicateEventCount: 0,
};

describe("Guided Phase G audit", () => {
  it("keeps the required causal order and bounded timeouts", () => {
    expect(GUIDED_PHASE_G_AUDIT_STEPS.map((entry) => entry.id)).toEqual([
      "watchful-mission",
      "player-isolated",
      "watcher-recognition",
      "watcher-local-fact",
      "hostile-share",
      "needle-shared-response",
      "needle-direct-reacquire",
      "lock-on-start",
      "reinforcement-presence",
      "lock-release",
      "cautious-transition",
      "porter-authentication",
      "outnumbered-transition",
      "cell-disengage",
      "relay-deploy",
      "relay-sabotage-start",
      "relay-disabled",
      "relay-restart",
      "flare-deploy",
      "flare-local-fact",
      "flare-shared-fact",
      "flare-expiry",
    ]);
    expect(GUIDED_PHASE_G_AUDIT_STEPS.every((entry) => entry.timeoutMs > 0 && entry.timeoutMs <= 12_000)).toBe(true);
  });

  it("records PASS, ticks, durations, revisions, and zero duplicate events", async () => {
    let current = base;
    let now = 0;
    let stepIndex = 0;
    const passingStates: GuidedQaReadback[] = GUIDED_PHASE_G_AUDIT_STEPS.map((_entry, index) => ({
      ...base,
      tick: index + 1,
      elapsedSeconds: index + 1,
      world: "mission",
      playerIsolationState: index >= 1 && index < 8 ? "isolated" : "reinforced",
      alliedPresence: index >= 11 && index < 14 ? 2.75 : index >= 8 ? 2 : 1,
      hostilePresence: 1.5,
      presenceBand: index >= 12 && index < 14 ? "outnumbered" : index >= 10 && index < 12 ? "cautious" : "predatory",
      watcherTask: index >= 13 && index < 14 ? "disengage" : index >= 2 ? "observe-agent" : "patrol",
      needleTask: index >= 13 && index < 14 ? "disengage" : index >= 15 && index < 17 ? "sabotage-relay" : index >= 5 ? "interdict-agent" : "patrol",
      hostileLinkState: index >= 4 ? "connected" : "disconnected",
      relayState: index === 14 ? "active" : index === 15 ? "sabotaging" : index === 16 ? "disabled" : index >= 17 ? "active" : "not-deployed",
      flareState: index === 18 ? "active" : index === 19 ? "observed" : index === 20 ? "shared" : index >= 21 ? "expired" : "not-deployed",
      porterState: index >= 11 ? "friendly-idle" : "dormant",
      lockState: index === 7 ? "locking" : "inactive",
      watcherLocalFactKinds: index >= 2 ? (index >= 21 ? ["agent-sighting"] : index >= 19 ? ["agent-sighting", "flare-sighting"] : ["agent-sighting"]) : [],
      needleLocalFactKinds: index >= 6 ? (index >= 21 ? ["agent-sighting"] : index >= 19 ? ["agent-sighting", "flare-sighting"] : ["agent-sighting"]) : [],
      sharedFactKinds: index >= 4 ? (index >= 21 ? ["agent-sighting"] : index >= 20 ? ["agent-sighting", "flare-sighting"] : ["agent-sighting"]) : [],
      revisions: { blackboard: index + 1 },
    }));
    const driver: GuidedAuditDriver = {
      read: () => current,
      perform: async (_action: GuidedQaActionId) => "ACTION_ACCEPTED",
      waitFor: async (predicate) => {
        current = passingStates[stepIndex] ?? current;
        stepIndex += 1;
        now += 25;
        return { matched: predicate(current), readback: current };
      },
      now: () => now,
    };
    const report = await runGuidedPhaseGAudit(driver);
    expect(report.result).toBe("PASS");
    expect(report.timeoutCount).toBe(0);
    expect(report.duplicateEventCount).toBe(0);
    expect(report.steps).toHaveLength(22);
    expect(report.steps.every((entry) => entry.result === "PASS" && entry.endTick > entry.startTick)).toBe(true);
    expect(report.steps.every((entry) =>
      entry.expected === entry.expectedState
      && entry.actual === entry.actualState
      && entry.revision.blackboard === entry.relevantRevisions.blackboard
      && entry.failureReason === null)).toBe(true);
    expect(report.steps.at(-1)?.relevantRevisions.blackboard).toBe(22);
  });

  it("fails closed with a structured timeout code", async () => {
    const driver: GuidedAuditDriver = {
      read: () => base,
      perform: async () => "NOOP",
      waitFor: async () => ({ matched: false, readback: base }),
      now: () => 0,
    };
    const report = await runGuidedPhaseGAudit(driver);
    expect(report.result).toBe("FAILED");
    expect(report.timeoutCount).toBe(1);
    expect(report.steps[0]?.failureCode).toBe("TIMEOUT_WATCHFUL_MISSION");
    expect(report.steps[0]?.failureReason).toBe("expected world=mission, posture revision available");
  });
});
