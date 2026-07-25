import type { FixedMissionDefinition } from "../game/mission/fixedMissionTypes";
import type { CrewId, DistributedSquadState, SquadOrderType } from "../game/squad/squadTypes";
import type { ThreatEncounterState } from "../game/threat/threatTypes";
import type { PorterAndroidState } from "../game/machines/machineTypes";

export interface SquadPanelViewModel {
  readonly state: DistributedSquadState;
  readonly definition: FixedMissionDefinition;
  readonly hasFieldTerminal: boolean;
  readonly availableFlareCount: number;
  readonly threat: ThreatEncounterState;
  readonly elapsedSeconds: number;
  readonly porter: PorterAndroidState;
}

export interface SquadPanelCallbacks {
  onOrder(agentId: CrewId, type: SquadOrderType, targetZoneId: string | null): void;
  onSwitchControl(agentId: CrewId): void;
  onDeployRelay(): void;
  onRecoverRelay(): void;
  onDeployFlare(): void;
}

export class SquadPanel {
  private readonly root = document.createElement("aside");
  private readonly summary = document.createElement("button");
  private readonly details = document.createElement("div");
  private expanded = false;
  private lastRevisionKey = "";
  private readonly selectedZoneByAgent = new Map<CrewId, string>();

  constructor(mount: HTMLElement, private readonly callbacks: SquadPanelCallbacks) {
    this.root.className = "squad-panel";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "分隊通信パネル");
    this.summary.type = "button";
    this.summary.className = "squad-summary-button";
    this.summary.setAttribute("aria-expanded", "false");
    this.summary.addEventListener("click", () => {
      this.expanded = !this.expanded;
      this.summary.setAttribute("aria-expanded", String(this.expanded));
      this.root.classList.toggle("is-expanded", this.expanded);
      this.details.hidden = !this.expanded;
    });
    this.details.className = "squad-details";
    this.details.hidden = true;
    this.root.append(this.summary, this.details);
    mount.append(this.root);
  }

  update(view: SquadPanelViewModel | null): void {
    this.root.hidden = view === null;
    if (!view) {
      this.expanded = false;
      this.lastRevisionKey = "";
      this.selectedZoneByAgent.clear();
      this.root.classList.remove("has-threat", "is-expanded");
      this.summary.setAttribute("aria-expanded", "false");
      this.summary.replaceChildren();
      this.details.hidden = true;
      this.details.replaceChildren();
      return;
    }
    const { state } = view;
    const agents = Object.values(state.agents);
    const controlled = state.agents[state.control.controlledAgentId];
    const connectedCount = agents.filter((agent) => agent.communicationBand !== "none").length;
    const rally = state.rallyObjective;
    const threatKnowledge = controlled ? view.threat.byAgent[controlled.id] : null;
    const threatContact = threatKnowledge?.contact ?? null;
    const lockOnControlled = view.threat.drone.mode === "lock-on" && view.threat.drone.targetAgentId === controlled?.id;
    const interferenceRemaining = Math.max(0, (state.interferenceUntilByAgentId[controlled?.id ?? ""] ?? 0) - view.elapsedSeconds);
    this.root.classList.toggle("has-threat", Boolean(threatContact));
    this.summary.innerHTML = `
      <span class="squad-summary-kicker">SQUAD / ${connectedCount} LINKED</span>
      <strong>${escapeHtml(controlled?.id.toUpperCase() ?? "UNKNOWN")}</strong>
      <span>${lockOnControlled ? `△ LOCK-ON ${Math.round(view.threat.drone.lockOnProgress * 100)}%` : interferenceRemaining > 0 ? `◇ INTERFERENCE ${interferenceRemaining.toFixed(1)}s` : threatContact ? `CONTACT ${threatContact.freshness.toUpperCase()}` : rally.achieved ? "CREW LINKED" : rally.active ? `RALLY ${Math.round(rally.progress * 100)}%` : "STABLE"}</span>
    `;

    const revisionKey = [
      state.communicationRevision,
      state.feedback.revision,
      state.knowledge.receivedReportRevision,
      state.signals.revision,
      view.threat.reportRevision,
      view.threat.deliveryRevision,
      view.threat.drone.transitionRevision,
      threatContact?.observedAtSeconds ?? "none",
      threatContact?.freshness ?? "unknown",
      view.hasFieldTerminal,
      view.availableFlareCount,
      view.porter.mode,
      view.porter.carriedItemId ?? "none",
      interferenceRemaining.toFixed(1),
      agents.map((agent) => `${agent.id}:${agent.currentOrder?.order.type ?? "none"}:${agent.statusLabel}`).join("|"),
    ].join(":");
    if (revisionKey === this.lastRevisionKey) return;
    this.lastRevisionKey = revisionKey;

    const agentRows = agents.map((agent) => {
      const isControlled = agent.id === state.control.controlledAgentId;
      const isLead = agent.id === state.control.fieldLeadAgentId;
      const pending = Object.keys(state.knowledge.byAgent[agent.id]?.pendingReports ?? {}).length;
      const detailedStatus = view.hasFieldTerminal
        ? `Q ${Math.round(agent.communicationQuality * 100)}% · POS ${agent.lastKnownPosition.x.toFixed(1)}, ${agent.lastKnownPosition.z.toFixed(1)}`
        : "詳細telemetryは端末装備時のみ";
      const selectedZoneId = this.selectedZoneByAgent.get(agent.id as CrewId)
        ?? view.definition.searchZones[0]?.id
        ?? "";
      const zoneOptions = view.definition.searchZones
        .map((zone) => `<option value="${escapeHtml(zone.id)}" ${zone.id === selectedZoneId ? "selected" : ""}>${escapeHtml(zone.label)}</option>`)
        .join("");
      return `
        <article class="squad-agent ${isControlled ? "is-controlled" : ""}">
          <header><strong>${escapeHtml(agent.id.toUpperCase())}</strong><span>${isLead ? "LEAD" : "CREW"} · ${agent.controlMode}</span></header>
          <p><b>${bandIcon(agent.communicationBand)} ${agent.communicationBand.toUpperCase()}</b> · ${escapeHtml(agent.statusLabel)}</p>
          <small>${escapeHtml(detailedStatus)} · PENDING ${pending}</small>
          ${isControlled ? "" : `
            <label>命令区域<select data-zone-for="${agent.id}">${zoneOptions}</select></label>
            <div class="squad-command-grid">
              <button type="button" data-order="follow" data-agent="${agent.id}">FOLLOW</button>
              <button type="button" data-order="hold" data-agent="${agent.id}">HOLD</button>
              <button type="button" data-order="move-to" data-agent="${agent.id}">MOVE TO</button>
              <button type="button" data-order="search-zone" data-agent="${agent.id}">SEARCH</button>
              <button type="button" data-order="rally" data-agent="${agent.id}">RALLY</button>
              <button type="button" data-switch-agent="${agent.id}">CONTROL</button>
            </div>
          `}
        </article>
      `;
    }).join("");
    const receivedReports = Object.values(state.knowledge.squad.entries);
    const latestReport = receivedReports.sort((left, right) => right.discoveredAtSeconds - left.discoveredAtSeconds)[0];
    const beacon = Object.values(state.signals.beacons)[0];
    const threatReport = threatContact
      ? `<strong>SCOUT DRONE // ${threatContact.freshness.toUpperCase()}</strong>
        <small>HOLDER ${escapeHtml(controlled?.id.toUpperCase() ?? "UNKNOWN")} · SOURCE ${escapeHtml(threatContact.observedByAgentId.toUpperCase())} · VIA ${escapeHtml(threatContact.route.toUpperCase())}</small>
        <small>LAST ${threatContact.position.x.toFixed(1)}, ${threatContact.position.z.toFixed(1)} · AGE ${Math.max(0, view.elapsedSeconds - threatContact.observedAtSeconds).toFixed(1)}s · OUTBOX ${Object.keys(threatKnowledge?.pendingReports ?? {}).length}</small>`
      : `<strong>NO LOCAL THREAT REPORT</strong><small>操作中隊員には接触情報がありません</small>`;
    this.details.innerHTML = `
      <header class="squad-panel-header"><span>FIELD TERMINAL</span><strong>${view.hasFieldTerminal ? "ONLINE" : "LIMITED"}</strong></header>
      <div class="squad-agent-list">${agentRows}</div>
      <section class="squad-report-strip threat-report-strip"><span>THREAT / LOCAL KNOWLEDGE</span>${threatReport}</section>
      <section class="squad-report-strip">
        <span>REPORT</span><strong>${escapeHtml(latestReport?.label ?? "NO SHARED REPORT")}</strong>
        <small>${beacon ? `FLARE ACTIVE · ${beacon.recognizedByAgentIds.length}/${agents.length} DETECTED` : `FLARES ${view.availableFlareCount}`}</small>
      </section>
      <section class="squad-report-strip machine-report-strip">
        <span>FRIENDLY MACHINE</span>
        <strong>▰ PORTER // ${escapeHtml(view.porter.mode.toUpperCase())}</strong>
        <small>${view.porter.authenticated ? `VOICE NODE · COMMAND ${escapeHtml(view.porter.command.toUpperCase())} · CARRY ${escapeHtml(view.porter.carriedItemId ?? "NONE")}` : "FIELD TERMINAL AUTH REQUIRED"}</small>
      </section>
      <div class="squad-equipment-actions">
        <button type="button" data-deploy-relay>RELAY DEPLOY</button>
        <button type="button" data-recover-relay>RELAY RECOVER</button>
        <button type="button" data-deploy-flare ${view.availableFlareCount > 0 ? "" : "disabled"}>FLARE</button>
      </div>
      <p class="squad-feedback"><code>${escapeHtml(state.feedback.code)}</code>${escapeHtml(state.feedback.message)}</p>
    `;
    this.bindDetailsEvents();
  }

  dispose(): void {
    this.root.remove();
  }

  private bindDetailsEvents(): void {
    this.details.querySelectorAll<HTMLSelectElement>("[data-zone-for]").forEach((select) => {
      select.addEventListener("change", () => {
        const agentId = select.dataset.zoneFor as CrewId | undefined;
        if (agentId) this.selectedZoneByAgent.set(agentId, select.value);
      });
    });
    this.details.querySelectorAll<HTMLButtonElement>("[data-order]").forEach((button) => {
      button.addEventListener("click", () => {
        const agentId = button.dataset.agent as CrewId | undefined;
        const type = button.dataset.order as SquadOrderType | undefined;
        if (!agentId || !type) return;
        const zone = this.details.querySelector<HTMLSelectElement>(`[data-zone-for="${agentId}"]`)?.value ?? null;
        this.callbacks.onOrder(agentId, type, zone);
      });
    });
    this.details.querySelectorAll<HTMLButtonElement>("[data-switch-agent]").forEach((button) => {
      button.addEventListener("click", () => {
        const agentId = button.dataset.switchAgent as CrewId | undefined;
        if (agentId) this.callbacks.onSwitchControl(agentId);
      });
    });
    this.details.querySelector<HTMLButtonElement>("[data-deploy-relay]")?.addEventListener("click", this.callbacks.onDeployRelay);
    this.details.querySelector<HTMLButtonElement>("[data-recover-relay]")?.addEventListener("click", this.callbacks.onRecoverRelay);
    this.details.querySelector<HTMLButtonElement>("[data-deploy-flare]")?.addEventListener("click", this.callbacks.onDeployFlare);
  }
}

function bandIcon(band: string): string {
  if (band === "telemetry") return "▰";
  if (band === "voice") return "◉";
  if (band === "burst") return "◇";
  return "×";
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character,
  );
}
