import type { Vec3 } from "../core/types";

export type CommunicationNodeKind =
  | "agent-radio"
  | "field-terminal"
  | "portable-relay"
  | "extraction-beacon";

export type CommunicationBand = "none" | "burst" | "voice" | "telemetry";

export interface CommunicationNode {
  readonly id: string;
  readonly kind: CommunicationNodeKind;
  readonly position: Vec3;
  readonly agentId: string | null;
  readonly enabled: boolean;
}

export interface SignalZoneDefinition {
  readonly id: string;
  readonly label: string;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
  readonly attenuation: number;
}

export interface CommunicationLink {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly quality: number;
  readonly band: CommunicationBand;
  readonly routeNodeIds: readonly string[];
  readonly localInstructionAllowed: boolean;
}

export interface AgentCommunicationStatus {
  readonly agentId: string;
  readonly quality: number;
  readonly band: CommunicationBand;
  readonly routeNodeIds: readonly string[];
  readonly localInstructionAllowed: boolean;
}
