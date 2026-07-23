import type { SignalZoneDefinition } from "../communication/communicationTypes";
import type { Vec3 } from "../core/types";
import type { ScoutDroneRuntimeState } from "../threat/threatTypes";
import type { PresenceAssessment, PresenceBand } from "../threat/PresenceService";
import type { SecurityPosture } from "../world/worldTypes";

export type HostileMachineId = "machine:security:needle-01" | "machine:security:watcher-01";
export type HostileMachineKind = "needle" | "watcher";
export type SecurityFactKind =
  | "agent-sighting"
  | "flare-sighting"
  | "relay-sighting"
  | "friendly-machine-sighting";

export interface SecurityFact {
  readonly id: string;
  readonly kind: SecurityFactKind;
  readonly sourceMachineId: HostileMachineId;
  readonly targetId: string;
  position: Vec3;
  observedAtSeconds: number;
  confidence: number;
  uncertaintyRadius: number;
  readonly expiresAtSeconds: number;
  readonly directlyObserved: boolean;
}

export interface PendingSecurityBroadcast {
  readonly id: string;
  readonly factId: string;
  readonly sourceMachineId: HostileMachineId;
  readonly recipientMachineId: HostileMachineId;
  readonly queuedAtSeconds: number;
  readyAtSeconds: number;
}

export interface HostileMachineKnowledge {
  readonly machineId: HostileMachineId;
  readonly localFacts: Record<string, SecurityFact>;
  readonly pendingBroadcasts: Record<string, PendingSecurityBroadcast>;
  lastDecayAtSeconds: number;
}

export type SecurityTask =
  | "observe-agent"
  | "interdict-agent"
  | "investigate-flare"
  | "sabotage-relay"
  | "maintain-overwatch"
  | "regroup"
  | "disengage"
  | "patrol";

export interface SecurityTaskAssignment {
  readonly machineId: HostileMachineId;
  readonly task: SecurityTask;
  readonly targetId: string | null;
  readonly factId: string | null;
  readonly assignedAtSeconds: number;
  readonly minimumUntilSeconds: number;
  readonly reassignAfterSeconds: number;
}

export interface SecurityTaskReservation {
  readonly id: string;
  readonly task: "interdict-agent" | "sabotage-relay";
  readonly targetId: string;
  readonly machineId: HostileMachineId;
  readonly factId: string;
}

export interface SecurityPressureTokens {
  readonly lockOnByAgentId: Record<string, HostileMachineId>;
  activeInterdictionMachineId: HostileMachineId | null;
  readonly relaySabotageByRelayId: Record<string, HostileMachineId>;
  graceUntilByAgentId: Record<string, number>;
}

export interface SecurityBlackboardState {
  readonly sharedFacts: Record<string, SecurityFact>;
  currentAssignments: Record<string, SecurityTaskAssignment>;
  taskReservations: Record<string, SecurityTaskReservation>;
  pressureTokens: SecurityPressureTokens;
  revision: number;
}

export interface HostileMachineLinkState {
  readonly sourceMachineId: HostileMachineId;
  readonly targetMachineId: HostileMachineId;
  readonly quality: number;
  readonly delaySeconds: number;
  readonly connected: boolean;
  readonly evaluatedAtSeconds: number;
}

export interface SecurityCellRuntimeState {
  readonly id: "security-cell:flooded-market-01";
  posture: SecurityPosture;
  readonly needle: ScoutDroneRuntimeState;
  watcher: ScoutDroneRuntimeState | null;
  readonly knowledgeByMachine: Record<string, HostileMachineKnowledge>;
  readonly blackboard: SecurityBlackboardState;
  link: HostileMachineLinkState | null;
  presence: PresenceAssessment | null;
  confirmedContact: boolean;
  directContactStartedAtSeconds: number | null;
  observedTacticTags: Set<"flare-observed" | "field-relay-observed" | "porter-support-observed" | "opened-traversal-observed">;
  sharedContactRevision: number;
  lastAssignmentAtSeconds: number;
}

export interface SecurityMachineDescriptor {
  readonly id: HostileMachineId;
  readonly kind: HostileMachineKind;
  readonly position: Vec3;
  readonly operational: boolean;
}

export interface SecurityTaskEnvironment {
  readonly elapsedSeconds: number;
  readonly presenceBand: PresenceBand;
  readonly safeTargetIds: ReadonlySet<string>;
  readonly isReachable: (machineId: HostileMachineId, position: Vec3) => boolean;
}

export interface SecurityCellDefinition {
  readonly id: "security-cell:flooded-market-01";
  readonly needleId: "machine:security:needle-01";
  readonly watcherId: "machine:security:watcher-01";
  readonly watcherSpawn: Vec3;
  readonly watcherPatrolPoints: readonly Vec3[];
  readonly watcherCruiseAltitude: number;
  readonly watcherPatrolSpeed: number;
  readonly watcherObservationRange: number;
  readonly watcherFieldOfViewDegrees: number;
  readonly directContactConfirmationSeconds: number;
  readonly factTtlSeconds: number;
  readonly factDecayPerSecond: number;
  readonly uncertaintyGrowthPerSecond: number;
  readonly communicationRange: number;
  readonly communicationIntervalSeconds: number;
  readonly assignmentIntervalSeconds: number;
  readonly minimumTaskSeconds: number;
  readonly reassignmentCooldownSeconds: number;
  readonly maximumConcurrentLockOnsPerAgent: number;
  readonly maximumConcurrentInterdictions: number;
  readonly maximumConcurrentRelaySabotages: number;
  readonly postInterferenceGraceSeconds: number;
  readonly signalZones: readonly SignalZoneDefinition[];
}
