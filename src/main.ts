import "./style.css";
import { FrameStats } from "./diagnostics/FrameStats";
import { measureDomDiagnostics, type DomDiagnostics } from "./diagnostics/DomDiagnostics";
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
import type { MissionSessionController } from "./game/mission/MissionSession";
import type { ExpeditionManifest } from "./game/mission/expeditionTypes";
import { createInsertionPlan, type MissionLaunchOptions } from "./game/insertion/InsertionPlanner";
import { WaypointNavigationService } from "./game/navigation/WaypointNavigationService";
import { DistributedSquadController } from "./game/squad/DistributedSquadController";
import { CREW_DEFINITIONS, type CrewId, type SquadOrderType } from "./game/squad/squadTypes";
import type { ScoutDroneController, ThreatEcologyContext } from "./game/threat/ScoutDroneController";
import type { PorterAndroidController } from "./game/machines/PorterAndroidController";
import type { MachineFeedbackAudio } from "./render/audio/MachineFeedbackAudio";
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
import { SquadFeedbackAudio } from "./render/audio/SquadFeedbackAudio";
import { ExpeditionPanel } from "./ui/ExpeditionPanel";
import { Hud } from "./ui/Hud";
import { MissionResultPanel } from "./ui/MissionResultPanel";
import { SquadPanel } from "./ui/SquadPanel";

declare global {
  interface Window {
    __LOWPASS_DEBUG__?: {
      snapshot(): ReturnType<typeof createInitialGameState>;
      diagnostics(): {
        world: string;
        physics: ReturnType<PhysicsWorld["getDiagnostics"]> | null;
        render: ReturnType<RenderSystem["getDiagnostics"]> | null;
        dom: DomDiagnostics;
        communicationRevision: number;
        threat: {
          activeDroneCount: number;
          mode: string | null;
          transitionRevision: number;
          reportRevision: number;
          deliveryRevision: number;
          pendingReportCount: number;
          firstRetreatAnalysisRevision: number;
          interferenceRevision: number;
        };
        porter: {
          mode: string | null;
          authenticated: boolean;
          carriedItemId: string | null;
          gateEvaluationCodes: readonly string[];
        };
      };
      teleportForQa(x: number, z: number): void;
      setAgentPositionForQa(agentId: CrewId, x: number, z: number): void;
      issueOrderForQa(agentId: CrewId, type: SquadOrderType, zoneId?: string): string;
      switchControlForQa(agentId: CrewId): string;
      deployRelayForQa(): string;
      recoverRelayForQa(): string;
      deployFlareForQa(): string;
      setDronePositionForQa(x: number, z: number, facingYaw?: number): void;
      disableThreatForQa(): string;
      authenticatePorterForQa(): string;
      porterCommandForQa(command: "follow" | "hold" | "carry-to"): string;
      disableRelayForQa(itemInstanceId?: string): string;
      restartRelayForQa(itemInstanceId?: string): string;
      threatReadback(): ReturnType<ScoutDroneController["getDebugReadback"]> | null;
    };
  }
}

const mount = document.querySelector<HTMLElement>("#app");
if (!mount) throw new Error("#app mount element is missing");

void bootstrap(mount);

async function bootstrap(root: HTMLElement): Promise<void> {
  const state = createInitialGameState();
  const query = new URLSearchParams(window.location.search);
  const audioEnabled = query.get("audio") !== "muted";
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
  let squadController: DistributedSquadController | null = null;
  let threatController: ScoutDroneController | null = null;
  let porterController: PorterAndroidController | null = null;
  let machineAudio: MachineFeedbackAudio | null = null;
  let activeReservation: ExpeditionReservation | null = null;
  let transitionInFlight = false;
  let appDisposed = false;
  let frameHandle = 0;
  let qaPanel: HTMLElement | null = null;
  let ecologyRefreshAccumulator = 0;
  let cachedEcologyContext: ThreatEcologyContext | null = null;
  let porterWasAuthenticated = false;

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
  const squadAudio = new SquadFeedbackAudio(audioEnabled);
  resultPanel = new MissionResultPanel(root, () => void returnToShip());

  const refreshMissionInteractions = (): void => {
    if (!missionController) return;
    simulation.setInteractions([
      ...missionController.getInteractions(),
      ...(squadController?.getInteractions() ?? []),
      ...(threatController?.getInteractions() ?? []),
      ...(porterController?.getInteractions(missionController.getResourceItemId("cooling-coil")) ?? []),
    ]);
  };

  const setSquadNotice = (message: string): void => {
    simulation.setNotice(message);
    refreshMissionInteractions();
  };

  const issueSquadOrder = (agentId: CrewId, type: SquadOrderType, zoneId: string | null): string => {
    if (!squadController) return "分隊セッションがありません";
    const zone = squadController.definition.searchZones.find((candidate) => candidate.id === zoneId);
    const result = squadController.issueOrder(agentId, {
      type,
      ...(type === "search-zone" && zoneId ? { targetZoneId: zoneId } : {}),
      ...(type === "move-to" && zone ? { targetPosition: zone.entrance } : {}),
    }, state.runtime.elapsedSeconds);
    squadAudio.play(result.accepted);
    setSquadNotice(`${result.code} // ${result.reason}`);
    return result.code;
  };

  const switchControlledAgent = (agentId: CrewId): string => {
    if (!squadController || !physics) return "分隊セッションがありません";
    releaseWorldInput();
    const previousMode = state.runtime.mode;
    state.runtime.mode = "paused";
    const attempt = squadController.attemptControlSwitch(
      agentId,
      transitionInFlight || state.ui.activeModal !== "none" || Boolean(missionController?.state.cartAttached),
    );
    if (attempt.resolution.accepted && attempt.nextPosition) {
      physics.teleportCharacter(attempt.nextPosition);
      simulation.teleportPlayer(attempt.nextPosition);
      activeRenderSystem.rebindControlledAgent();
    }
    squadAudio.play(attempt.resolution.accepted);
    state.runtime.mode = previousMode;
    setSquadNotice(`${attempt.resolution.code} // ${attempt.resolution.reason}`);
    return attempt.resolution.code;
  };

  const runEquipmentAction = (action: "deploy-relay" | "recover-relay" | "flare"): string => {
    if (!squadController) return "分隊セッションがありません";
    const result = action === "deploy-relay"
      ? squadController.deployRelay()
      : action === "recover-relay"
        ? squadController.recoverRelay()
        : squadController.deployFlare(state.runtime.elapsedSeconds);
    squadAudio.play(result.accepted);
    setSquadNotice(`${result.code} // ${result.reason}`);
    return result.code;
  };

  const runThreatDisable = (): string => {
    if (!threatController || !squadController || !physics) return "脅威接触セッションがありません";
    const controlledId = squadController.state.control.controlledAgentId;
    const result = threatController.attemptDisable(
      controlledId,
      squadController.getControlledPosition(),
      squadController.hasHeldItemDefinition(controlledId, "field-terminal"),
      state.runtime.elapsedSeconds,
      (from, to) => physics?.hasLineOfSight(from, to) ?? false,
    );
    squadAudio.play(result.accepted);
    setSquadNotice(`${result.code} // ${result.reason}`);
    return result.code;
  };

  const porterAuthenticationContext = () => {
    if (!squadController || !missionController) return null;
    const controlledId = squadController.state.control.controlledAgentId;
    const controlled = squadController.state.agents[controlledId];
    if (!controlled) return null;
    return {
      agentId: controlledId,
      position: squadController.getControlledPosition(),
      operable: controlled.controlMode !== "incapacitated",
      hasFieldTerminal: squadController.hasHeldItemDefinition(controlledId, "field-terminal"),
      exclusiveOperationActive: missionController.state.cartAttached,
    };
  };

  const runPorterAuthentication = (): string => {
    const context = porterAuthenticationContext();
    if (!porterController || !context) return "PORTER_SESSION_MISSING";
    const result = porterController.beginAuthentication(context, state.runtime.elapsedSeconds);
    squadAudio.play(result.accepted);
    setSquadNotice(`${result.code} // ${result.reason}`);
    return result.code;
  };

  const runPorterCommand = (command: "follow" | "hold" | "carry-to"): string => {
    if (!porterController || !squadController || !missionController) return "PORTER_SESSION_MISSING";
    const result = porterController.issueCommand(
      command,
      squadController.state.control.controlledAgentId,
      state.runtime.elapsedSeconds,
      missionController.getResourceItemId("cooling-coil"),
      missionController.definition.extractionPoint,
    );
    squadAudio.play(result.accepted);
    setSquadNotice(`${result.code} // ${result.reason}`);
    return result.code;
  };

  const squadPanel = new SquadPanel(root, {
    onOrder: issueSquadOrder,
    onSwitchControl: switchControlledAgent,
    onDeployRelay: () => { runEquipmentAction("deploy-relay"); },
    onRecoverRelay: () => { runEquipmentAction("recover-relay"); },
    onDeployFlare: () => { runEquipmentAction("flare"); },
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

  const configureQaPhaseDLoadout = (): void => {
    if (state.expedition.confirmedManifest) {
      simulation.setNotice("QAプリセットは確定前ドラフトでのみ使用できます");
      return;
    }
    const desiredAssignments = [
      ["radio-02", "mara"],
      ["relay-01", "player"],
      ["terminal-01", "player"],
      ["crowbar-01", "player"],
    ] as const;
    runPlannerAction(() => {
      const draft = planner.getDraftSnapshot();
      for (const [itemId, agentId] of desiredAssignments) {
        if (!draft.itemInstanceIds.includes(itemId)) planner.assignItem(itemId, agentId);
      }
    });
    simulation.setNotice("QA PHASE D LOADOUT // 28U READY");
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
      onDeploy: (manifest, options) => void startFixedMission(manifest, options),
    },
  );

  try {
    renderSystem = new RenderSystem(root, (message) => simulation.setNotice(message), audioEnabled);
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

  if (query.has("qa")) {
    qaPanel = createQaNavigation(root, (target) => {
      if (target === "phase-d-loadout") {
        configureQaPhaseDLoadout();
        return;
      }
      if (target === "isolate-contact" && squadController && threatController) {
        const isolated = { x: 3.45, y: 0.93, z: -3.5 };
        squadController.setAgentPositionForQa("player", isolated);
        squadController.setAgentPositionForQa("mara", { x: -6, y: 0.93, z: 6 });
        squadController.setAgentPositionForQa("ito", { x: -5.5, y: 0.93, z: 6 });
        threatController.armIsolatedContactForQa(
          { x: 3.45, y: threatController.definition.cruiseAltitude, z: -4.65 },
          state.runtime.elapsedSeconds,
          Math.PI,
        );
        physics?.teleportCharacter(isolated);
        simulation.teleportPlayer(isolated);
        simulation.setNotice("QA // ISOLATED CONTACT CONFIGURED");
        return;
      }
      if (target === "reinforce-contact" && squadController) {
        const targetAgent = squadController.state.agents.player;
        if (targetAgent) squadController.setAgentPositionForQa("mara", { ...targetAgent.position, x: targetAgent.position.x - 0.7 });
        simulation.setNotice("QA // ALLIED REINFORCEMENT ARRIVED");
        return;
      }
      if (target === "withdraw-contact" && squadController) {
        squadController.setAgentPositionForQa("mara", { x: -6, y: 0.93, z: 6 });
        simulation.setNotice("QA // ALLIED REINFORCEMENT WITHDREW");
        return;
      }
      if (target === "deploy-relay") {
        runEquipmentAction("deploy-relay");
        return;
      }
      if (target === "disable-relay" && squadController) {
        const result = squadController.disableRelay("relay-01", state.runtime.elapsedSeconds);
        setSquadNotice(`${result.code} // ${result.reason}`);
        return;
      }
      if (target === "restart-relay" && squadController) {
        const result = squadController.beginRelayRestart("relay-01", state.runtime.elapsedSeconds);
        setSquadNotice(`${result.code} // ${result.reason}`);
        return;
      }
      if (target === "porter-auth") {
        const position = porterController?.state.position;
        if (position) {
          physics?.teleportCharacter(position);
          simulation.teleportPlayer(position);
          squadController?.setAgentPositionForQa(squadController.state.control.controlledAgentId, position);
        }
        runPorterAuthentication();
        return;
      }
      if (target === "porter-carry") {
        runPorterCommand("carry-to");
        return;
      }
      let position = SHIP_INTERACTIONS.find((interaction) => interaction.id === "expedition-console")?.position;
      if (missionController) {
        if (target === "extract") position = missionController.definition.extractionPoint;
        else if (target === "cart") position = missionController.getCartPosition();
        else if (target === "drone") position = threatController?.state.drone.position;
        else if (target === "porter") position = porterController?.state.position;
        else position = missionController.definition.salvage.find((resource) => resource.sourceId === target)?.position
          ?? missionController.definition.searchZones.find((zone) => zone.id === target)?.entrance
          ?? missionController.definition.toolShortcuts.find((shortcut) => shortcut.id === target)?.interactionPosition;
      }
      if (!position) return;
      const playerPosition = { x: position.x, y: 0.93, z: position.z };
      activeInput.clearMovement();
      physics?.teleportCharacter(playerPosition);
      simulation.teleportPlayer(playerPosition);
      refreshMissionInteractions();
    });
  }

  async function startFixedMission(manifest: ExpeditionManifest, launchOptions: MissionLaunchOptions): Promise<void> {
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
      const [
        { FLOODED_MARKET_MISSION },
        { createFloodedMarket },
        { ScoutDroneController: DynamicScoutDroneController },
        { PorterAndroidController: DynamicPorterAndroidController },
        { MachineFeedbackAudio: DynamicMachineFeedbackAudio },
        { MissionSessionController: DynamicMissionSessionController },
      ] = await Promise.all([
        import("./game/mission/fixed/floodedMarket"),
        import("./render/objects/createFloodedMarket"),
        import("./game/threat/ScoutDroneController"),
        import("./game/machines/PorterAndroidController"),
        import("./render/audio/MachineFeedbackAudio"),
        import("./game/mission/MissionSession"),
      ]);
      if (appDisposed) return;
      const sessionId = crypto.randomUUID();
      const navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
      const insertionPlan = createInsertionPlan(
        manifest,
        launchOptions.insertionMode,
        launchOptions.insertionSeed,
        {
          missionId: FLOODED_MARKET_MISSION.id,
          extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
          anchors: FLOODED_MARKET_MISSION.insertionAnchors,
          presets: FLOODED_MARKET_MISSION.insertionPresets,
          colliders: FLOODED_MARKET_MISSION.colliders,
          navigation,
        },
      );
      const nextMissionController = new DynamicMissionSessionController(
        FLOODED_MARKET_MISSION,
        manifest,
        sessionId,
        reservationCommit.locations,
      );
      const nextSquadController = new DistributedSquadController(
        FLOODED_MARKET_MISSION,
        manifest,
        insertionPlan,
        nextMissionController.state.itemLocations,
      );
      const nextThreatController = new DynamicScoutDroneController(
        FLOODED_MARKET_MISSION.threatEncounter,
        manifest.selectedAgentIds,
        nextSquadController.navigation,
        state.runtime.elapsedSeconds,
        query.get("drones") === "2" ? 2 : 1,
      );
      const nextPorterController = new DynamicPorterAndroidController(
        FLOODED_MARKET_MISSION.porterAndroid,
        nextSquadController.navigation,
        {
          missionId: FLOODED_MARKET_MISSION.id,
          itemLocations: nextMissionController.state.itemLocations,
          transferResourceToMachine: (itemId, machineId) => nextMissionController.transferResourceToMachine(itemId, machineId),
          placeMachineResourceAtExtraction: (itemId, machineId) => nextMissionController.placeMachineResourceAtExtraction(itemId, machineId),
          placeMachineResourceSafely: (itemId, machineId, position) => nextMissionController.placeMachineResourceSafely(itemId, machineId, position),
        },
        state.runtime.elapsedSeconds,
      );
      const controlledSpawn = nextSquadController.getControlledPosition();
      const controlledPlacement = insertionPlan.placements.find(
        (placement) => placement.agentId === nextSquadController.state.control.controlledAgentId,
      );
      const nextPhysics = await PhysicsWorld.create({
        colliders: FLOODED_MARKET_MISSION.colliders,
        initialPlayerPosition: controlledSpawn,
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

      activeRenderSystem.enterMission(
        (materials) => createFloodedMarket(
          materials,
          FLOODED_MARKET_MISSION,
          manifest,
          nextMissionController.state,
          nextSquadController.state,
          nextThreatController.state,
          nextPorterController.state,
        ),
        controlledPlacement
          ? { playerPosition: controlledPlacement.position, cameraPosition: controlledPlacement.cameraPosition }
          : undefined,
      );
      physics?.dispose();
      physics = nextPhysics;
      missionController = nextMissionController;
      squadController = nextSquadController;
      threatController = nextThreatController;
      porterController = nextPorterController;
      machineAudio?.dispose();
      machineAudio = new DynamicMachineFeedbackAudio(audioEnabled);
      activeReservation = reservationCommit.reservation;
      state.inventory.itemLocations = nextMissionController.state.itemLocations;
      state.mission.session = nextMissionController.state;
      state.mission.squad = nextSquadController.state;
      state.mission.threat = nextThreatController.state;
      state.mission.porter = nextPorterController.state;
      state.mission.lastResult = null;
      ecologyRefreshAccumulator = 0.2;
      cachedEcologyContext = null;
      porterWasAuthenticated = false;
      state.world.mode = "mission";
      simulation.teleportPlayer(controlledSpawn);
      refreshMissionInteractions();
      state.runtime.mode = "playing";
      simulation.setNotice(
        `降下完了 // ${insertionPlan.mode.toUpperCase()} · TEAM ${manifest.selectedAgentIds.length} · GEAR ${manifest.items.length}`,
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
      squadController?.dispose();
      squadController = null;
      threatController?.dispose();
      threatController = null;
      porterController?.dispose();
      porterController = null;
      machineAudio?.dispose();
      machineAudio = null;
      cachedEcologyContext = null;
      activeReservation = null;
      state.inventory.itemLocations = settledLocations;
      state.mission.session = null;
      state.mission.squad = null;
      state.mission.threat = null;
      state.mission.porter = null;
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
      if (action.type === "mission-shortcut" && squadController) {
        const shortcut = squadController.definition.toolShortcuts.find((candidate) => candidate.id === action.shortcutId);
        const resolution = squadController.openShortcut(action.shortcutId);
        if (resolution.accepted && shortcut) physics?.setWorldColliderEnabled(shortcut.colliderId, false);
        setSquadNotice(`${resolution.code} // ${resolution.reason}`);
        return;
      }
      if (action.type === "mission-threat-disable" && threatController && action.threatId === threatController.state.drone.id) {
        runThreatDisable();
        return;
      }
      if (action.type === "mission-relay-restart" && squadController) {
        const resolution = squadController.beginRelayRestart(action.itemInstanceId, state.runtime.elapsedSeconds);
        setSquadNotice(`${resolution.code} // ${resolution.reason}`);
        return;
      }
      if (action.type === "mission-porter-auth" && porterController && action.machineId === porterController.state.id) {
        runPorterAuthentication();
        return;
      }
      if (action.type === "mission-porter-command" && porterController && action.machineId === porterController.state.id) {
        runPorterCommand(action.command);
        return;
      }
      if (action.type === "mission-extract") {
        const machineOutcome = porterController?.getOutcome();
        missionController.setAlliedMachineOutcomes(machineOutcome ? [machineOutcome] : []);
      }
      const resolution = missionController.handleInteraction(
        action,
        squadController?.state.control.controlledAgentId ?? "player",
      );
      simulation.setNotice(resolution.notice);
      refreshMissionInteractions();
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
          squadController?.fixedUpdate(dt, state.player.position, state.runtime.elapsedSeconds, state.player.facingYaw);
          if (squadController && porterController) {
            porterController.fixedUpdate(
              dt,
              state.runtime.elapsedSeconds,
              porterAuthenticationContext(),
              squadController.getAgentPositions(),
            );
            squadController.setFriendlyMachineVoiceNode(
              porterController.state.id,
              porterController.state.position,
              porterController.state.authenticated,
            );
            if (porterController.state.authenticated && !porterWasAuthenticated) {
              porterWasAuthenticated = true;
              machineAudio?.playPorterAuthenticated();
              simulation.setNotice("PORTER AUTHORIZED // SHORT-RANGE VOICE NODE ONLINE");
            }
          }
          if (squadController && threatController) {
            ecologyRefreshAccumulator += dt;
            if (!cachedEcologyContext || ecologyRefreshAccumulator >= 0.2) {
              ecologyRefreshAccumulator %= 0.2;
              const activeSession = missionController;
              const activeSquad = squadController;
              cachedEcologyContext = {
                extractionPoint: activeSession.definition.extractionPoint,
                stimuli: Object.values(activeSquad.state.signals.beacons).map((beacon) => ({
                  id: beacon.id,
                  kind: "flare" as const,
                  position: { ...beacon.position },
                  active: beacon.expiresAtSeconds > state.runtime.elapsedSeconds,
                })),
                relays: activeSquad.state.deployedRelayItemIds.flatMap((itemId) => {
                  const location = activeSession.state.itemLocations[itemId];
                  if (location?.kind !== "mission-ground") return [];
                  return [{
                    id: itemId,
                    kind: "relay" as const,
                    position: { ...location.position },
                    active: true,
                    disabled: activeSquad.isRelayDisabled(itemId),
                  }];
                }),
                friendlyMachine: porterController?.state ?? null,
                onInterdict: (targetAgentId) => {
                  const target = activeSquad.state.agents[targetAgentId];
                  if (!target) return;
                  const pulse = activeSession.applyInterference(targetAgentId, target.position, state.runtime.elapsedSeconds);
                  activeSquad.applyInterference(targetAgentId, pulse.communicationLimitedUntilSeconds);
                  if (activeSquad.state.control.controlledAgentId === targetAgentId) {
                    state.interaction.activatedAction = null;
                    input?.clearMovement();
                  }
                  porterController?.interruptExclusiveOperation(targetAgentId, state.runtime.elapsedSeconds);
                  simulation.setNotice(`INTERFERENCE PULSE // ${targetAgentId.toUpperCase()} · COMMS BURST 8 SEC`);
                },
                onRelaySabotage: (relayItemId) => {
                  const result = activeSquad.disableRelay(relayItemId, state.runtime.elapsedSeconds);
                  simulation.setNotice(`${result.code} // ${result.reason}`);
                },
              };
            }
            threatController.fixedUpdate(
              dt,
              state.runtime.elapsedSeconds,
              squadController.state,
              (from, to) => currentPhysics.hasLineOfSight(from, to),
              (sourceId, targetId) => squadController?.getCommunicationStatus(sourceId, targetId) ?? {
                band: "none",
                localInstructionAllowed: false,
              },
              cachedEcologyContext,
            );
            machineAudio?.update(
              threatController.state.drone.mode,
              threatController.state.drone.lockOnProgress,
              state.runtime.elapsedSeconds,
            );
          }
          currentPhysics.setKinematicObjectPosition(
            missionController.state.cartId,
            missionController.getCartPosition(),
          );
          refreshMissionInteractions();
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
        physics: physics?.getDiagnostics() ?? { rigidBodyCount: 0, colliderCount: 0, collisionCount: 0 },
        expedition: planner.getEvaluation(),
        mission: missionController?.getObjectiveProgress() ?? null,
        dom: measureDomDiagnostics(),
      });
      if (squadController && threatController && porterController) {
        const availableFlareCount = squadController.manifest.items.filter((item) =>
          item.definitionId === "flare-pack" && missionController?.state.itemLocations[item.instanceId]?.kind === "crew",
        ).length;
        squadPanel.update({
          state: squadController.state,
          definition: squadController.definition,
          hasFieldTerminal: squadController.hasFieldTerminal(),
          availableFlareCount,
          threat: threatController.state,
          elapsedSeconds: state.runtime.elapsedSeconds,
          porter: porterController.state,
        });
      } else {
        squadPanel.update(null);
      }
    }
    frameHandle = requestAnimationFrame(animate);
  };

  window.__LOWPASS_DEBUG__ = {
    snapshot: () => structuredClone(state),
    diagnostics: () => ({
      world: state.world.mode,
      physics: physics?.getDiagnostics() ?? null,
      render: renderSystem?.getDiagnostics() ?? null,
      dom: measureDomDiagnostics(),
      communicationRevision: squadController?.state.communicationRevision ?? 0,
      threat: {
        activeDroneCount: threatController?.getActiveDroneCount() ?? 0,
        mode: threatController?.state.drone.mode ?? null,
        transitionRevision: threatController?.state.drone.transitionRevision ?? 0,
        reportRevision: threatController?.state.reportRevision ?? 0,
        deliveryRevision: threatController?.state.deliveryRevision ?? 0,
        pendingReportCount: threatController?.getPendingReportCount() ?? 0,
        firstRetreatAnalysisRevision: threatController?.state.firstRetreatAnalysisRevision ?? 0,
        interferenceRevision: threatController?.state.interferenceRevision ?? 0,
      },
      porter: {
        mode: porterController?.state.mode ?? null,
        authenticated: porterController?.state.authenticated ?? false,
        carriedItemId: porterController?.state.carriedItemId ?? null,
        gateEvaluationCodes: porterController?.state.gateEvaluationCodes ?? [],
      },
    }),
    teleportForQa: (x, z) => {
      const position = { x, y: 0.93, z };
      activeInput.clearMovement();
      physics?.teleportCharacter(position);
      simulation.teleportPlayer(position);
      refreshMissionInteractions();
    },
    setAgentPositionForQa: (agentId, x, z) => {
      squadController?.setAgentPositionForQa(agentId, { x, y: 0.93, z });
      if (squadController?.state.control.controlledAgentId === agentId) {
        const position = { x, y: 0.93, z };
        physics?.teleportCharacter(position);
        simulation.teleportPlayer(position);
      }
    },
    issueOrderForQa: (agentId, type, zoneId) => issueSquadOrder(agentId, type, zoneId ?? null),
    switchControlForQa: switchControlledAgent,
    deployRelayForQa: () => runEquipmentAction("deploy-relay"),
    recoverRelayForQa: () => runEquipmentAction("recover-relay"),
    deployFlareForQa: () => runEquipmentAction("flare"),
    setDronePositionForQa: (x, z, facingYaw) => {
      threatController?.setDronePositionForQa({ x, y: threatController.definition.cruiseAltitude, z }, facingYaw);
      refreshMissionInteractions();
    },
    disableThreatForQa: runThreatDisable,
    authenticatePorterForQa: runPorterAuthentication,
    porterCommandForQa: runPorterCommand,
    disableRelayForQa: (itemInstanceId = "relay-01") => {
      const result = squadController?.disableRelay(itemInstanceId, state.runtime.elapsedSeconds);
      refreshMissionInteractions();
      return result?.code ?? "SQUAD_SESSION_MISSING";
    },
    restartRelayForQa: (itemInstanceId = "relay-01") => {
      const result = squadController?.beginRelayRestart(itemInstanceId, state.runtime.elapsedSeconds);
      refreshMissionInteractions();
      return result?.code ?? "SQUAD_SESSION_MISSING";
    },
    threatReadback: () => threatController?.getDebugReadback(
      squadController?.state.control.controlledAgentId ?? "player",
    ) ?? null,
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
    squadController?.dispose();
    threatController?.dispose();
    porterController?.dispose();
    machineAudio?.dispose();
    physics?.dispose();
    activeRenderSystem.dispose();
    resultPanel?.dispose();
    squadPanel.dispose();
    squadAudio.dispose();
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
  panel.setAttribute("aria-label", "Phase E QA navigation");
  for (const [target, label] of [
    ["phase-d-loadout", "QA Phase D 28U"],
    ["console", "QA 出撃コンソール"],
    ["filter-01", "QA フィルター01"],
    ["filter-02", "QA フィルター02"],
    ["filter-03", "QA フィルター03"],
    ["cooling-coil", "QA 冷却コイル"],
    ["cart", "QA カート"],
    ["sales", "QA 売場"],
    ["cooling", "QA 冷却室"],
    ["underground", "QA 地下"],
    ["cooling-gate", "QA 短縮ゲート"],
    ["drone", "QA SCOUT DRONE"],
    ["porter", "QA PORTER"],
    ["isolate-contact", "QA ISOLATE"],
    ["reinforce-contact", "QA REINFORCE"],
    ["withdraw-contact", "QA WITHDRAW"],
    ["deploy-relay", "QA RELAY DEPLOY"],
    ["disable-relay", "QA RELAY DISABLE"],
    ["restart-relay", "QA RELAY RESTART"],
    ["porter-auth", "QA PORTER AUTH"],
    ["porter-carry", "QA PORTER CARRY"],
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
