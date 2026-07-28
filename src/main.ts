import "./style.css";
import { FrameStats } from "./diagnostics/FrameStats";
import { SHIP_COLLIDERS, SHIP_INTERACTIONS } from "./game/content/shipLayout";
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
import {
  reserveExpeditionItems,
  rollbackExpeditionReservation,
  settleExpeditionReservation,
  type ExpeditionReservation,
} from "./game/mission/ExpeditionReservation";
import { evaluateItemForGate } from "./game/mission/gateEvaluator";
import { MissionSessionController } from "./game/mission/MissionSession";
import type { ExpeditionManifest } from "./game/mission/expeditionTypes";
import { CREW_DEFINITIONS } from "./game/squad/squadTypes";
import { FixedStepRunner } from "./game/simulation/FixedStepRunner";
import { GameSimulation } from "./game/simulation/GameSimulation";
import {
  createInitialGameState,
  INITIAL_PLAYER_POSITION,
  type ActiveModal,
  type VisualSettings,
} from "./game/simulation/GameState";
import { PhysicsWorld } from "./physics/PhysicsWorld";
import { RenderSystem } from "./render/app/RenderSystem";
import { ExpeditionPanel } from "./ui/ExpeditionPanel";
import { Hud } from "./ui/Hud";
import { MissionResultPanel } from "./ui/MissionResultPanel";

declare global {
  interface Window {
    __LOWPASS_DEBUG__?: {
      snapshot(): ReturnType<typeof createInitialGameState>;
      diagnostics(): {
        world: string;
        physics: ReturnType<PhysicsWorld["getDiagnostics"]> | null;
        render: ReturnType<RenderSystem["getDiagnostics"]> | null;
        domNodes: number;
      };
      teleportForQa(x: number, z: number): void;
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
    SHIP_INVENTORY.map((item) => item.id),
  );
  const planner = new ExpeditionPlanner(state.expedition.draft, gateContext);
  let renderSystem: RenderSystem | null = null;
  let physics: PhysicsWorld | null = null;
  let input: InputController | null = null;
  let expeditionPanel: ExpeditionPanel | null = null;
  let resultPanel: MissionResultPanel | null = null;
  let missionController: MissionSessionController | null = null;
  let activeReservation: ExpeditionReservation | null = null;
  let transitionInFlight = false;
  let appDisposed = false;
  let frameHandle = 0;
  let qaPanel: HTMLElement | null = null;

  const releaseWorldInput = (): void => {
    input?.clearMovement();
    if (document.pointerLockElement) document.exitPointerLock();
  };

  const setModal = (requestedModal: ActiveModal): void => {
    const resultLocked = state.mission.session?.phase === "results";
    const modal = resultLocked && requestedModal === "none"
      ? "mission-result"
      : requestedModal === "expedition" && state.expedition.confirmedManifest
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

    if (modal === "mission-result" && state.mission.lastResult) {
      resultPanel?.show(state.mission.lastResult);
    } else {
      resultPanel?.hide();
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
  resultPanel = new MissionResultPanel(root, () => void returnToShip());

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
      onDeploy: (manifest) => void startFixedMission(manifest),
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
  const activeInput = input;
  const fixedStep = new FixedStepRunner();
  const frameStats = new FrameStats();
  let previousTime = performance.now();
  let lastHudUpdate = 0;
  let interpolationAlpha = 1;
  let handledActivationRevision = 0;
  let gateScanRevision = 0;

  if (new URLSearchParams(window.location.search).has("qa")) {
    qaPanel = createQaNavigation(root, (target) => {
      let position = SHIP_INTERACTIONS.find((interaction) => interaction.id === "expedition-console")?.position;
      if (missionController) {
        if (target === "extract") {
          const extraction = missionController.definition.extractionPoint;
          position = extraction;
          if (!missionController.state.cartAttached) {
            const cart = missionController.getCartPosition();
            const awayX = extraction.x - cart.x;
            const awayZ = extraction.z - cart.z;
            const awayLength = Math.hypot(awayX, awayZ) || 1;
            const offset = Math.min(1.6, missionController.definition.extractionRadius * 0.8);
            position = {
              x: extraction.x + (awayX / awayLength) * offset,
              y: extraction.y,
              z: extraction.z + (awayZ / awayLength) * offset,
            };
          }
        } else if (target === "cart") position = missionController.getCartPosition();
        else position = missionController.definition.salvage.find((resource) => resource.sourceId === target)?.position;
      }
      if (!position) return;
      const playerPosition = { x: position.x, y: 0.93, z: position.z };
      activeInput.clearMovement();
      physics?.teleportCharacter(playerPosition);
      simulation.teleportPlayer(playerPosition);
      if (missionController) simulation.setInteractions(missionController.getInteractions());
    });
  }

  async function startFixedMission(manifest: ExpeditionManifest): Promise<void> {
    if (transitionInFlight || state.world.mode !== "ship" || appDisposed) return;
    transitionInFlight = true;
    setModal("none");
    state.world.mode = "mission-loading";
    state.runtime.mode = "paused";
    releaseWorldInput();
    simulation.setNotice("固定探索マップを読み込んでいます…");

    const reservationId = crypto.randomUUID();
    let reservationCommit: ReturnType<typeof reserveExpeditionItems>;
    try {
      reservationCommit = reserveExpeditionItems(
        manifest,
        state.inventory.itemLocations,
        reservationId,
      );
      state.inventory.itemLocations = reservationCommit.locations;
    } catch (error) {
      state.world.mode = "ship";
      state.runtime.mode = "playing";
      transitionInFlight = false;
      simulation.setNotice(error instanceof Error ? error.message : "遠征装備を予約できませんでした");
      return;
    }

    try {
      const [{ FLOODED_MARKET_MISSION }, { createFloodedMarket }] = await Promise.all([
        import("./game/mission/fixed/floodedMarket"),
        import("./render/objects/createFloodedMarket"),
      ]);
      if (appDisposed) return;
      const sessionId = crypto.randomUUID();
      const nextMissionController = new MissionSessionController(
        FLOODED_MARKET_MISSION,
        manifest,
        sessionId,
        reservationCommit.locations,
      );
      const nextPhysics = await PhysicsWorld.create({
        colliders: FLOODED_MARKET_MISSION.colliders,
        initialPlayerPosition: FLOODED_MARKET_MISSION.playerSpawn,
        kinematicObjects: [{
          id: nextMissionController.state.cartId,
          position: nextMissionController.getCartPosition(),
          halfExtents: { x: 0.58, y: 0.45, z: 0.42 },
          sensor: true,
        }],
      });
      if (appDisposed) {
        nextPhysics.dispose();
        return;
      }

      activeRenderSystem.enterMission((materials) =>
        createFloodedMarket(materials, FLOODED_MARKET_MISSION, manifest, nextMissionController.state),
      );
      physics?.dispose();
      physics = nextPhysics;
      missionController = nextMissionController;
      activeReservation = reservationCommit.reservation;
      state.inventory.itemLocations = nextMissionController.state.itemLocations;
      state.mission.session = nextMissionController.state;
      state.mission.lastResult = null;
      state.world.mode = "mission";
      simulation.teleportPlayer(FLOODED_MARKET_MISSION.playerSpawn);
      simulation.setInteractions(nextMissionController.getInteractions());
      state.runtime.mode = "playing";
      simulation.setNotice(
        `降下完了 // TEAM ${manifest.selectedAgentIds.length} · GEAR ${manifest.items.length}`,
      );
    } catch (error) {
      state.inventory.itemLocations = rollbackExpeditionReservation(reservationCommit.reservation);
      state.world.mode = "ship";
      state.runtime.mode = "playing";
      simulation.setInteractions(SHIP_INTERACTIONS);
      simulation.setNotice(`探索マップの開始に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
      console.error(error);
    } finally {
      transitionInFlight = false;
    }
  }

  async function returnToShip(): Promise<void> {
    if (
      transitionInFlight ||
      !missionController ||
      !activeReservation ||
      !state.mission.lastResult ||
      appDisposed
    ) return;
    transitionInFlight = true;
    state.runtime.mode = "paused";
    releaseWorldInput();
    simulation.setNotice("飛空居住船への帰還シーケンスを開始");
    try {
      const nextPhysics = await PhysicsWorld.create({
        colliders: SHIP_COLLIDERS,
        initialPlayerPosition: INITIAL_PLAYER_POSITION,
      });
      const settledLocations = settleExpeditionReservation(
        activeReservation,
        missionController.state.itemLocations,
        missionController.definition.id,
      );
      activeRenderSystem.returnToShip();
      physics?.dispose();
      physics = nextPhysics;
      missionController.dispose();
      missionController = null;
      activeReservation = null;
      state.inventory.itemLocations = settledLocations;
      state.mission.session = null;
      state.world.mode = "ship";
      state.world.completedExpeditions += 1;
      simulation.teleportPlayer(INITIAL_PLAYER_POSITION);
      simulation.setInteractions(SHIP_INTERACTIONS);
      resultPanel?.hide();
      simulation.setModal("none");
      simulation.setNotice(
        `船内へ帰還しました // ${state.mission.lastResult.outcome.toUpperCase()} · RUN ${state.world.completedExpeditions}`,
      );
    } catch (error) {
      setModal("mission-result");
      simulation.setNotice(`帰還に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
      console.error(error);
    } finally {
      transitionInFlight = false;
    }
  }

  const handleWorldAction = (): void => {
    if (state.interaction.activationRevision === handledActivationRevision) return;
    handledActivationRevision = state.interaction.activationRevision;
    const action = state.interaction.activatedAction;
    if (!action) return;

    if (state.world.mode === "mission" && missionController) {
      const resolution = missionController.handleInteraction(action);
      simulation.setNotice(resolution.notice);
      simulation.setInteractions(missionController.getInteractions());
      if (resolution.result) {
        state.mission.lastResult = resolution.result;
        setModal("mission-result");
      }
      return;
    }

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
    if (commands.pausePressed && state.ui.activeModal !== "mission-result") {
      setModal(state.ui.activeModal === "none" ? "settings" : "none");
    }
    if (commands.debugPressed) hud.toggleDebug();

    let droppedSimulationTime = false;
    const currentPhysics = physics;
    if (state.runtime.mode === "playing" && currentPhysics) {
      const result = fixedStep.advance(frameSeconds, (dt) => {
        const movement = activeInput.sampleMovement(activeRenderSystem.cameraRig.getYaw());
        const physicsSnapshot = currentPhysics.stepCharacter(movement, dt);
        simulation.fixedUpdate(dt, movement, physicsSnapshot);
        if (missionController) {
          missionController.fixedUpdate(dt, state.player.position, state.player.facingYaw);
          currentPhysics.setKinematicObjectPosition(
            missionController.state.cartId,
            missionController.getCartPosition(),
          );
          simulation.setInteractions(missionController.getInteractions());
        }
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
        physics: physics?.getDiagnostics() ?? { colliderCount: 0, collisionCount: 0 },
        expedition: planner.getEvaluation(),
        mission: missionController?.getObjectiveProgress() ?? null,
      });
    }
    frameHandle = requestAnimationFrame(animate);
  };

  window.__LOWPASS_DEBUG__ = {
    snapshot: () => structuredClone(state),
    diagnostics: () => ({
      world: state.world.mode,
      physics: physics?.getDiagnostics() ?? null,
      render: renderSystem?.getDiagnostics() ?? null,
      domNodes: document.querySelectorAll("*").length,
    }),
    teleportForQa: (x, z) => {
      const position = { x, y: 0.93, z };
      activeInput.clearMovement();
      physics?.teleportCharacter(position);
      simulation.teleportPlayer(position);
      if (missionController) simulation.setInteractions(missionController.getInteractions());
    },
  };
  frameHandle = requestAnimationFrame(animate);

  const handleVisibilityChange = (): void => {
    previousTime = performance.now();
    fixedStep.reset();
  };
  const cleanup = (): void => {
    if (appDisposed) return;
    appDisposed = true;
    cancelAnimationFrame(frameHandle);
    activeInput.dispose();
    missionController?.dispose();
    physics?.dispose();
    activeRenderSystem.dispose();
    resultPanel?.dispose();
    qaPanel?.remove();
    delete window.__LOWPASS_DEBUG__;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
  window.addEventListener("beforeunload", cleanup, { once: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function createQaNavigation(
  root: HTMLElement,
  onNavigate: (target: string) => void,
): HTMLElement {
  const panel = document.createElement("aside");
  panel.className = "qa-navigation";
  panel.setAttribute("aria-label", "Phase C QA navigation");
  for (const [target, label] of [
    ["console", "QA 出撃コンソール"],
    ["filter-01", "QA フィルター01"],
    ["filter-02", "QA フィルター02"],
    ["filter-03", "QA フィルター03"],
    ["cooling-coil", "QA 冷却コイル"],
    ["cart", "QA カート"],
    ["extract", "QA 抽出地点"],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => onNavigate(target));
    panel.append(button);
  }
  root.append(panel);
  return panel;
}
