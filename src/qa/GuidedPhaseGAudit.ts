export type GuidedQaActionId =
  | "apply-loadout"
  | "deploy-watchful"
  | "reset-phase-g"
  | "isolate-player"
  | "observe-watcher"
  | "share-contact"
  | "needle-reacquire"
  | "reinforcement-arrives"
  | "porter-joins"
  | "observe-disengage"
  | "deploy-relay"
  | "start-relay-sabotage"
  | "restart-relay"
  | "deploy-flare"
  | "start-flare-diversion";

export type GuidedQaResult = "PASS" | "WAITING" | "FAILED";

export interface GuidedQaReadback {
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly world: string;
  readonly controlledAgent: string;
  readonly playerIsolationState: "isolated" | "reinforced" | "unknown";
  readonly alliedPresence: number;
  readonly hostilePresence: number;
  readonly presenceBand: string;
  readonly watcherTask: string;
  readonly needleTask: string;
  readonly hostileLinkState: "connected" | "disconnected" | "unavailable";
  readonly relayState: "not-deployed" | "active" | "sabotaging" | "disabled" | "restarting";
  readonly flareState: "not-deployed" | "active" | "observed" | "shared" | "expired";
  readonly porterState: string;
  readonly lockState: "inactive" | "locking" | "locked";
  readonly interferenceState: "inactive" | "active";
  readonly watcherLocalFactKinds: readonly string[];
  readonly needleLocalFactKinds: readonly string[];
  readonly sharedFactKinds: readonly string[];
  readonly revisions: Readonly<Record<string, number>>;
  readonly duplicateEventCount: number;
}

export interface GuidedAuditStepResult {
  readonly id: string;
  readonly label: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly durationMs: number;
  readonly timeoutMs: number;
  readonly expectedState: string;
  readonly actualState: GuidedQaReadback;
  readonly relevantRevisions: Readonly<Record<string, number>>;
  readonly result: GuidedQaResult;
  readonly failureCode: string | null;
  readonly diagnosticMessage: string;
}

export interface GuidedAuditReport {
  readonly schemaVersion: "phase-g-guided-audit-1.0.0";
  readonly generatedAtIso: string;
  readonly result: GuidedQaResult;
  readonly timeoutCount: number;
  readonly duplicateEventCount: number;
  readonly steps: readonly GuidedAuditStepResult[];
}

export interface GuidedAuditDriver {
  read(): GuidedQaReadback;
  perform(action: GuidedQaActionId): Promise<string>;
  waitFor(
    predicate: (readback: GuidedQaReadback) => boolean,
    timeoutMs: number,
  ): Promise<{ readonly matched: boolean; readonly readback: GuidedQaReadback }>;
  now(): number;
}

interface GuidedAuditStepDefinition {
  readonly id: string;
  readonly label: string;
  readonly expectedState: string;
  readonly timeoutMs: number;
  readonly action?: GuidedQaActionId;
  readonly predicate: (readback: GuidedQaReadback) => boolean;
}

export const GUIDED_PHASE_G_AUDIT_STEPS: readonly GuidedAuditStepDefinition[] = [
  step("watchful-mission", "Watchful mission starts", "world=mission, posture revision available", 12_000, "deploy-watchful", (r) => r.world === "mission"),
  step("player-isolated", "Player is isolated", "isolation=isolated", 3_000, "isolate-player", (r) => r.playerIsolationState === "isolated"),
  step("watcher-recognition", "Watcher directly recognizes player", "watcher local agent fact", 5_000, undefined, (r) => r.watcherLocalFactKinds.includes("agent-sighting")),
  step("watcher-local-fact", "Watcher local fact is recorded", "watcher localFacts contains agent-sighting", 2_000, undefined, (r) => r.watcherLocalFactKinds.includes("agent-sighting")),
  step("hostile-share", "Contact crosses hostile link", "shared agent fact and connected link", 6_000, "share-contact", (r) => r.hostileLinkState === "connected" && r.sharedFactKinds.includes("agent-sighting")),
  step("needle-shared-response", "Needle reacts to shared information", "Needle task leaves patrol", 4_000, undefined, (r) => !["patrol", "none"].includes(r.needleTask)),
  step("needle-direct-reacquire", "Needle directly re-acquires player", "needle local agent fact", 5_000, "needle-reacquire", (r) => r.needleLocalFactKinds.includes("agent-sighting")),
  step("lock-on-start", "Lock-on begins", "lock=locking or locked", 6_000, undefined, (r) => r.lockState !== "inactive"),
  step("reinforcement-presence", "Reinforcement enters local presence", "allied presence >= 2", 3_000, "reinforcement-arrives", (r) => r.alliedPresence >= 2),
  step("lock-release", "Reinforcement releases lock", "lock=inactive", 4_000, undefined, (r) => r.lockState === "inactive"),
  step("cautious-transition", "Security Cell becomes cautious", "band=cautious", 5_000, undefined, (r) => r.presenceBand === "cautious"),
  step("porter-authentication", "Porter authenticates", "porter=friendly", 7_000, "porter-joins", (r) => !["dormant", "handshake", "unavailable"].includes(r.porterState)),
  step("outnumbered-transition", "Security Cell becomes outnumbered", "band=outnumbered", 5_000, undefined, (r) => r.presenceBand === "outnumbered"),
  step("cell-disengage", "Security Cell disengages", "Needle and Watcher disengage", 5_000, undefined, (r) => r.needleTask === "disengage" && r.watcherTask === "disengage"),
  step("relay-deploy", "Relay is deployed", "relay=active", 4_000, "deploy-relay", (r) => r.relayState === "active"),
  step("relay-sabotage-start", "Relay sabotage begins", "relay=sabotaging", 12_000, "start-relay-sabotage", (r) => r.relayState === "sabotaging"),
  step("relay-disabled", "Relay becomes disabled", "relay=disabled", 12_000, undefined, (r) => r.relayState === "disabled"),
  step("relay-restart", "Relay restarts", "relay=active", 5_000, "restart-relay", (r) => r.relayState === "active"),
  step("flare-deploy", "Flare is deployed", "flare=active", 4_000, "deploy-flare", (r) => r.flareState !== "not-deployed"),
  step("flare-local-fact", "Flare fact is generated", "local flare-sighting", 5_000, "start-flare-diversion", (r) => [...r.watcherLocalFactKinds, ...r.needleLocalFactKinds].includes("flare-sighting")),
  step("flare-shared-fact", "Flare fact is shared", "shared flare-sighting", 6_000, undefined, (r) => r.sharedFactKinds.includes("flare-sighting")),
  step("flare-expiry", "Flare fact expires", "no local/shared flare-sighting", 12_000, undefined, (r) =>
    ![...r.watcherLocalFactKinds, ...r.needleLocalFactKinds, ...r.sharedFactKinds].includes("flare-sighting")),
] as const;

export async function runGuidedPhaseGAudit(driver: GuidedAuditDriver): Promise<GuidedAuditReport> {
  const results: GuidedAuditStepResult[] = [];
  for (const definition of GUIDED_PHASE_G_AUDIT_STEPS) {
    const startedAt = driver.now();
    const startTick = driver.read().tick;
    let actionMessage = "";
    try {
      if (definition.action) actionMessage = await driver.perform(definition.action);
      const waited = await driver.waitFor(definition.predicate, definition.timeoutMs);
      const endedAt = driver.now();
      const result: GuidedQaResult = waited.matched ? "PASS" : "FAILED";
      results.push({
        id: definition.id,
        label: definition.label,
        startTick,
        endTick: waited.readback.tick,
        durationMs: Math.round(endedAt - startedAt),
        timeoutMs: definition.timeoutMs,
        expectedState: definition.expectedState,
        actualState: waited.readback,
        relevantRevisions: { ...waited.readback.revisions },
        result,
        failureCode: waited.matched ? null : `TIMEOUT_${definition.id.toUpperCase().replaceAll("-", "_")}`,
        diagnosticMessage: waited.matched
          ? `${actionMessage || "observed"} // ${definition.expectedState}`
          : `${actionMessage || "observed"} // expected ${definition.expectedState}`,
      });
      if (!waited.matched) break;
    } catch (error) {
      const readback = driver.read();
      results.push({
        id: definition.id,
        label: definition.label,
        startTick,
        endTick: readback.tick,
        durationMs: Math.round(driver.now() - startedAt),
        timeoutMs: definition.timeoutMs,
        expectedState: definition.expectedState,
        actualState: readback,
        relevantRevisions: { ...readback.revisions },
        result: "FAILED",
        failureCode: `DRIVER_${definition.id.toUpperCase().replaceAll("-", "_")}`,
        diagnosticMessage: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  const timeoutCount = results.filter((entry) => entry.failureCode?.startsWith("TIMEOUT_")).length;
  const duplicateEventCount = results.at(-1)?.actualState.duplicateEventCount ?? driver.read().duplicateEventCount;
  return {
    schemaVersion: "phase-g-guided-audit-1.0.0",
    generatedAtIso: new Date().toISOString(),
    result: results.length === GUIDED_PHASE_G_AUDIT_STEPS.length
      && results.every((entry) => entry.result === "PASS")
      && timeoutCount === 0
      && duplicateEventCount === 0
      ? "PASS"
      : "FAILED",
    timeoutCount,
    duplicateEventCount,
    steps: results,
  };
}

function step(
  id: string,
  label: string,
  expectedState: string,
  timeoutMs: number,
  action: GuidedQaActionId | undefined,
  predicate: (readback: GuidedQaReadback) => boolean,
): GuidedAuditStepDefinition {
  return { id, label, expectedState, timeoutMs, ...(action ? { action } : {}), predicate };
}

export function summarizeGuidedQaReadback(readback: GuidedQaReadback): string {
  return [
    `CTRL ${readback.controlledAgent.toUpperCase()} · ${readback.playerIsolationState.toUpperCase()}`,
    `PRESENCE ${readback.alliedPresence.toFixed(2)} / ${readback.hostilePresence.toFixed(2)} · ${readback.presenceBand.toUpperCase()}`,
    `WATCHER ${readback.watcherTask.toUpperCase()} · NEEDLE ${readback.needleTask.toUpperCase()}`,
    `LINK ${readback.hostileLinkState.toUpperCase()} · LOCK ${readback.lockState.toUpperCase()}`,
    `RELAY ${readback.relayState.toUpperCase()} · FLARE ${readback.flareState.toUpperCase()}`,
    `PORTER ${readback.porterState.toUpperCase()} · INTERFERENCE ${readback.interferenceState.toUpperCase()}`,
  ].join("\n");
}
