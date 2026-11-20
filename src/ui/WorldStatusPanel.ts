import type { PersistedWorldState, WorldDefinition } from "../game/world/worldTypes";
import { getActiveContract } from "../game/world/WorldState";

export class WorldStatusPanel {
  private readonly root: HTMLElement;

  constructor(mount: HTMLElement, onReset: () => void) {
    this.root = document.createElement("aside");
    this.root.className = "world-status-panel";
    this.root.dataset.diagnosticCategory = "persistent-hud";
    this.root.innerHTML = `
      <details>
        <summary>世界の記録 <strong data-world-visit>訪問 0</strong></summary>
        <div class="world-status-body" data-world-status></div>
        <button type="button" class="world-reset-button" data-world-reset>開発用: 世界状態を初期化</button>
      </details>
    `;
    this.root.querySelector<HTMLButtonElement>("[data-world-reset]")?.addEventListener("click", onReset);
    mount.append(this.root);
  }

  update(state: PersistedWorldState, definition: WorldDefinition, visible: boolean): void {
    this.root.classList.toggle("is-visible", visible);
    const visit = this.root.querySelector<HTMLElement>("[data-world-visit]");
    if (visit) visit.textContent = `訪問 ${state.visitCount}`;
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
        <div><dt>進行中の契約</dt><dd>${escapeHtml(active?.definition.label ?? "なし")} · ${progress}</dd></div>
        <div><dt>友好的な機械</dt><dd>${relation.length}</dd></div>
        <div><dt>開いた経路</dt><dd>${opened.length}</dd></div>
        <div><dt>置いてきた装備</dt><dd>${state.leftBehindEquipment.length}</dd></div>
        <div><dt>手がかり</dt><dd>${evidence.length}</dd></div>
        <div><dt>船内の資料</dt><dd>${escapeHtml(documents || "なし")}</dd></div>
        <div><dt>前回の結果</dt><dd>${state.lastOutcome ? (OUTCOME_LABELS[state.lastOutcome] ?? state.lastOutcome) : "なし"}</dd></div>
        <div><dt>警備の態勢</dt><dd>${POSTURE_LABELS[state.securityState.posture] ?? state.securityState.posture} · 接触 ${state.securityState.confirmedContactVisitCount} 回</dd></div>
      </dl>
    `;
  }

  dispose(): void {
    this.root.remove();
  }
}

const OUTCOME_LABELS: Record<string, string> = { complete: "回収完了", partial: "一部回収", aborted: "撤収" };
const POSTURE_LABELS: Record<string, string> = { routine: "通常", watchful: "警戒" };

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character,
  );
}
