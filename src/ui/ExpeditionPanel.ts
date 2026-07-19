import type { ItemDefinition, ItemInstance } from "../game/items/itemDefinitions";
import type { ExpeditionDraft, ExpeditionManifest } from "../game/mission/expeditionTypes";
import type { ExpeditionGateEvaluation } from "../game/mission/gateEvaluator";
import type { CrewDefinition, CrewId } from "../game/squad/squadTypes";

export interface ExpeditionPanelCallbacks {
  onClose(): void;
  onAgentSelection(agentId: CrewId, selected: boolean): void;
  onFieldLead(agentId: CrewId): void;
  onAssignItem(itemInstanceId: string, agentId: CrewId): void;
  onReturnItem(itemInstanceId: string): void;
  onConfirm(): void;
}

export interface ExpeditionPanelCatalog {
  agents: readonly CrewDefinition[];
  itemDefinitions: Readonly<Record<string, ItemDefinition>>;
  shipInventory: readonly ItemInstance[];
}

export class ExpeditionPanel {
  private readonly overlay = document.createElement("section");
  private readonly panel = document.createElement("div");

  constructor(
    mount: HTMLElement,
    private readonly catalog: ExpeditionPanelCatalog,
    private readonly callbacks: ExpeditionPanelCallbacks,
  ) {
    this.overlay.className = "expedition-overlay";
    this.overlay.setAttribute("aria-hidden", "true");
    this.panel.className = "expedition-panel";
    this.overlay.append(this.panel);
    mount.append(this.overlay);
  }

  showDraft(draft: ExpeditionDraft, evaluation: ExpeditionGateEvaluation): void {
    this.overlay.classList.add("is-visible");
    this.overlay.setAttribute("aria-hidden", "false");
    const selected = new Set(draft.selectedAgentIds);
    const leadId = draft.fieldLeadIds.length === 1 ? draft.fieldLeadIds[0] : null;
    const assignedItems = new Set(draft.itemInstanceIds);
    const instanceById = new Map(this.catalog.shipInventory.map((instance) => [instance.id, instance]));

    const crewMarkup = this.catalog.agents
      .map((agent) => {
        const isSelected = selected.has(agent.id);
        return `
          <article class="crew-card ${isSelected ? "is-selected" : ""}">
            <div>
              <span class="crew-callsign">${escapeHtml(agent.callsign)}</span>
              <strong>${escapeHtml(agent.role)}</strong>
              <small>${agent.gateCapacityUnits}U · ${agent.strengths.map(escapeHtml).join(" / ")}</small>
            </div>
            <label class="crew-toggle">
              <span>遠征参加</span>
              <input type="checkbox" data-agent-toggle="${agent.id}" ${isSelected ? "checked" : ""} />
            </label>
            <label class="lead-toggle">
              <input type="radio" name="field-lead" data-field-lead="${agent.id}"
                ${leadId === agent.id ? "checked" : ""} ${isSelected ? "" : "disabled"} />
              <span>FIELD LEAD</span>
            </label>
          </article>
        `;
      })
      .join("");

    const loadoutMarkup = this.catalog.agents
      .filter((agent) => selected.has(agent.id))
      .map((agent) => {
        const itemIds = draft.assignments
          .filter((assignment) => assignment.agentId === agent.id)
          .map((assignment) => assignment.itemInstanceId);
        const itemsMarkup =
          itemIds.length > 0
            ? itemIds
                .map((itemId) => {
                  const instance = instanceById.get(itemId);
                  const definition = instance ? this.catalog.itemDefinitions[instance.definitionId] : null;
                  return `
                    <li>
                      <span>${escapeHtml(definition?.label ?? itemId)}<small>${escapeHtml(itemId)}</small></span>
                      <button type="button" data-return-item="${escapeHtml(itemId)}">返却</button>
                    </li>
                  `;
                })
                .join("")
            : `<li class="empty-loadout">装備なし</li>`;
        return `
          <article class="loadout-column">
            <header><strong>${escapeHtml(agent.callsign)}</strong><span>${leadId === agent.id ? "LEAD" : "CREW"}</span></header>
            <ul>${itemsMarkup}</ul>
          </article>
        `;
      })
      .join("");

    const inventoryMarkup = this.catalog.shipInventory
      .filter((instance) => !assignedItems.has(instance.id))
      .map((instance) => {
        const definition = this.catalog.itemDefinitions[instance.definitionId];
        if (!definition) return "";
        const assignmentButtons = this.catalog.agents
          .filter((agent) => selected.has(agent.id))
          .map(
            (agent) =>
              `<button type="button" data-assign-item="${instance.id}" data-assign-agent="${agent.id}">${escapeHtml(agent.callsign)}へ</button>`,
          )
          .join("");
        return `
          <article class="inventory-item">
            <div>
              <strong>${escapeHtml(definition.label)}</strong>
              <small>${definition.capacityUnits}U · VOL ${definition.volumeLoad}/${4} · LOG ${definition.logicLoad}/${3}</small>
              <span>${escapeHtml(instance.id)} · ${conditionLabel(instance.condition)}</span>
            </div>
            <div class="assignment-actions">${assignmentButtons || "<em>隊員を選択してください</em>"}</div>
          </article>
        `;
      })
      .join("");

    const configurationMarkup = violationList(evaluation.configurationViolations, "編成条件");
    const objectMarkup = violationList(evaluation.objectLimitViolations, "物体単体の拒絶");
    const capacityMarkup = evaluation.totalCapacityViolation
      ? `<div class="validation-block is-error"><strong>総容量超過</strong><p>${escapeHtml(evaluation.totalCapacityViolation.message)}</p></div>`
      : `<div class="validation-block is-clear"><strong>総容量</strong><p>上限以内です</p></div>`;
    const fillPercent = Math.min((evaluation.capacity.usedUnits / evaluation.capacity.limitUnits) * 100, 100);

    this.panel.innerHTML = `
      <div class="expedition-frame" role="dialog" aria-modal="true" aria-labelledby="expedition-title">
        <header class="expedition-header">
          <div><span class="panel-kicker">HAB-03 / GATE LOAD CONTROL</span><h2 id="expedition-title">遠征編成コンソール</h2></div>
          <button type="button" class="icon-close" data-expedition-close aria-label="編成画面を閉じる">×</button>
        </header>
        <div class="capacity-readout ${evaluation.totalCapacityViolation ? "is-over" : ""}">
          <div><span>TRANSFER LOAD</span><strong>${evaluation.capacity.usedUnits} / ${evaluation.capacity.limitUnits}U</strong></div>
          <div class="capacity-track" aria-hidden="true"><i style="width:${fillPercent}%"></i></div>
          <small>隊員 ${evaluation.capacity.crewUnits}U + 装備 ${evaluation.capacity.itemUnits}U</small>
        </div>
        <div class="expedition-grid">
          <section class="expedition-section crew-section"><header><span>01</span><h3>遠征隊員 / 1–3名</h3></header>${crewMarkup}</section>
          <section class="expedition-section loadout-section"><header><span>02</span><h3>ロードアウト</h3></header><div class="loadout-grid">${loadoutMarkup || "<p class=empty-state>隊員未選択</p>"}</div></section>
          <section class="expedition-section inventory-section"><header><span>03</span><h3>船内在庫</h3></header><div class="inventory-list">${inventoryMarkup || "<p class=empty-state>利用可能な装備なし</p>"}</div></section>
        </div>
        <footer class="expedition-footer">
          <div class="validation-summary">${capacityMarkup}${objectMarkup}${configurationMarkup}</div>
          <div class="confirm-zone">
            <span>${evaluation.accepted ? "GATE CONTRACT // READY" : `${evaluation.violations.length} VIOLATION(S)`}</span>
            <button type="button" class="confirm-expedition" data-confirm-expedition ${evaluation.accepted ? "" : "disabled"}>出撃マニフェストを確定</button>
          </div>
        </footer>
      </div>
    `;
    this.bindDraftEvents();

  }

  showManifest(manifest: ExpeditionManifest): void {
    this.overlay.classList.add("is-visible");
    this.overlay.setAttribute("aria-hidden", "false");
    const agentById = new Map(this.catalog.agents.map((agent) => [agent.id, agent]));
    const instanceById = new Map(this.catalog.shipInventory.map((instance) => [instance.id, instance]));
    const loadoutMarkup = manifest.loadouts
      .map((loadout) => {
        const agent = agentById.get(loadout.agentId);
        const items = loadout.itemInstanceIds
          .map((itemId) => {
            const instance = instanceById.get(itemId);
            const definition = instance ? this.catalog.itemDefinitions[instance.definitionId] : null;
            return `<li>${escapeHtml(definition?.label ?? itemId)} <small>${escapeHtml(itemId)}</small></li>`;
          })
          .join("");
        return `
          <article class="manifest-loadout">
            <header><strong>${escapeHtml(agent?.callsign ?? loadout.agentId)}</strong><span>${loadout.agentId === manifest.fieldLeadId ? "FIELD LEAD" : "CREW"}</span></header>
            <ul>${items || "<li>装備なし</li>"}</ul>
          </article>
        `;
      })
      .join("");

    this.panel.innerHTML = `
      <div class="manifest-frame" role="dialog" aria-modal="true" aria-labelledby="manifest-title">
        <header class="expedition-header">
          <div><span class="panel-kicker">DEVELOPMENT HANDOFF / PHASE C NOT LOADED</span><h2 id="manifest-title">ExpeditionManifest 確定</h2></div>
          <button type="button" class="icon-close" data-expedition-close aria-label="サマリーを閉じる">×</button>
        </header>
        <div class="manifest-stamp">GATE AUTHORIZED</div>
        <dl class="manifest-meta">
          <div><dt>MANIFEST ID</dt><dd>${escapeHtml(manifest.manifestId)}</dd></div>
          <div><dt>CREATED</dt><dd>${escapeHtml(manifest.createdAtIso)}</dd></div>
          <div><dt>TRANSFER LOAD</dt><dd>${manifest.totalCapacityUnits} / ${manifest.capacityLimitUnits}U</dd></div>
          <div><dt>SOURCE REVISION</dt><dd>${manifest.sourceDraftRevision}</dd></div>
        </dl>
        <section class="manifest-loadouts"><h3>確定ロードアウト</h3><div>${loadoutMarkup}</div></section>
        <p class="manifest-note">探索マップへの遷移はフェーズCの範囲です。この画面では不変マニフェストの内容だけを表示しています。</p>
        <button type="button" class="resume-button" data-expedition-close>船内へ戻る</button>
      </div>
    `;
    this.bindCloseEvents();
  }

  hide(): void {
    this.overlay.classList.remove("is-visible");
    this.overlay.setAttribute("aria-hidden", "true");
  }

  private bindDraftEvents(): void {
    this.bindCloseEvents();
    this.panel.querySelectorAll<HTMLInputElement>("[data-agent-toggle]").forEach((input) => {
      input.addEventListener("change", () => {
        this.callbacks.onAgentSelection(input.dataset.agentToggle as CrewId, input.checked);
      });
    });
    this.panel.querySelectorAll<HTMLInputElement>("[data-field-lead]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) this.callbacks.onFieldLead(input.dataset.fieldLead as CrewId);
      });
    });
    this.panel.querySelectorAll<HTMLButtonElement>("[data-assign-item]").forEach((button) => {
      bindButtonActivation(button, () => {
        const itemId = button.dataset.assignItem;
        const agentId = button.dataset.assignAgent as CrewId | undefined;
        if (itemId && agentId) this.callbacks.onAssignItem(itemId, agentId);
      });
    });
    this.panel.querySelectorAll<HTMLButtonElement>("[data-return-item]").forEach((button) => {
      bindButtonActivation(button, () => {
        const itemId = button.dataset.returnItem;
        if (itemId) this.callbacks.onReturnItem(itemId);
      });
    });
    const confirmButton = this.panel.querySelector<HTMLButtonElement>("[data-confirm-expedition]");
    if (confirmButton) bindButtonActivation(confirmButton, this.callbacks.onConfirm);
  }

  private bindCloseEvents(): void {
    this.panel.querySelectorAll<HTMLButtonElement>("[data-expedition-close]").forEach((button) => {
      bindButtonActivation(button, this.callbacks.onClose);
    });
  }
}

function bindButtonActivation(button: HTMLButtonElement, activate: () => void): void {
  button.addEventListener("click", activate);
  button.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  });
}

function violationList(
  violations: ExpeditionGateEvaluation["violations"],
  title: string,
): string {
  if (violations.length === 0) {
    return `<div class="validation-block is-clear"><strong>${escapeHtml(title)}</strong><p>違反なし</p></div>`;
  }
  return `
    <div class="validation-block is-error">
      <strong>${escapeHtml(title)}</strong>
      <ul>${violations.map((violation) => `<li><code>${violation.code}</code>${escapeHtml(violation.message)}</li>`).join("")}</ul>
    </div>
  `;
}

function conditionLabel(condition: ItemInstance["condition"]): string {
  if (condition === "serviceable") return "良好";
  if (condition === "worn") return "使用感あり";
  return "損傷";
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character,
  );
}
