import type { CommunicationBand } from "../communication/communicationTypes";
import type { Vec3 } from "../core/types";
import type { CrewId } from "../squad/squadTypes";
import type { HostileDroneMode, MachineAgentState } from "../machines/machineTypes";
import type { PresenceAssessment } from "./PresenceService";
import type { SecurityCellRuntimeState } from "../security/securityTypes";

export type ScoutDroneMode = HostileDroneMode;

export type ThreatContactFreshness = "live" | "stale";
export type ThreatReportRoute = "direct" | "local" | CommunicationBand;

export interface ScoutDroneEncounterDefinition {
  readonly id: string;
  readonly label: string;
  readonly spawn: Vec3;
  readonly patrolPoints: readonly Vec3[];
  readonly cruiseAltitude: number;
  readonly patrolSpeed: number;
  readonly pursuitSpeed: number;
  readonly detectionRange: number;
  readonly observationRange: number;
  readonly fieldOfViewDegrees: number;
  readonly dormantSeconds: number;
  readonly investigateSeconds: number;
  readonly lostSightGraceSeconds: number;
  readonly searchSeconds: number;
  readonly staleAfterSeconds: number;
  readonly disableRange: number;
  readonly decisionIntervalSeconds: number;
  readonly perceptionIntervalSeconds: number;
  readonly presenceRadius: number;
  readonly presenceHysteresisSeconds: number;
  readonly sameTargetCooldownSeconds: number;
  readonly lockOnSeconds: number;
  readonly interdictRange: number;
  readonly interdictCooldownSeconds: number;
  readonly relaySabotageRange: number;
  readonly relaySabotageSeconds: number;
  readonly relayDefenseRadius: number;
  readonly safeZoneRadius: number;
  readonly retreatHoldSeconds: number;
}

export interface ThreatContact {
  readonly droneId: string;
  position: Vec3;
  readonly observedByAgentId: CrewId;
  observedAtSeconds: number;
  receivedAtSeconds: number;
  freshness: ThreatContactFreshness;
  route: ThreatReportRoute;
  reportId: string;
}

export interface ThreatReport {
  readonly id: string;
  readonly droneId: string;
  readonly senderAgentId: CrewId;
  readonly recipientAgentId: CrewId;
  readonly observedByAgentId: CrewId;
  readonly position: Vec3;
  readonly observedAtSeconds: number;
  readonly createdAtSeconds: number;
}

export interface AgentThreatKnowledge {
  contact: ThreatContact | null;
  readonly pendingReports: Record<string, ThreatReport>;
  readonly receivedReportIds: string[];
  lastLocalReportAtSeconds: number;
  lastLocalReportPosition: Vec3 | null;
}

export interface ScoutDroneRuntimeState extends MachineAgentState<HostileDroneMode> {
  readonly id: string;
  readonly label: string;
  facingYaw: number;
  targetAgentId: CrewId | null;
  lastKnownTargetPosition: Vec3 | null;
  lastObservedAtSeconds: number | null;
  modeEnteredAtSeconds: number;
  transitionRevision: number;
  transitionReason: string;
  patrolIndex: number;
  active: boolean;
  visible: boolean;
  lockOnProgress: number;
  sabotageRelayId: string | null;
  presence: PresenceAssessment | null;
}

export interface ThreatEncounterState {
  readonly drone: ScoutDroneRuntimeState;
  readonly additionalDrones: ScoutDroneRuntimeState[];
  readonly byAgent: Record<string, AgentThreatKnowledge>;
  communicationRevisionHandled: number;
  reportRevision: number;
  deliveryRevision: number;
  resolution: "active" | "disengaged" | "disabled";
  firstRetreatAnalysisRevision: number;
  interferenceRevision: number;
  securityCell: SecurityCellRuntimeState | null;
}

export interface ThreatCommunicationStatus {
  readonly band: CommunicationBand;
  readonly localInstructionAllowed: boolean;
}

export interface ThreatDisableResolution {
  readonly accepted: boolean;
  readonly code:
    | "THREAT_DISABLED"
    | "THREAT_ALREADY_RESOLVED"
    | "FIELD_TERMINAL_REQUIRED"
    | "THREAT_OUT_OF_RANGE"
    | "THREAT_OCCLUDED"
    | "UNKNOWN_AGENT";
  readonly reason: string;
}
