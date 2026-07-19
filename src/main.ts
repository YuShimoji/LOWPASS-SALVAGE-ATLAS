import "./style.css";
import { FrameStats } from "./diagnostics/FrameStats";
import { InputController } from "./game/input/InputController";
import {
  GATE_DEMONSTRATOR_ITEMS,
  ITEM_DEFINITIONS,
  SHIP_INVENTORY,
} from "./game/items/itemDefinitions";
import {
  createGateEvaluationContext,
  ExpeditionAlreadyConfirmedError,
  ExpeditionPlanner,
  InvalidExpeditionDraftError,
} from "./game/mission/ExpeditionPlanner";
import { evaluateItemForGate } from "./game/mission/gateEvaluator";
import { CREW_DEFINITIONS } from "./game/squad/squadTypes";
import { FixedStepRunner } from "./game/simulation/FixedStepRunner";
import { GameSimulation } from "./game/simulation/GameSimulation";
import {
  createInitialGameState,
  type ActiveModal,
  type VisualSettings,
} from "./game/simulation/GameState";
import { PhysicsWorld } from "./physics/PhysicsWorld";
import { RenderSystem } from "./render/app/RenderSystem";
import { ExpeditionPanel } from "./ui/ExpeditionPanel";
import { Hud } from "./ui/Hud";

declare global {
  interface Window {
    __LOWPASS_DEBUG__?: {
      snapshot(): ReturnType<typeof createInitialGameState>;
    };
  }
}

const mount = document.querySelector<HTMLElement>("#app");
if (!mount) throw new Error("#app mount element is missing");

void bootstrap(mount);

async function bootstrap(root: HTMLElement): Promise<void> {
  const state = createInitialGameState();
  const simulation = new GameSimulation(state);
  const gateContext = createGateEvaluationContext(
    CREW_DEFINITIONS,
    ITEM_DEFINITIONS,
    [...SHIP_INVENTORY, ...GATE_DEMONSTRATOR_ITEMS],
  );
  const planner = new ExpeditionPlanner(state.expedition.draft, gateContext);
  let renderSystem: RenderSystem | null = null;
  let physics: PhysicsWorld | null = null;
  let input: InputController | null = null;
  let expeditionPanel: ExpeditionPanel | null = null;
  let frameHandle = 0;

  const releaseWorldInput = (): void => {
    input?.clearMovement();
    if (document.pointerLockElement) document.exitPointerLock();
  };

  const setModal = (requestedModal: ActiveModal): void => {
    const modal =
      requestedModal === "expedition" && state.expedition.confirmedManifest
        ? "manifest-summary"
        : requestedModal;
    simulation.setModal(modal);
    hud.setSettingsOpen(modal === "settings");

    if (modal === "expedition") {
      expeditionPanel?.showDraft(planner.getDraftSnapshot(), planner.getEvaluation());
    } else if (modal === "manifest-summary" && state.expedition.confirmedManifest) {
      expeditionPanel?.showManifest(state.expedition.confirmedManifest);
    } else {
      expeditionPanel?.hide();
    }

    if (modal !== "none") releaseWorldInput();
  };

  const updateVisualSetting = <K extends keyof VisualSettings>(key: K, value: VisualSettings[K]): void => {
    simulation.setVisualSetting(key, value);
  };

  const hud = new Hud(root, state.settings, {
    onPauseToggle: () => setModal(state.ui.activeModal === "settings" ? "none" : "settings"),
    onVisualSetting: updateVisualSetting,
  });

  const refreshDraftUi = (): void => {
    state.expedition.draft = planner.getDraftSnapshot();
    if (state.ui.activeModal === "expedition") {
      expeditionPanel?.showDraft(state.expedition.draft, planner.getEvaluation());
    }
  };

  const runPlannerAction = (action: () => void): void => {
    try {
      action();
      refreshDraftUi();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      simulation.setNotice(`編成を更新できません: ${message}`);
    }
  };

  expeditionPanel = new ExpeditionPanel(
    root,
    {
      agents: CREW_DEFINITIONS,
      itemDefinitions: ITEM_DEFINITIONS,
      shipInventory: SHIP_INVENTORY,
    },
    {
      onClose: () => setModal("none"),
      onAgentSelection: (agentId, selected) =>
        runPlannerAction(() => planner.setAgentSelected(agentId, selected)),
      onFieldLead: (agentId) => runPlannerAction(() => planner.setFieldLead(agentId)),
      onAssignItem: (itemInstanceId, agentId) =>
        runPlannerAction(() => planner.assignItem(itemInstanceId, agentId)),
      onReturnItem: (itemInstanceId) => runPlannerAction(() => planner.unassignItem(itemInstanceId)),
      onConfirm: () => {
        try {
          const manifest = planner.confirm({
            manifestId: crypto.randomUUID(),
            createdAtIso: new Date().toISOString(),
          });
          state.expedition.draft = planner.getDraftSnapshot();
          state.expedition.confirmedManifest = manifest;
          simulation.setNotice("出撃マニフェストを確定しました");
          setModal("manifest-summary");
        } catch (error) {
          if (error instanceof InvalidExpeditionDraftError) {
            simulation.setNotice(`ゲート契約違反: ${error.evaluation.violations[0]?.message ?? "編成を確認してください"}`);
          } else if (error instanceof ExpeditionAlreadyConfirmedError) {
            simulation.setNotice("この遠征はすでに確定済みです");
          } else {
            simulation.setNotice("マニフェストの確定に失敗しました");
          }
        }
      },
    },
  );

  try {
    renderSystem = new RenderSystem(root, (message) => simulation.setNotice(message));
    physics = await PhysicsWorld.create();
    input = new InputController(renderSystem.canvas, (x, y) => renderSystem?.applyLookDelta(x, y));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    hud.showFatal(`初期化に失敗しました: ${message}`);
    console.error(error);
    return;
  }

  const activeRenderSystem = renderSystem;
  const activePhysics = physics;
  const activeInput = input;
  const fixedStep = new FixedStepRunner();
  const frameStats = new FrameStats();
  let previousTime = performance.now();
  let lastHudUpdate = 0;
  let interpolationAlpha = 1;
  let handledActivationRevision = 0;
  let gateScanRevision = 0;

  const handleWorldAction = (): void => {
    if (state.interaction.activationRevision === handledActivationRevision) return;
    handledActivationRevision = state.interaction.activationRevision;
    const action = state.interaction.activatedAction;
    if (!action) return;

    if (action.type === "open-expedition-console") {
      setModal("expedition");
      return;
    }
    if (action.type === "scan-gate-item") {
      const evaluation = evaluateItemForGate(action.itemInstanceId, gateContext);
      gateScanRevision += 1;
      state.expedition.gateScan = {
        itemInstanceId: action.itemInstanceId,
        scannedAtSeconds: state.runtime.elapsedSeconds,
        revision: gateScanRevision,
        evaluation,
      };
      simulation.setNotice(
        evaluation.accepted
          ? `${evaluation.definition?.label ?? action.itemInstanceId} // GATE AUTHORIZED`
          : `${evaluation.definition?.label ?? action.itemInstanceId} // ${evaluation.violations[0]?.code ?? "GATE REJECTED"}`,
      );
    }
  };

  const animate = (now: number): void => {
    const frameSeconds = Math.min((now - previousTime) / 1000, 0.25);
    previousTime = now;

    const commands = activeInput.consumeFrameCommands();
    if (commands.pausePressed) {
      setModal(state.ui.activeModal === "none" ? "settings" : "none");
    }
    if (commands.debugPressed) hud.toggleDebug();

    let droppedSimulationTime = false;
    if (state.runtime.mode === "playing") {
      const result = fixedStep.advance(frameSeconds, (dt) => {
        const movement = activeInput.sampleMovement(activeRenderSystem.cameraRig.getYaw());
        const physicsSnapshot = activePhysics.stepCharacter(movement, dt);
        simulation.fixedUpdate(dt, movement, physicsSnapshot);
      });
      interpolationAlpha = result.alpha;
      droppedSimulationTime = result.droppedTime;
      handleWorldAction();
    } else {
      fixedStep.reset();
      interpolationAlpha = 1;
    }

    frameStats.record(frameSeconds, droppedSimulationTime);
    activeRenderSystem.render(state, interpolationAlpha, frameSeconds);
    if (now - lastHudUpdate >= 100) {
      lastHudUpdate = now;
      hud.update(state, {
        fps: frameStats.fps,
        droppedSimulationFrames: frameStats.droppedSimulationFrames,
        render: activeRenderSystem.getDiagnostics(),
        physics: activePhysics.getDiagnostics(),
        expedition: planner.getEvaluation(),
      });
    }
    frameHandle = requestAnimationFrame(animate);
  };

  window.__LOWPASS_DEBUG__ = {
    snapshot: () => structuredClone(state),
  };
  frameHandle = requestAnimationFrame(animate);

  const cleanup = (): void => {
    cancelAnimationFrame(frameHandle);
    activeInput.dispose();
    activePhysics.dispose();
    activeRenderSystem.dispose();
    delete window.__LOWPASS_DEBUG__;
  };
  window.addEventListener("beforeunload", cleanup, { once: true });
  document.addEventListener("visibilitychange", () => {
    previousTime = performance.now();
    fixedStep.reset();
  });
}
