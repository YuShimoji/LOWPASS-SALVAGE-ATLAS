import {
  SEMANTIC_AUDIO_CUES,
  type SemanticAudioCueId,
} from "../render/audio/SemanticAudio";

export type GuidedQaCategory =
  | "Setup"
  | "Contact sequence"
  | "Relay"
  | "Flare"
  | "Audio test"
  | "Results";

export interface GuidedQaStepDefinition {
  readonly id: string;
  readonly category: GuidedQaCategory;
  readonly label: string;
  readonly action: string;
  readonly expectation: string;
}

export interface GuidedQaStepResult {
  readonly index: number;
  readonly id: string;
  readonly category: GuidedQaCategory;
  readonly label: string;
  readonly action: string;
  readonly expectation: string;
  readonly startedAtIso: string;
  readonly completedAtIso: string;
  readonly status: "PASS" | "FAIL";
  readonly message: string;
  readonly readback: unknown;
}

export interface GuidedQaAudit {
  readonly schemaVersion: "lowpass-guided-phase-g-audit-1.0.0";
  readonly generatedAtIso: string;
  readonly scenarioId: "phase-g-guided-qa-18-step-v1";
  readonly fixedSeed: "phase-g-guided-audit-v1";
  readonly results: readonly GuidedQaStepResult[];
}

export const GUIDED_QA_STEPS: readonly GuidedQaStepDefinition[] = [
  step("setup-loadout", "Setup", "Configure the 28U review loadout", "phase-d-loadout", "Draft remains gate-valid."),
  step("setup-launch", "Setup", "Launch the fixed mission", "guided-launch", "Mission loads through the manifest and reservation path."),
  step("contact-isolate", "Contact sequence", "Stage an isolated contact", "isolate-contact", "Needle receives a controller-owned contact setup."),
  step("contact-observe", "Contact sequence", "Read contact transition state", "results-threat", "Threat transition and report revisions are readable."),
  step("contact-reinforce", "Contact sequence", "Bring allied support into range", "reinforce-contact", "Presence is updated through squad positions."),
  step("contact-withdraw", "Contact sequence", "Withdraw allied support", "withdraw-contact", "The supporting agent leaves contact range."),
  step("relay-deploy", "Relay", "Deploy the portable relay", "deploy-relay", "ItemLocation becomes mission-ground through squad control."),
  step("relay-disable", "Relay", "Disable the deployed relay", "disable-relay", "Relay operational state is disabled."),
  step("relay-restart", "Relay", "Start relay recovery", "restart-relay", "Relay restart uses the normal squad controller path."),
  step("flare-deploy", "Flare", "Deploy a signal flare", "deploy-flare", "Signal beacon state is created by the squad controller."),
  step("contact-porter-auth", "Contact sequence", "Stage and authenticate the Porter", "porter-auth", "Authentication stays inside the Porter controller and gate context."),
  step("contact-porter-readback", "Contact sequence", "Read Porter authentication", "results-porter", "The controller has time to complete its handshake."),
  step("contact-porter-carry", "Contact sequence", "Issue the Porter carry command", "porter-carry", "Carry ownership remains ItemLocation and Porter-controller state."),
  step("audio-suite", "Audio test", "Audit all 17 semantic cues", "audio-suite", "Every cue records played, muted, or rate-limited status with a caption."),
  step("results-camera", "Results", "Read camera orbit and occlusion", "results-camera", "Pitch, distance, and occlusion state are structured."),
  step("results-cart", "Results", "Read cart authority state", "results-cart", "Cart pose and attachment remain MissionSession-owned."),
  step("results-assets", "Results", "Read active asset mode", "results-assets", "Primitive/canary selection and fallback are structured."),
  step("results-final", "Results", "Capture final Phase G readback", "results-final", "The full controller-owned state is ready for export."),
] as const;

export const ADVANCED_QA_ACTIONS = [
  ["console", "Expedition console"],
  ["filter-01", "Filter 01"],
  ["filter-02", "Filter 02"],
  ["filter-03", "Filter 03"],
  ["cooling-coil", "Cooling coil"],
  ["relay-core-01", "Relay core 01"],
  ["relay-core-02", "Relay core 02"],
  ["relay-core-03", "Relay core 03"],
  ["cart", "Cart"],
  ["cart-coil", "Stage cart at coil"],
  ["cart-extract", "Stage cart at extraction"],
  ["sales", "Sales floor"],
  ["cooling", "Cooling room"],
  ["underground", "Underground"],
  ["cooling-gate", "Cooling shortcut"],
  ["drone", "Needle"],
  ["porter", "Porter"],
  ["porter-auth", "Porter authenticate"],
  ["porter-carry", "Porter carry"],
  ["extract", "Extraction"],
] as const;

export interface GuidedQaPanelOptions {
  readonly runAction: (action: string) => void | Promise<void>;
  readonly getReadback: (action: string) => unknown;
  readonly onOpenChange: (open: boolean) => void;
}

declare global {
  interface Window {
    __LOWPASS_QA__?: {
      definitions(): readonly GuidedQaStepDefinition[];
      runStep(index: number): Promise<GuidedQaStepResult>;
      runAll(): Promise<GuidedQaAudit>;
      readback(): GuidedQaAudit;
      exportJson(): string;
      exportHtml(): string;
    };
  }
}

export class GuidedQaPanel {
  readonly element = document.createElement("details");
  private readonly status = document.createElement("p");
  private readonly results: GuidedQaStepResult[] = [];
  private nextIndex = 0;
  private running = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: GuidedQaPanelOptions,
  ) {
    this.element.className = "guided-qa";
    this.element.setAttribute("aria-label", "Guided Phase G QA");
    const summary = document.createElement("summary");
    summary.innerHTML = "<strong>GUIDED PHASE G QA</strong><span>18-step review</span>";
    this.status.className = "guided-qa-status";
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.status.textContent = "Ready · world input pauses while this panel is open.";
    const body = document.createElement("div");
    body.className = "guided-qa-body";
    body.append(this.createToolbar(), this.createScenarioSections(), this.createAdvancedSection());
    this.element.append(summary, this.status, body);
    this.element.addEventListener("toggle", () => {
      this.options.onOpenChange(this.element.open);
    });
    window.addEventListener("keydown", this.handleKeyDown, { capture: true });
    this.root.append(this.element);
    window.__LOWPASS_QA__ = {
      definitions: () => GUIDED_QA_STEPS,
      runStep: (index) => this.runStep(index),
      runAll: () => this.runAll(),
      readback: () => this.createAudit(),
      exportJson: () => JSON.stringify(this.createAudit(), null, 2),
      exportHtml: () => renderGuidedQaAuditHtml(this.createAudit()),
    };
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown, { capture: true });
    this.options.onOpenChange(false);
    this.element.remove();
    delete window.__LOWPASS_QA__;
  }

  async runStep(index: number): Promise<GuidedQaStepResult> {
    if (this.running) throw new Error("A Guided QA action is already running.");
    const definition = GUIDED_QA_STEPS[index];
    if (!definition) throw new RangeError(`Unknown Guided QA step index: ${index}`);
    this.running = true;
    this.element.open = true;
    const startedAtIso = new Date().toISOString();
    this.status.textContent = `Running ${index + 1}/18 · ${definition.label}`;
    let status: GuidedQaStepResult["status"] = "PASS";
    let message = "Action completed and readback captured.";
    try {
      await this.options.runAction(definition.action);
      await waitForControllerReadback(definition.action);
    } catch (error) {
      status = "FAIL";
      message = error instanceof Error ? error.message : String(error);
    }
    const result = {
      index,
      ...definition,
      startedAtIso,
      completedAtIso: new Date().toISOString(),
      status,
      message,
      readback: this.options.getReadback(definition.action),
    } satisfies GuidedQaStepResult;
    this.results[index] = result;
    this.nextIndex = Math.max(this.nextIndex, index + 1);
    this.status.textContent = `${status} · ${index + 1}/18 · ${definition.label}`;
    this.running = false;
    return result;
  }

  async runAll(): Promise<GuidedQaAudit> {
    for (let index = 0; index < GUIDED_QA_STEPS.length; index += 1) {
      const result = await this.runStep(index);
      if (result.status === "FAIL") break;
    }
    return this.createAudit();
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "guided-qa-toolbar";
    const next = button("Run next", () => void this.runStep(Math.min(this.nextIndex, GUIDED_QA_STEPS.length - 1)));
    next.dataset.qaRunNext = "true";
    const all = button("Run all 18", () => void this.runAll());
    all.dataset.qaRunAll = "true";
    const reset = button("Clear results", () => {
      this.results.length = 0;
      this.nextIndex = 0;
      this.status.textContent = "Results cleared.";
    });
    const exportJson = button("Download JSON", () => {
      downloadAuditFile(
        "phase-g-guided-audit.json",
        "application/json",
        JSON.stringify(this.createAudit(), null, 2),
      );
    });
    exportJson.dataset.qaExportJson = "true";
    const exportHtml = button("Download HTML", () => {
      downloadAuditFile(
        "phase-g-guided-audit.html",
        "text/html",
        renderGuidedQaAuditHtml(this.createAudit()),
      );
    });
    exportHtml.dataset.qaExportHtml = "true";
    toolbar.append(next, all, reset, exportJson, exportHtml);
    return toolbar;
  }

  private createScenarioSections(): HTMLElement {
    const container = document.createElement("div");
    container.className = "guided-qa-scenarios";
    const categories = [...new Set(GUIDED_QA_STEPS.map((entry) => entry.category))];
    for (const category of categories) {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = category;
      const list = document.createElement("ol");
      for (const [index, definition] of GUIDED_QA_STEPS.entries()) {
        if (definition.category !== category) continue;
        const item = document.createElement("li");
        const action = button(`${index + 1}. ${definition.label}`, () => void this.runStep(index));
        action.dataset.qaStep = String(index);
        const expectation = document.createElement("span");
        expectation.textContent = definition.expectation;
        item.append(action, expectation);
        list.append(item);
      }
      section.append(heading, list);
      container.append(section);
    }
    return container;
  }

  private createAdvancedSection(): HTMLElement {
    const advanced = document.createElement("details");
    advanced.className = "guided-qa-advanced";
    const summary = document.createElement("summary");
    summary.textContent = "Advanced · raw staging actions";
    const actions = document.createElement("div");
    actions.className = "guided-qa-advanced-actions";
    for (const [action, label] of ADVANCED_QA_ACTIONS) {
      actions.append(button(label, () => void this.options.runAction(action)));
    }
    const audio = document.createElement("div");
    audio.className = "guided-qa-audio-actions";
    for (const definition of SEMANTIC_AUDIO_CUES) {
      audio.append(button(definition.caption, () => void this.options.runAction(`audio:${definition.id}`)));
    }
    advanced.append(summary, actions, audio);
    return advanced;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Escape" || !this.element.open) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.element.open = false;
  };

  private createAudit(): GuidedQaAudit {
    return {
      schemaVersion: "lowpass-guided-phase-g-audit-1.0.0",
      generatedAtIso: new Date().toISOString(),
      scenarioId: "phase-g-guided-qa-18-step-v1",
      fixedSeed: "phase-g-guided-audit-v1",
      results: this.results.filter((entry): entry is GuidedQaStepResult => Boolean(entry)),
    };
  }
}

export function isSemanticAudioAction(action: string): action is `audio:${SemanticAudioCueId}` {
  return action.startsWith("audio:")
    && SEMANTIC_AUDIO_CUES.some((cueDefinition) => cueDefinition.id === action.slice(6));
}

export function renderGuidedQaAuditHtml(audit: GuidedQaAudit): string {
  const rows = audit.results.map((result) => `
    <tr>
      <td>${result.index + 1}</td>
      <td>${escapeHtml(result.category)}</td>
      <td>${escapeHtml(result.label)}</td>
      <td>${escapeHtml(result.status)}</td>
      <td><pre>${escapeHtml(JSON.stringify(result.readback, null, 2))}</pre></td>
    </tr>`).join("");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>LOWPASS Guided Phase G Audit</title>
<style>body{font:14px/1.45 system-ui;background:#091114;color:#d7e2da;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #486057;padding:8px;vertical-align:top;text-align:left}pre{white-space:pre-wrap;max-width:52rem}</style>
</head>
<body><h1>LOWPASS Guided Phase G Audit</h1><p>${escapeHtml(audit.generatedAtIso)} · ${audit.results.length}/18 steps</p>
<table><thead><tr><th>#</th><th>Category</th><th>Step</th><th>Status</th><th>Readback</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function step(
  id: string,
  category: GuidedQaCategory,
  label: string,
  action: string,
  expectation: string,
): GuidedQaStepDefinition {
  return { id, category, label, action, expectation };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadAuditFile(filename: string, type: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function waitForControllerReadback(action: string): Promise<void> {
  const delayMs = action === "porter-auth" ? 3_300 : action.startsWith("results-") ? 0 : 240;
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}
