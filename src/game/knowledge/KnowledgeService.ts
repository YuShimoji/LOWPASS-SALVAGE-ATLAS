import type { CrewId } from "../squad/squadTypes";
import type { AgentReport, KnowledgeEntry, KnowledgeState } from "./knowledgeTypes";

export class KnowledgeService {
  readonly state: KnowledgeState;

  constructor(agentIds: readonly CrewId[]) {
    this.state = {
      byAgent: Object.fromEntries(agentIds.map((agentId) => [agentId, { entries: {}, pendingReports: {} }])),
      squad: { entries: {}, receivedReportIds: {} },
      receivedReportRevision: 0,
      lastReceivedReport: null,
    };
  }

  discover(entry: KnowledgeEntry, canShare: boolean): AgentReport {
    const knowledge = this.state.byAgent[entry.discoveredByAgentId];
    if (!knowledge) throw new Error(`Unknown knowledge owner: ${entry.discoveredByAgentId}`);
    knowledge.entries[entry.id] ??= cloneEntry(entry);
    const report: AgentReport = Object.freeze({
      id: `report:${entry.id}:${entry.discoveredByAgentId}`,
      entryId: entry.id,
      senderAgentId: entry.discoveredByAgentId,
      createdAtSeconds: entry.discoveredAtSeconds,
    });
    if (canShare) this.shareReport(report);
    else knowledge.pendingReports[report.id] ??= report;
    return report;
  }

  flushPending(agentId: CrewId, canShare: boolean): readonly AgentReport[] {
    if (!canShare) return [];
    const knowledge = this.state.byAgent[agentId];
    if (!knowledge) return [];
    const reports = Object.values(knowledge.pendingReports).sort((left, right) => left.id.localeCompare(right.id));
    for (const report of reports) {
      this.shareReport(report);
      delete knowledge.pendingReports[report.id];
    }
    return reports;
  }

  private shareReport(report: AgentReport): void {
    if (this.state.squad.receivedReportIds[report.id]) return;
    const knowledge = this.state.byAgent[report.senderAgentId];
    const entry = knowledge?.entries[report.entryId];
    if (!entry) throw new Error(`Report ${report.id} has no local knowledge entry`);
    this.state.squad.entries[entry.id] = cloneEntry(entry);
    this.state.squad.receivedReportIds[report.id] = true;
    this.state.receivedReportRevision += 1;
    this.state.lastReceivedReport = report;
  }
}

function cloneEntry(entry: KnowledgeEntry): KnowledgeEntry {
  return { ...entry, position: { ...entry.position } };
}
