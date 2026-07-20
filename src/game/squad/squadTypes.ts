import type { Vec3 } from "../core/types";
import type { ItemInstanceId } from "../items/itemDefinitions";
import type { CommunicationBand } from "../communication/communicationTypes";
import type { InsertionMode, InsertionPlan } from "../insertion/InsertionPlanner";
import type { KnowledgeState } from "../knowledge/knowledgeTypes";
import type { SignalBeaconState } from "../signals/SignalBeaconService";

export type CrewId = "player" | "mara" | "ito";
export type SquadOrderType = "follow" | "hold" | "move-to" | "search-zone" | "rally";
export type AgentControlMode = "player-controlled" | "autonomous" | "incapacitated";
export type LostContactPolicy = "finish-order-then-hold";

export interface CrewDefinition {
  id: CrewId;
  callsign: string;
  role: string;
  gateCapacityUnits: number;
  strengths: readonly string[];
}

export const CREW_DEFINITIONS: readonly CrewDefinition[] = [
  {
    id: "player",
    callsign: "Rook",
    role: "降下主任",
    gateCapacityUnits: 5,
    strengths: ["指揮", "回収"],
  },
  {
    id: "mara",
    callsign: "Mara",
    role: "機関技師",
    gateCapacityUnits: 5,
    strengths: ["修理", "重量物"],
  },
  {
    id: "ito",
    callsign: "Ito",
    role: "電測員",
    gateCapacityUnits: 5,
    strengths: ["通信", "探索"],
  },
] as const;

export interface CrewLoadout {
  crewId: CrewId;
  itemInstanceIds: readonly ItemInstanceId[];
}

export interface SquadOrder {
  readonly id: string;
  readonly type: SquadOrderType;
  readonly issuerId: CrewId;
  readonly recipientId: CrewId;
  readonly targetPosition: Vec3 | null;
  readonly targetAgentId: CrewId | null;
  readonly targetZoneId: string | null;
  readonly targetBeaconId: string | null;
  readonly issuedAtSeconds: number;
}

export interface AgentOrderRuntime {
  order: SquadOrder;
  status: "active" | "completed" | "failed";
  pathNodeIds: string[];
  pathPoints: Vec3[];
  pathIndex: number;
  searchPointIndex: number;
  lastPlannedTarget: Vec3 | null;
  noProgressSeconds: number;
  recoveryStep: 0 | 1 | 2 | 3 | 4;
  failureReason: string | null;
}

export interface AgentRuntimeState {
  readonly id: CrewId;
  position: Vec3;
  facingYaw: number;
  controlMode: AgentControlMode;
  currentOrder: AgentOrderRuntime | null;
  lastCompletedOrderType: SquadOrderType | null;
  statusLabel: string;
  lastKnownPosition: Vec3;
  communicationBand: CommunicationBand;
  communicationQuality: number;
  localInstructionAllowed: boolean;
}

export interface SquadControlState {
  readonly fieldLeadAgentId: CrewId;
  controlledAgentId: CrewId;
  switchInProgress: boolean;
}

export interface RallyObjectiveState {
  readonly id: "REESTABLISH_THE_CREW";
  readonly label: "REESTABLISH THE CREW";
  active: boolean;
  achieved: boolean;
  radius: number;
  requiredHoldSeconds: number;
  heldSeconds: number;
  progress: number;
}

export interface SquadFeedbackState {
  revision: number;
  code: string;
  message: string;
}

export interface DistributedSquadState {
  readonly insertionMode: InsertionMode;
  readonly insertionSeed: string;
  readonly insertionPlan: InsertionPlan;
  readonly agents: Record<string, AgentRuntimeState>;
  readonly control: SquadControlState;
  readonly lostContactPolicy: LostContactPolicy;
  communicationEvaluatedAtSeconds: number;
  communicationRevision: number;
  readonly knowledge: KnowledgeState;
  readonly signals: SignalBeaconState;
  readonly rallyObjective: RallyObjectiveState;
  readonly deployedRelayItemIds: string[];
  readonly disabledRelayItemIds: string[];
  readonly relayRestartByItemId: Record<string, {
    readonly startedByAgentId: CrewId;
    readonly startedAtSeconds: number;
  }>;
  readonly interferenceUntilByAgentId: Record<string, number>;
  readonly friendlyMachineVoiceNodes: Record<string, Vec3>;
  readonly shortcutOpenById: Record<string, boolean>;
  readonly feedback: SquadFeedbackState;
}

export type SquadCommandRejectionCode =
  | "UNKNOWN_AGENT"
  | "TARGET_INCAPACITATED"
  | "COMMUNICATION_INSUFFICIENT"
  | "NO_NAVIGATION_PATH"
  | "NO_SEARCH_ZONE"
  | "NO_ACTIVE_BEACON";

export interface SquadCommandResolution {
  readonly accepted: boolean;
  readonly code: "ORDER_ACCEPTED" | SquadCommandRejectionCode;
  readonly reason: string;
  readonly orderId: string | null;
}

export type ControlSwitchRejectionCode =
  | "UNKNOWN_AGENT"
  | "ALREADY_CONTROLLED"
  | "TARGET_INCAPACITATED"
  | "FIELD_TERMINAL_REQUIRED"
  | "TELEMETRY_REQUIRED"
  | "EXCLUSIVE_OPERATION_ACTIVE"
  | "SWITCH_IN_PROGRESS";

export interface ControlSwitchContext {
  readonly hasFieldTerminal: boolean;
  readonly communicationBand: CommunicationBand;
  readonly localSwitchAllowed: boolean;
  readonly exclusiveOperationActive: boolean;
}

export interface ControlSwitchResolution {
  readonly accepted: boolean;
  readonly code: "CONTROL_SWITCHED" | ControlSwitchRejectionCode;
  readonly reason: string;
}
