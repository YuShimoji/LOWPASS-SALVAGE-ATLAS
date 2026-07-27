import {
  SEMANTIC_CUE_INVENTORY,
  type SemanticAudioState,
  type SemanticCueId,
} from "../render/audio/SemanticCueCatalog";
import {
  summarizeGuidedQaReadback,
  type GuidedAuditReport,
  type GuidedQaActionId,
  type GuidedQaReadback,
  type GuidedQaResult,
} from "../qa/GuidedPhaseGAudit";

export interface GuidedQaActionDefinition {
  readonly category: "Setup" | "Contact sequence" | "Relay" | "Flare" | "Audit";
  readonly action: GuidedQaActionId | "run-audit" | "export-readback" | "capture-evidence";
  readonly label: string;
  readonly description: string;
  readonly expectedChange: string;
}

export const GUIDED_QA_ACTIONS: readonly GuidedQaActionDefinition[] = [
  qa("Setup", "apply-loadout", "Apply 28U QA loadout", "固定28U編成を設定します", "編成がdeploy可能になる"),
  qa("Setup", "deploy-watchful", "Deploy watchful mission", "watchful訪問を開始します", "NeedleとWatcherがmissionへ参加する"),
  qa("Setup", "reset-phase-g", "Reset Phase G scenario", "現在のQA配置と監査表示を初期状態へ戻します", "world保存値を変更せずQA配置だけを再構成する"),
  qa("Contact sequence", "isolate-player", "1. Isolate player", "援軍を離脱させ、プレイヤーを孤立状態へ戻す", "allied presence 1.0 / predatory"),
  qa("Contact sequence", "observe-watcher", "2. Watcher detects", "Watcherの直接認識とlocal factを待機します", "Watcher local factが生成される"),
  qa("Contact sequence", "share-contact", "3. Contact is shared", "敵専用linkを有効化し共有を待機します", "shared agent factが生成される"),
  qa("Contact sequence", "needle-reacquire", "4. Needle re-acquires and locks", "Needleを直接再視認可能な位置へ誘導します", "Needle local factとlock-onが始まる"),
  qa("Contact sequence", "reinforcement-arrives", "5. Reinforcement arrives", "第2隊員を局所Presenceへ算入します", "lock解除 / cautious"),
  qa("Contact sequence", "porter-joins", "6. Porter joins", "簡易端末でPorter認証を開始します", "friendly Porter 0.75 / outnumbered"),
  qa("Contact sequence", "observe-disengage", "7. Cell disengages", "outnumbered後の共通退避を待機します", "NeedleとWatcherがdisengage"),
  qa("Relay", "deploy-relay", "Deploy relay", "孤立した隊員位置へ携帯relayを設置します", "relay active"),
  qa("Relay", "start-relay-sabotage", "Start sabotage scenario", "敵AIが既存規則でrelayを予約・妨害できる配置にします", "sabotage task → relay disabled"),
  qa("Relay", "restart-relay", "Restart relay", "隊員の通常再起動操作を開始します", "relay active"),
  qa("Flare", "deploy-flare", "Deploy flare", "操作隊員のflareを展開します", "flare active"),
  qa("Flare", "start-flare-diversion", "Start diversion scenario", "敵知覚がflareを観測できる配置にします", "local/shared flare fact → expiry"),
  qa("Audit", "run-audit", "Run full guided audit", "22段階のPhase G因果列を連続監査します", "全step PASS / timeout 0"),
  qa("Audit", "export-readback", "Export readback", "現在状態と直近監査をJSONとして保存します", "phase-g readback download"),
  qa("Audit", "capture-evidence", "Capture evidence", "drawerを隠して同一画角の証拠取得を準備します", "QA UI hidden"),
] as const;

export interface GuidedQaPanelCallbacks {
  read(): GuidedQaReadback;
  perform(action: GuidedQaActionId): Promise<string>;
  runAudit(): Promise<GuidedAuditReport>;
  getAudioState(): SemanticAudioState;
  resumeAudio(): Promise<SemanticAudioState>;
  playAudioCue(cueId: SemanticCueId): boolean;
  getAssetMode(): "primitive" | "canary-v1";
  setAssetMode(mode: "primitive" | "canary-v1"): void;
  getAssetSummary(): string;
  onOpenChange(open: boolean): void;
}

interface LastActionReadback {
  readonly definition: GuidedQaActionDefinition;
  readonly before: GuidedQaReadback;
  readonly after: GuidedQaReadback;
  readonly result: GuidedQaResult;
  readonly message: string;
}

export class GuidedQaPanel {
  private readonly root = document.createElement("aside");
  private readonly drawer = document.createElement("section");
  private readonly stateOutput = document.createElement("pre");
  private readonly actionOutput = document.createElement("section");
  private readonly auditOutput = document.createElement("section");
  private readonly audioState = document.createElement("strong");
  private readonly assetSummary = document.createElement("small");
  private open = false;
  private currentAudit: GuidedAuditReport | null = null;
  private lastAction: LastActionReadback | null = null;

  constructor(
    mount: HTMLElement,
    private readonly callbacks: GuidedQaPanelCallbacks,
    rawControls: readonly { readonly id: string; readonly label: string; readonly run: () => void }[],
  ) {
    this.root.className = "guided-qa";
    this.root.setAttribute("aria-label", "Guided Phase G QA");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "guided-qa-toggle";
    toggle.textContent = "GUIDED QA";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => this.setOpen(!this.open));
    this.root.append(toggle);

    this.drawer.className = "guided-qa-drawer";
    this.drawer.hidden = true;
    this.drawer.innerHTML = `
      <header>
        <div><span>PHASE G</span><h2>Guided QA</h2></div>
        <button type="button" data-close aria-label="Guided QAを閉じる">×</button>
      </header>
      <p class="guided-qa-intro">意味・順序・期待結果を確認しながら既存simulationを監査します。QA操作中はworld入力を停止します。</p>
    `;
    this.drawer.querySelector<HTMLButtonElement>("[data-close]")?.addEventListener("click", () => this.setOpen(false));

    const status = document.createElement("section");
    status.className = "guided-qa-status";
    status.innerHTML = "<h3>Current readback</h3>";
    this.stateOutput.className = "guided-qa-state";
    status.append(this.stateOutput);
    this.drawer.append(status);

    for (const category of ["Setup", "Contact sequence", "Relay", "Flare", "Audit"] as const) {
      const section = document.createElement("section");
      section.className = "guided-qa-category";
      section.innerHTML = `<h3>${category}</h3>`;
      for (const definition of GUIDED_QA_ACTIONS.filter((entry) => entry.category === category)) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.guidedAction = definition.action;
        button.innerHTML = `<strong>${definition.label}</strong><small>${definition.description}</small>`;
        button.addEventListener("click", () => void this.runDefinition(definition));
        section.append(button);
      }
      this.drawer.append(section);
    }

    this.actionOutput.className = "guided-qa-action-readback";
    this.actionOutput.setAttribute("aria-live", "polite");
    this.drawer.append(this.actionOutput);
    this.auditOutput.className = "guided-qa-audit-readback";
    this.auditOutput.setAttribute("aria-live", "polite");
    this.drawer.append(this.auditOutput);

    const advanced = document.createElement("details");
    advanced.className = "guided-qa-advanced";
    advanced.innerHTML = "<summary>Advanced / Raw Controls</summary>";
    const assetRow = document.createElement("label");
    assetRow.className = "guided-qa-asset-mode";
    assetRow.innerHTML = `
      <span>ASSET PACK</span>
      <select>
        <option value="primitive">primitive</option>
        <option value="canary-v1">canary-v1 · INTERNAL</option>
      </select>
    `;
    const assetSelect = assetRow.querySelector<HTMLSelectElement>("select");
    if (assetSelect) {
      assetSelect.value = callbacks.getAssetMode();
      assetSelect.addEventListener("change", () => callbacks.setAssetMode(
        assetSelect.value === "canary-v1" ? "canary-v1" : "primitive",
      ));
    }
    this.assetSummary.className = "guided-qa-asset-summary";
    assetRow.append(this.assetSummary);
    advanced.append(assetRow);

    const audio = document.createElement("section");
    audio.className = "guided-qa-audio";
    audio.innerHTML = "<h3>Audio Test</h3>";
    const audioHeader = document.createElement("div");
    this.audioState.dataset.audioState = "true";
    const enableAudio = document.createElement("button");
    enableAudio.type = "button";
    enableAudio.textContent = "Enable Audio";
    enableAudio.addEventListener("click", () => void callbacks.resumeAudio().then(() => this.update()));
    audioHeader.append(this.audioState, enableAudio);
    audio.append(audioHeader);
    const cueGrid = document.createElement("div");
    cueGrid.className = "guided-qa-cue-grid";
    for (const cue of SEMANTIC_CUE_INVENTORY) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = cue.label;
      button.addEventListener("click", () => callbacks.playAudioCue(cue.id));
      cueGrid.append(button);
    }
    audio.append(cueGrid);
    advanced.append(audio);

    const rawGrid = document.createElement("div");
    rawGrid.className = "guided-qa-raw-grid";
    for (const raw of rawControls) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.rawQa = raw.id;
      button.textContent = raw.label;
      button.addEventListener("click", raw.run);
      rawGrid.append(button);
    }
    advanced.append(rawGrid);
    this.drawer.append(advanced);
    this.root.append(this.drawer);
    mount.append(this.root);
    window.addEventListener("keydown", this.handleKeyDown);
    this.update();
  }

  isOpen(): boolean {
    return this.open;
  }

  getAudit(): GuidedAuditReport | null {
    return this.currentAudit ? structuredClone(this.currentAudit) : null;
  }

  setEvidenceHidden(hidden: boolean): void {
    this.root.classList.toggle("is-evidence-hidden", hidden);
  }

  update(): void {
    const readback = this.callbacks.read();
    this.stateOutput.textContent = summarizeGuidedQaReadback(readback);
    const state = this.callbacks.getAudioState();
    this.audioState.textContent = `AUDIO ${state.toUpperCase()}`;
    this.audioState.dataset.state = state;
    this.assetSummary.textContent = this.callbacks.getAssetSummary();
    this.renderAction();
    this.renderAudit();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    this.root.remove();
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.drawer.hidden = !open;
    this.root.querySelector(".guided-qa-toggle")?.setAttribute("aria-expanded", String(open));
    this.callbacks.onOpenChange(open);
    if (open) this.update();
  }

  private async runDefinition(definition: GuidedQaActionDefinition): Promise<void> {
    if (definition.action === "run-audit") {
      this.auditOutput.innerHTML = "<strong>RUNNING</strong><span>Guided causal sequence in progress…</span>";
      this.currentAudit = await this.callbacks.runAudit();
      this.update();
      return;
    }
    if (definition.action === "export-readback") {
      this.downloadReadback();
      return;
    }
    if (definition.action === "capture-evidence") {
      this.setEvidenceHidden(true);
      return;
    }
    const before = this.callbacks.read();
    let message = "";
    let result: GuidedQaResult = "WAITING";
    try {
      message = await this.callbacks.perform(definition.action);
      result = "PASS";
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      result = "FAILED";
    }
    const after = this.callbacks.read();
    this.lastAction = { definition, before, after, result, message };
    this.update();
  }

  private renderAction(): void {
    if (!this.lastAction) {
      this.actionOutput.innerHTML = "<h3>Action readback</h3><p>操作を選ぶとbefore / expected / actualを表示します。</p>";
      return;
    }
    const { definition, before, after, result, message } = this.lastAction;
    this.actionOutput.innerHTML = `
      <h3>ACTION <em>${result}</em></h3>
      <strong>${escapeHtml(definition.description)}</strong>
      <dl>
        <div><dt>BEFORE</dt><dd>${escapeHtml(presenceLine(before))}</dd></div>
        <div><dt>EXPECTED</dt><dd>${escapeHtml(definition.expectedChange)}</dd></div>
        <div><dt>ACTUAL</dt><dd>${escapeHtml(presenceLine(after))}</dd></div>
        <div><dt>MESSAGE</dt><dd>${escapeHtml(message)}</dd></div>
      </dl>
    `;
  }

  private renderAudit(): void {
    if (!this.currentAudit) {
      this.auditOutput.innerHTML = "<h3>Guided Audit</h3><p>未実行</p>";
      return;
    }
    const latest = this.currentAudit.steps.at(-1);
    const steps = this.currentAudit.steps.map((step) => `
      <li data-audit-step="${escapeHtml(step.id)}" data-result="${step.result}">
        <strong>${escapeHtml(step.label)}</strong>
        <span>${step.result} · tick ${step.startTick}→${step.endTick} · ${step.durationMs}ms</span>
        <small>${escapeHtml(step.diagnosticMessage)}</small>
      </li>
    `).join("");
    this.auditOutput.innerHTML = `
      <h3>Guided Audit <em>${this.currentAudit.result}</em></h3>
      <p>${this.currentAudit.steps.length}/22 steps · timeout ${this.currentAudit.timeoutCount} · duplicate ${this.currentAudit.duplicateEventCount}</p>
      <small>${latest ? `${escapeHtml(latest.label)} // ${escapeHtml(latest.diagnosticMessage)}` : "no steps"}</small>
      <details class="guided-qa-audit-details">
        <summary>Detailed step readback</summary>
        <ol>${steps}</ol>
        <pre data-guided-audit-json>${escapeHtml(JSON.stringify(this.currentAudit, null, 2))}</pre>
      </details>
    `;
  }

  private downloadReadback(): void {
    const payload = {
      schemaVersion: "phase-g-guided-qa-readback-1.0.0",
      generatedAtIso: new Date().toISOString(),
      current: this.callbacks.read(),
      audit: this.currentAudit,
      asset: this.callbacks.getAssetSummary(),
      audio: this.callbacks.getAudioState(),
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "phase-g-guided-readback.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Escape" || !this.open) return;
    event.preventDefault();
    event.stopPropagation();
    this.setOpen(false);
  };
}

function qa(
  category: GuidedQaActionDefinition["category"],
  action: GuidedQaActionDefinition["action"],
  label: string,
  description: string,
  expectedChange: string,
): GuidedQaActionDefinition {
  return { category, action, label, description, expectedChange };
}

function presenceLine(readback: GuidedQaReadback): string {
  return `ALLIED ${readback.alliedPresence.toFixed(2)} · HOSTILE ${readback.hostilePresence.toFixed(2)} · ${readback.presenceBand.toUpperCase()} · LOCK ${readback.lockState.toUpperCase()}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
