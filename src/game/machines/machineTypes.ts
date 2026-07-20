import type { Vec3 } from "../core/types";

export type MachineFaction = "hostile" | "neutral" | "friendly";

export type HostileDroneMode =
  | "dormant"
  | "patrol"
  | "investigate"
  | "stalk"
  | "lock-on"
  | "interdict"
  | "sabotage-relay"
  | "observe"
  | "disengage"
  | "return-to-route"
  | "disabled";

export type PorterAndroidMode =
  | "dormant"
  | "handshake"
  | "friendly-idle"
  | "following"
  | "holding"
  | "moving-to-item"
  | "carrying"
  | "moving-to-destination"
  | "placing-item"
  | "path-failed"
  | "gate-rejected";

export type MachineAgentMode = HostileDroneMode | PorterAndroidMode;

export interface MachinePerceptionState {
  evaluatedAtSeconds: number;
  visibleEntityIds: string[];
  lastStimulusId: string | null;
  lastStimulusPosition: Vec3 | null;
}

export interface MachineAgentState<TMode extends MachineAgentMode = MachineAgentMode> {
  readonly id: string;
  readonly definitionId: string;
  faction: MachineFaction;
  mode: TMode;
  position: Vec3;
  facing: number;
  targetEntityId: string | null;
  path: Vec3[];
  pathIndex: number;
  cooldowns: Record<string, number>;
  perception: MachinePerceptionState;
}

export interface MachineStimulus {
  readonly id: string;
  readonly kind: "flare" | "relay" | "agent";
  readonly position: Vec3;
  readonly active: boolean;
}

export interface AlliedMachineOutcome {
  readonly machineId: string;
  readonly disposition: "friendly-left-behind";
  readonly assistedItemIds: readonly string[];
}

export interface MachineGateTraits {
  readonly transitCostU: number;
  readonly volumeIndex: number;
  readonly logicIndex: number;
}

export interface PorterAndroidDefinition {
  readonly id: string;
  readonly definitionId: string;
  readonly label: string;
  readonly spawn: Vec3;
  readonly moveSpeed: number;
  readonly interactionRange: number;
  readonly authenticationSeconds: number;
  readonly voiceRange: number;
  readonly presenceWeight: number;
  readonly gateTraits: MachineGateTraits;
}

export interface PorterAndroidState extends MachineAgentState<PorterAndroidMode> {
  authenticated: boolean;
  handshakeStartedAtSeconds: number | null;
  command: "none" | "follow" | "hold" | "carry-to";
  carriedItemId: string | null;
  destination: Vec3 | null;
  assistedItemIds: string[];
  failureReport: string | null;
  gateEvaluationCodes: string[];
}
