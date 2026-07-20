import type { Vec3 } from "../core/types";
import type { CrewId } from "../squad/squadTypes";

export type DiscoveryKind = "resource" | "evidence";

export interface KnowledgeEntry {
  readonly id: string;
  readonly kind: DiscoveryKind;
  readonly label: string;
  readonly sourceId: string;
  readonly position: Vec3;
  readonly discoveredByAgentId: CrewId;
  readonly discoveredAtSeconds: number;
}

export interface AgentReport {
  readonly id: string;
  readonly entryId: string;
  readonly senderAgentId: CrewId;
  readonly createdAtSeconds: number;
}

export interface AgentKnowledge {
  readonly entries: Record<string, KnowledgeEntry>;
  readonly pendingReports: Record<string, AgentReport>;
}

export interface SquadKnowledge {
  readonly entries: Record<string, KnowledgeEntry>;
  readonly receivedReportIds: Record<string, true>;
}

export interface KnowledgeState {
  readonly byAgent: Record<string, AgentKnowledge>;
  readonly squad: SquadKnowledge;
  receivedReportRevision: number;
  lastReceivedReport: AgentReport | null;
}
