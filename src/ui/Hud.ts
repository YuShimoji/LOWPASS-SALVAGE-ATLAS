import type { PhysicsDiagnostics } from "../physics/PhysicsWorld";
import type { RenderDiagnostics } from "../render/app/RenderSystem";
import type { GameState, VisualSettings } from "../game/simulation/GameState";
import type { ExpeditionGateEvaluation } from "../game/mission/gateEvaluator";
import type { MissionObjectiveProgress } from "../game/mission/MissionSession";
import type { DomDiagnostics } from "../diagnostics/DomDiagnostics";
import type { InputDiagnostics } from "../game/input/InputController";
import type { CameraDiagnostics } from "../render/app/ThirdPersonCamera";
import type { CartDiagnostics } from "../game/mission/MissionSession";

export interface HudDiagnostics {
  fps: number;
  droppedSimulationFrames: number;
  render: RenderDiagnostics;
  physics: PhysicsDiagnostics;
  input: InputDiagnostics;
  camera: CameraDiagnostics;
  cart: CartDiagnostics | null;
  expedition: ExpeditionGateEvaluation;
  mission: MissionObjectiveProgress | null;
  worldContract: {
    readonly label: string;
    readonly recoveredBeforeVisit: number;
    readonly objectiveCount: number;
  } | null;
  dom: DomDiagnostics;
}

export interface HudCallbacks {
  onPauseToggle(): void;
  onVisualSetting<K extends keyof VisualSettings>(key: K, value: VisualSettings[K]): void;
}

export class Hud {
  private readonly root = document.createElement("div");
  private readonly prompt = document.createElement("div");
  private readonly debug = document.createElement("pre");
  private readonly pauseOverlay = document.createElement("section");
  private readonly notice = document.createElement("div");
  private readonly gateScan = document.createElement("aside");
  private readonly objective: HTMLElement;
  private readonly status: HTMLElement;
  private noticeRevision = -1;
  private gateScanRevision = -1;
  private noticeTimer = 0;
  private gateScanTimer = 0;
  private debugVisible = true;

  constructor(
    mount: HTMLElement,
    initialSettings: VisualSettings,
    private readonly callbacks: HudCallbacks,
  ) {
    this.root.className = "ui-layer";
    this.root.innerHTML = `
      <header class="brand-chip" aria-label="Game title">
        <span class="brand-kicker">PHASE G / SECURITY CELL</span>
        <strong>LOWPASS</strong><span class="brand-subtitle">SALVAGE ATLAS</span>
      </header>
      <section class="objective-chip" aria-label="Current objective">
        <span>現在目標</span>
        <strong data-objective>出撃コンソールで遠征編成を確定する</strong>
      </section>
      <section class="status-chip" aria-label="Current status">
        <span data-status>DRAFT · 18/28U</span>
        <button type="button" data-pause aria-label="設定を開く">Ⅱ</button>
      </section>
      <div class="reticle" aria-hidden="true"></div>
      <aside class="controls-hint">
        <span>WASD</span> 移動　<span>SHIFT</span> 走る　<span>E</span> 操作　<span>MOUSE</span> 視点　<span>F1</span> 診断
      </aside>
    `;

    const objective = this.root.querySelector<HTMLElement>("[data-objective]");
    const status = this.root.querySelector<HTMLElement>("[data-status]");
    if (!objective || !status) throw new Error("HUD status elements could not be created");
    this.objective = objective;
    this.status = status;

    this.prompt.className = "interaction-prompt";
    this.prompt.setAttribute("role", "status");
    this.root.append(this.prompt);

    this.notice.className = "system-notice";
    this.notice.setAttribute("aria-live", "polite");
    this.root.append(this.notice);

    this.gateScan.className = "gate-scan-feedback";
    this.gateScan.setAttribute("aria-live", "assertive");
    this.root.append(this.gateScan);

    this.debug.className = "debug-hud";
    this.debug.setAttribute("aria-label", "Debug diagnostics");
    this.root.append(this.debug);

    this.pauseOverlay.className = "pause-overlay";
    this.pauseOverlay.setAttribute("aria-hidden", "true");
    this.pauseOverlay.innerHTML = `
      <div class="pause-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <span class="panel-kicker">SHIPBOARD DISPLAY</span>
        <h2 id="pause-title">一時停止 / 表示設定</h2>
        <p>演出は個別に無効化できます。ゲームルールには影響しません。</p>
        <div class="settings-list"></div>
        <button type="button" class="resume-button" data-resume>探索へ戻る</button>
      </div>
    `;
    this.root.append(this.pauseOverlay);
    mount.append(this.root);

    const settingsList = this.pauseOverlay.querySelector<HTMLElement>(".settings-list");
    if (!settingsList) throw new Error("Settings container could not be created");
    this.addSetting(settingsList, "lowResolution", "低解像度レンダリング", initialSettings.lowResolution);
    this.addSetting(settingsList, "distanceFog", "距離フォグ", initialSettings.distanceFog);
    this.addSetting(settingsList, "vertexSnap", "頂点スナップ", initialSettings.vertexSnap);
    this.addSetting(settingsList, "dithering", "ディザリング", initialSettings.dithering);

    this.root.querySelector("[data-pause]")?.addEventListener("click", this.callbacks.onPauseToggle);
    this.root.querySelector("[data-resume]")?.addEventListener("click", this.callbacks.onPauseToggle);
  }

  update(state: GameState, diagnostics: HudDiagnostics): void {
    const interactionPrompt = state.runtime.mode === "playing" ? state.interaction.prompt : null;
    this.prompt.textContent = interactionPrompt ?? "";
    this.prompt.classList.toggle("is-visible", interactionPrompt !== null);
    if (state.world.mode === "mission-loading") {
      this.status.textContent = "MISSION · LOADING";
      this.objective.textContent = "固定探索マップへ降下する";
    } else if (state.world.mode === "mission" && diagnostics.mission && state.expedition.confirmedManifest) {
      const squad = state.mission.squad;
      this.status.textContent = squad
        ? `CTRL ${squad.control.controlledAgentId.toUpperCase()} · LEAD ${squad.control.fieldLeadAgentId.toUpperCase()}`
        : `TEAM ${state.expedition.confirmedManifest.selectedAgentIds.length} · GEAR ${state.expedition.confirmedManifest.items.length}`;
      const contractRecovered = diagnostics.worldContract
        ? Math.min(
            diagnostics.worldContract.objectiveCount,
            diagnostics.worldContract.recoveredBeforeVisit + diagnostics.mission.securedResources,
          )
        : diagnostics.mission.securedResources;
      this.objective.textContent = squad?.rallyObjective.active
        ? `${squad.rallyObjective.label} · ${Math.round(squad.rallyObjective.progress * 100)}%`
        : diagnostics.worldContract
          ? `${diagnostics.worldContract.label} ${contractRecovered}/${diagnostics.worldContract.objectiveCount} · 冷却コイル ${diagnostics.mission.coolingCoilLoaded ? "積載済" : "未積載"}`
          : `全契約完了 · 任意サルベージ ${diagnostics.mission.securedResources}点`;
    } else {
      this.status.textContent = state.expedition.confirmedManifest
        ? `MANIFEST · ${state.expedition.confirmedManifest.totalCapacityUnits}/28U · RUN ${state.world.completedExpeditions}`
        : `DRAFT · ${diagnostics.expedition.capacity.usedUnits}/28U`;
      this.objective.textContent = state.expedition.confirmedManifest
        ? "確定マニフェストから固定遠征を開始する"
        : "出撃コンソールで遠征編成を確定する";
    }

    if (state.interaction.noticeRevision !== this.noticeRevision && state.interaction.notice) {
      this.noticeRevision = state.interaction.noticeRevision;
      this.showNotice(state.interaction.notice);
    }

    const scan = state.expedition.gateScan;
    if (scan && scan.revision !== this.gateScanRevision) {
      this.gateScanRevision = scan.revision;
      this.showGateScan(scan.evaluation);
    }

    if (this.debugVisible) {
      const { player, runtime } = state;
      const { render, physics, input, camera, cart } = diagnostics;
      this.debug.textContent = [
        "PHASE G DIAGNOSTICS  [F1]",
        `WORLD ${state.world.mode.toUpperCase()}  RUNS ${state.world.completedExpeditions}`,
        `FPS ${diagnostics.fps.toFixed(0).padStart(3)}  FIXED 60Hz  TICK ${runtime.tick}`,
        `POS ${format(player.position.x)}  ${format(player.position.y)}  ${format(player.position.z)}`,
        `SPEED ${player.movementSpeed.toFixed(2)}m/s  GROUND ${player.grounded ? "YES" : "NO"}`,
        `KEYS ${input.heldCodes.join(",") || "NONE"}  ACTIONS ${input.resolvedActions.join(",") || "NONE"}`,
        `MOVE RAW ${format(input.rawX)}/${format(input.rawY)}  WORLD ${format(input.worldX)}/${format(input.worldZ)}  DISP ${format(input.actualDisplacementX)}/${format(input.actualDisplacementZ)}`,
        `INPUT ${input.activeDevice.toUpperCase()}  FOCUS ${input.focusedElement}  MODAL ${input.modalState.toUpperCase()}  POINTER ${input.pointerLocked ? "LOCKED" : "FREE"}  PADS ${input.connectedGamepads.length}`,
        `CAM DES ${camera.desiredDistance.toFixed(2)}m  EFF ${camera.effectiveDistance.toFixed(2)}m  OCC ${camera.occlusionActive ? "YES" : "NO"}`,
        cart
          ? `CART ${cart.attached ? "PUSH" : "FREE"}  POS ${format(cart.position.x)}/${format(cart.position.z)}  SPEED ${cart.speed.toFixed(2)}m/s  YAW ${cart.facingYaw.toFixed(2)}  BLOCK ${cart.collisionBlocked ? "YES" : "NO"}`
          : "CART INACTIVE",
        `RAPIER BODY ${physics.rigidBodyCount}  COL ${physics.colliderCount}  CONTACT ${physics.collisionCount}`,
        `WEBGL ${render.drawCalls} calls  ${render.triangles} tris  ${render.renderWidth}×${render.renderHeight}`,
        `SCENE OBJECTS ${render.sceneObjects}`,
        `GPU MEM GEO ${render.geometries}  TEX ${render.textures}  PROG ${render.programs}`,
        `DROPPED CATCH-UP ${diagnostics.droppedSimulationFrames}`,
        `GATE DRAFT ${diagnostics.expedition.accepted ? "VALID" : "BLOCKED"}  ${diagnostics.expedition.capacity.usedUnits}/28U`,
        diagnostics.mission
          ? diagnostics.worldContract
            ? `SALVAGE ${diagnostics.worldContract.label} ${diagnostics.mission.securedResources}/${diagnostics.mission.requiredResources}  CART ${diagnostics.mission.cartAtExtraction ? "EXTRACT" : "FIELD"}`
            : `SALVAGE OPTIONAL ${diagnostics.mission.securedResources} ITEMS  CART ${diagnostics.mission.cartAtExtraction ? "EXTRACT" : "FIELD"}`
          : "SALVAGE INACTIVE",
        state.mission.squad
          ? `COMMS ${Object.values(state.mission.squad.agents).map((agent) => `${agent.id}:${agent.communicationBand}`).join(" ")}`
          : "COMMS INACTIVE",
        state.mission.threat
          ? `THREAT ${state.mission.threat.drone.mode.toUpperCase()}  TARGET ${state.mission.threat.drone.targetAgentId ?? "NONE"}  PRES ${state.mission.threat.drone.presence?.band.toUpperCase() ?? "NONE"}`
          : "THREAT INACTIVE",
        state.mission.threat?.securityCell
          ? `CELL ${state.mission.threat.securityCell.posture.toUpperCase()}  LINK ${(state.mission.threat.securityCell.link?.quality ?? 0).toFixed(2)}  LOCAL ${Object.values(state.mission.threat.securityCell.knowledgeByMachine).map((knowledge) => `${knowledge.machineId.endsWith("needle-01") ? "N" : "W"}:${Object.keys(knowledge.localFacts).length}`).join(" ")}  SHARED ${Object.keys(state.mission.threat.securityCell.blackboard.sharedFacts).length}`
          : "CELL INACTIVE",
        state.mission.threat?.securityCell
          ? `TASKS ${Object.values(state.mission.threat.securityCell.blackboard.currentAssignments).map((assignment) => `${assignment.machineId.endsWith("needle-01") ? "N" : "W"}:${assignment.task}`).join(" ") || "NONE"}  RSV ${Object.keys(state.mission.threat.securityCell.blackboard.taskReservations).length}  TOK L${Object.keys(state.mission.threat.securityCell.blackboard.pressureTokens.lockOnByAgentId).length}/I${state.mission.threat.securityCell.blackboard.pressureTokens.activeInterdictionMachineId ? 1 : 0}/S${Object.keys(state.mission.threat.securityCell.blackboard.pressureTokens.relaySabotageByRelayId).length}`
          : "TASKS INACTIVE",
        state.mission.porter
          ? `PORTER ${state.mission.porter.mode.toUpperCase()}  CARRY ${state.mission.porter.carriedItemId ?? "NONE"}`
          : "PORTER INACTIVE",
        `DOM ${diagnostics.dom.totalNodes}  HUD ${diagnostics.dom.persistentHudNodes}  MODAL ${diagnostics.dom.modalNodes}  FX ${diagnostics.dom.transientFeedbackNodes}  HISTORY ${diagnostics.dom.resultHistoryNodes}`,
      ].join("\n");
    }
  }

  setSettingsOpen(open: boolean): void {
    this.pauseOverlay.classList.toggle("is-visible", open);
    this.pauseOverlay.setAttribute("aria-hidden", String(!open));
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible;
    this.debug.hidden = !this.debugVisible;
  }

  showNotice(message: string): void {
    window.clearTimeout(this.noticeTimer);
    this.notice.textContent = message;
    this.notice.classList.remove("is-visible");
    requestAnimationFrame(() => this.notice.classList.add("is-visible"));
    this.noticeTimer = window.setTimeout(() => this.notice.classList.remove("is-visible"), 3200);
  }

  showFatal(message: string): void {
    this.showNotice(message);
    this.notice.classList.add("is-fatal");
  }

  private showGateScan(evaluation: NonNullable<GameState["expedition"]["gateScan"]>["evaluation"]): void {
    window.clearTimeout(this.gateScanTimer);
    const label = evaluation.definition?.label ?? evaluation.itemInstanceId;
    const reason = evaluation.accepted
      ? `VOL ${evaluation.definition?.volumeLoad ?? "?"}/4 · LOG ${evaluation.definition?.logicLoad ?? "?"}/3`
      : evaluation.violations.map((violation) => violation.message).join(" / ");
    this.gateScan.replaceChildren();
    const kicker = document.createElement("span");
    kicker.textContent = evaluation.accepted ? "GATE AUTHORIZED" : "GATE REJECTED";
    const title = document.createElement("strong");
    title.textContent = label;
    const detail = document.createElement("small");
    detail.textContent = reason;
    this.gateScan.append(kicker, title, detail);
    this.gateScan.classList.toggle("is-accepted", evaluation.accepted);
    this.gateScan.classList.toggle("is-rejected", !evaluation.accepted);
    this.gateScan.classList.add("is-visible");
    this.gateScanTimer = window.setTimeout(() => this.gateScan.classList.remove("is-visible"), 3600);
  }

  private addSetting(
    container: HTMLElement,
    key: keyof VisualSettings,
    label: string,
    checked: boolean,
  ): void {
    const row = document.createElement("label");
    row.className = "setting-row";
    const text = document.createElement("span");
    text.textContent = label;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => this.callbacks.onVisualSetting(key, input.checked));
    row.append(text, input);
    container.append(row);
  }
}

function format(value: number): string {
  return value.toFixed(2).padStart(6);
}
