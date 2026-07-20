import type { PersistedWorldStateV1, WorldDefinition } from "../game/world/worldTypes";
import { getActiveContract } from "../game/world/WorldState";

export class WorldStatusPanel {
  private readonly root: HTMLElement;

  constructor(mount: HTMLElement, onReset: () => void) {
    this.root = document.createElement("aside");
    this.root.className = "world-status-panel";
    this.root.dataset.diagnosticCategory = "persistent-hud";
    this.root.innerHTML = `
      <details>
        <summary>WORLD MEMORY <strong data-world-visit>VISIT 0</strong></summary>
        <div class="world-status-body" data-world-status></div>
        <button type="button" class="world-reset-button" data-world-reset>開発用: 世界状態を初期化</button>
      </details>
    `;
    this.root.querySelector<HTMLButtonElement>("[data-world-reset]")?.addEventListener("click", onReset);
    mount.append(this.root);
  }

  update(state: PersistedWorldStateV1, definition: WorldDefinition, visible: boolean): void {
    this.root.classList.toggle("is-visible", visible);
    const visit = this.root.querySelector<HTMLElement>("[data-world-visit]");
    if (visit) visit.textContent = `VISIT ${state.visitCount}`;
    const body = this.root.querySelector<HTMLElement>("[data-world-status]");
    if (!body) return;
    const active = getActiveContract(state, definition);
    const relation = state.machineRelations.filter((entry) => entry.relation === "friendly");
    const opened = state.traversalStates.filter((entry) => entry.state === "opened");
    const evidence = state.evidenceStates.filter((entry) => entry.discovered);
    const documents = evidence
      .map((entry) => definition.evidence.find((candidate) => candidate.id === entry.entityId)?.label ?? entry.entityId)
      .join(" / ");
    const progress = active
      ? `${active.progress.recoveredObjectiveIds.length} / ${active.definition.objectiveIds.length}`
      : "全契約完了";
    body.innerHTML = `
      <dl>
        <div><dt>ACTIVE CONTRACT</dt><dd>${escapeHtml(active?.definition.label ?? "なし")} · ${progress}</dd></div>
        <div><dt>FRIENDLY CONTACTS</dt><dd>${relation.length}</dd></div>
        <div><dt>OPEN ROUTES</dt><dd>${opened.length}</dd></div>
        <div><dt>LEFT EQUIPMENT</dt><dd>${state.leftBehindEquipment.length}</dd></div>
        <div><dt>EVIDENCE</dt><dd>${evidence.length}</dd></div>
        <div><dt>SHIP DOCUMENTS</dt><dd>${escapeHtml(documents || "NONE")}</dd></div>
        <div><dt>LAST OUTCOME</dt><dd>${state.lastOutcome?.toUpperCase() ?? "NONE"}</dd></div>
      </dl>
    `;
  }

  dispose(): void {
    this.root.remove();
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character,
  );
}
