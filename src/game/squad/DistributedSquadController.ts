import { communicationBandRank, CommunicationGraph } from "../communication/CommunicationGraph";
import type { CommunicationBand } from "../communication/communicationTypes";
import type { AgentCommunicationStatus } from "../communication/communicationTypes";
import { copyVec3, distanceSquared, type Vec3 } from "../core/types";
import type { InsertionPlan } from "../insertion/InsertionPlanner";
import type { InteractionDefinition } from "../interaction/interactionTypes";
import type { ItemLocationLedger } from "../items/itemLocation";
import { KnowledgeService } from "../knowledge/KnowledgeService";
import type { KnowledgeEntry } from "../knowledge/knowledgeTypes";
import type { FixedMissionDefinition, SearchZoneDefinition } from "../mission/fixedMissionTypes";
import type { ExpeditionManifest } from "../mission/expeditionTypes";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import type { NavigationPathResult } from "../navigation/navigationTypes";
import { SignalBeaconService, type FlareDeploymentResult } from "../signals/SignalBeaconService";
import { commitControlSwitch, evaluateControlSwitch } from "./SquadControl";
import type {
  AgentOrderRuntime,
  AgentRuntimeState,
  ControlSwitchResolution,
  CrewId,
  DistributedSquadState,
  SquadCommandResolution,
  SquadOrder,
  SquadOrderType,
} from "./squadTypes";

const COMMUNICATION_INTERVAL_SECONDS = 0.25;
const AUTONOMOUS_SPEED = 1.85;
const WAYPOINT_RADIUS = 0.28;
const RELAY_RESTART_SECONDS = 1.5;

export interface SquadOrderRequest {
  readonly type: SquadOrderType;
  readonly targetPosition?: Vec3;
  readonly targetZoneId?: string;
  readonly targetBeaconId?: string;
}

export interface ControlSwitchAttempt {
  readonly resolution: ControlSwitchResolution;
  readonly nextPosition: Vec3 | null;
}

export interface EquipmentActionResolution {
  readonly accepted: boolean;
  readonly code: string;
  readonly reason: string;
  readonly itemInstanceId: string | null;
}

export class DistributedSquadController {
  readonly state: DistributedSquadState;
  readonly navigation: WaypointNavigationService;
  private readonly communication: CommunicationGraph;
  private readonly knowledge: KnowledgeService;
  private readonly signals = new SignalBeaconService();
  private readonly itemLocations: ItemLocationLedger;
  private readonly itemDefinitionByInstanceId = new Map<string, string>();
  private communicationAccumulator = COMMUNICATION_INTERVAL_SECONDS;
  private orderSequence = 0;
  private disposed = false;

  constructor(
    readonly definition: FixedMissionDefinition,
    readonly manifest: ExpeditionManifest,
    insertionPlan: InsertionPlan,
    itemLocations: ItemLocationLedger,
  ) {
    this.itemLocations = itemLocations;
    this.navigation = new WaypointNavigationService(definition.navigation);
    this.communication = new CommunicationGraph(definition.signalZones);
    this.knowledge = new KnowledgeService(manifest.selectedAgentIds);
    for (const item of manifest.items) this.itemDefinitionByInstanceId.set(item.instanceId, item.definitionId);

    const controlledAgentId = manifest.selectedAgentIds.includes("player") ? "player" : manifest.fieldLeadId;
    const agents: Record<string, AgentRuntimeState> = {};
    for (const placement of insertionPlan.placements) {
      agents[placement.agentId] = {
        id: placement.agentId,
        position: copyVec3(placement.position),
        facingYaw: 0,
        controlMode: placement.agentId === controlledAgentId ? "player-controlled" : "autonomous",
        currentOrder: null,
        lastCompletedOrderType: null,
        statusLabel: placement.agentId === controlledAgentId ? "PLAYER CONTROL" : "HOLD // INSERTED",
        lastKnownPosition: copyVec3(placement.position),
        communicationBand: placement.agentId === controlledAgentId ? "telemetry" : "none",
        communicationQuality: placement.agentId === controlledAgentId ? 1 : 0,
        localInstructionAllowed: placement.agentId === controlledAgentId,
      };
    }
    this.state = {
      insertionMode: insertionPlan.mode,
      insertionSeed: insertionPlan.seed,
      insertionPlan,
      agents,
      control: {
        fieldLeadAgentId: manifest.fieldLeadId,
        controlledAgentId,
        switchInProgress: false,
      },
      lostContactPolicy: "finish-order-then-hold",
      communicationEvaluatedAtSeconds: 0,
      communicationRevision: 0,
      knowledge: this.knowledge.state,
      signals: this.signals.state,
      rallyObjective: {
        id: "REESTABLISH_THE_CREW",
        label: "REESTABLISH THE CREW",
        active: insertionPlan.mode !== "stable",
        achieved: insertionPlan.mode === "stable",
        radius: 2.35,
        requiredHoldSeconds: 2,
        heldSeconds: 0,
        progress: insertionPlan.mode === "stable" ? 1 : 0,
      },
      deployedRelayItemIds: [],
      disabledRelayItemIds: [],
      relayRestartByItemId: {},
      interferenceUntilByAgentId: {},
      friendlyMachineVoiceNodes: {},
      shortcutOpenById: Object.fromEntries(definition.toolShortcuts.map((shortcut) => [shortcut.id, false])),
      feedback: { revision: 0, code: "INSERTION_COMPLETE", message: `${insertionPlan.mode.toUpperCase()}配置で降下しました` },
    };
    this.evaluateCommunication(0);
    this.communicationAccumulator = 0;
  }

  fixedUpdate(dt: number, controlledPosition: Vec3, elapsedSeconds: number, controlledFacingYaw?: number): void {
    this.assertActive();
    const controlled = this.state.agents[this.state.control.controlledAgentId];
    if (controlled) {
      controlled.position = copyVec3(controlledPosition);
      controlled.lastKnownPosition = copyVec3(controlledPosition);
      if (controlledFacingYaw !== undefined) controlled.facingYaw = controlledFacingYaw;
    }
    for (const agent of Object.values(this.state.agents)) {
      if (agent.controlMode !== "autonomous") continue;
      this.updateAutonomousAgent(agent, dt, elapsedSeconds);
    }
    this.updateRallyObjective(dt);
    this.updateInterferenceAndRelayRestart(elapsedSeconds);
    this.communicationAccumulator += dt;
    if (this.communicationAccumulator >= COMMUNICATION_INTERVAL_SECONDS) {
      this.communicationAccumulator %= COMMUNICATION_INTERVAL_SECONDS;
      this.evaluateCommunication(elapsedSeconds);
      this.signals.update(elapsedSeconds, this.getAgentPositions());
    }
  }

  issueOrder(recipientId: CrewId, request: SquadOrderRequest, elapsedSeconds: number): SquadCommandResolution {
    this.assertActive();
    const recipient = this.state.agents[recipientId];
    if (!recipient) return this.rejectOrder("UNKNOWN_AGENT", "対象隊員は遠征に参加していません");
    if (recipient.controlMode === "incapacitated") return this.rejectOrder("TARGET_INCAPACITATED", "対象隊員は行動不能です");
    if (request.type === "search-zone" && !this.findSearchZone(request.targetZoneId ?? null)) {
      return this.rejectOrder("NO_SEARCH_ZONE", "探索区域が見つかりません");
    }
    const rallyBeacon = request.type === "rally" ? this.signals.getActiveBeacon(request.targetBeaconId) : null;
    if (request.type === "rally" && !rallyBeacon) {
      return this.rejectOrder("NO_ACTIVE_BEACON", "有効なフレア信号がありません");
    }
    const senderId = this.state.control.controlledAgentId;
    const visualRallyAccepted = Boolean(rallyBeacon?.recognizedByAgentIds.includes(recipientId));
    if (
      recipientId !== senderId &&
      !recipient.localInstructionAllowed &&
      communicationBandRank(recipient.communicationBand) < 2 &&
      !visualRallyAccepted
    ) {
      return this.rejectOrder("COMMUNICATION_INSUFFICIENT", "命令送信には近距離指示またはvoice以上の通信が必要です");
    }

    const order = this.createOrder(senderId, recipientId, request, elapsedSeconds);
    const runtime = this.createOrderRuntime(recipient, order);
    if (runtime instanceof Error) return this.rejectOrder("NO_NAVIGATION_PATH", runtime.message);
    recipient.currentOrder = runtime;
    recipient.statusLabel = `ORDER // ${order.type.toUpperCase()}`;
    this.setFeedback("ORDER_ACCEPTED", `${recipientId}が${order.type}命令を受領しました`);
    return { accepted: true, code: "ORDER_ACCEPTED", reason: "命令を受領しました", orderId: order.id };
  }

  attemptControlSwitch(targetAgentId: CrewId, exclusiveOperationActive: boolean): ControlSwitchAttempt {
    this.assertActive();
    const target = this.state.agents[targetAgentId];
    const controlled = this.state.agents[this.state.control.controlledAgentId];
    const localSwitchAllowed = Boolean(
      target && controlled && distanceSquared(target.position, controlled.position) <= 2.4 ** 2,
    );
    const resolution = evaluateControlSwitch(this.state.control, this.state.agents, targetAgentId, {
      hasFieldTerminal: this.hasFieldTerminal(),
      communicationBand: target?.communicationBand ?? "none",
      localSwitchAllowed,
      exclusiveOperationActive,
    });
    if (!resolution.accepted || !target || !controlled) {
      this.setFeedback(resolution.code, resolution.reason);
      return { resolution, nextPosition: null };
    }
    const previousId = controlled.id;
    const previousHadOrder = Boolean(controlled.currentOrder);
    commitControlSwitch(this.state.control, this.state.agents, targetAgentId);
    if (!previousHadOrder) {
      const holdOrder = this.createOrder(targetAgentId, previousId, { type: "hold" }, this.state.communicationEvaluatedAtSeconds);
      controlled.currentOrder = this.createOrderRuntime(controlled, holdOrder) as AgentOrderRuntime;
    }
    this.setFeedback("CONTROL_SWITCHED", `${targetAgentId}へ操作を切り替えました`);
    return { resolution, nextPosition: copyVec3(target.position) };
  }

  deployRelay(): EquipmentActionResolution {
    const controlled = this.requireControlledAgent();
    const relayId = this.findHeldItem(controlled.id, "portable-relay");
    if (!relayId) return this.rejectEquipment("NO_PORTABLE_RELAY", "設置可能な携帯リレーがありません");
    this.itemLocations[relayId] = { kind: "mission-ground", position: copyVec3(controlled.position) };
    if (!this.state.deployedRelayItemIds.includes(relayId)) this.state.deployedRelayItemIds.push(relayId);
    this.evaluateCommunication(this.state.communicationEvaluatedAtSeconds);
    this.setFeedback("RELAY_DEPLOYED", `${relayId}を通信ノードとして設置しました`);
    return { accepted: true, code: "RELAY_DEPLOYED", reason: "携帯リレーを設置しました", itemInstanceId: relayId };
  }

  recoverRelay(): EquipmentActionResolution {
    const controlled = this.requireControlledAgent();
    const relayId = this.state.deployedRelayItemIds.find((itemId) => {
      const location = this.itemLocations[itemId];
      return location?.kind === "mission-ground" && distanceSquared(location.position, controlled.position) <= 1.8 ** 2;
    });
    if (!relayId) return this.rejectEquipment("NO_RELAY_IN_RANGE", "回収範囲に携帯リレーがありません");
    this.itemLocations[relayId] = { kind: "crew", crewId: controlled.id };
    this.state.deployedRelayItemIds.splice(this.state.deployedRelayItemIds.indexOf(relayId), 1);
    const disabledIndex = this.state.disabledRelayItemIds.indexOf(relayId);
    if (disabledIndex >= 0) this.state.disabledRelayItemIds.splice(disabledIndex, 1);
    delete this.state.relayRestartByItemId[relayId];
    this.communication.removeNode(`relay:${relayId}`);
    this.evaluateCommunication(this.state.communicationEvaluatedAtSeconds);
    this.setFeedback("RELAY_RECOVERED", `${relayId}を回収しました`);
    return { accepted: true, code: "RELAY_RECOVERED", reason: "携帯リレーを回収しました", itemInstanceId: relayId };
  }

  deployFlare(elapsedSeconds: number): FlareDeploymentResult {
    const controlled = this.requireControlledAgent();
    const flareIds = this.manifest.items
      .filter((item) => item.definitionId === "flare-pack")
      .map((item) => item.instanceId);
    const result = this.signals.deployFlare(controlled.id, controlled.position, elapsedSeconds, flareIds, this.itemLocations);
    this.setFeedback(result.code, result.reason);
    return result;
  }

  openShortcut(shortcutId: string): EquipmentActionResolution {
    const shortcut = this.definition.toolShortcuts.find((candidate) => candidate.id === shortcutId);
    if (!shortcut) return this.rejectEquipment("UNKNOWN_SHORTCUT", "不明な短縮路です");
    if (this.state.shortcutOpenById[shortcut.id]) return this.rejectEquipment("SHORTCUT_ALREADY_OPEN", "短縮路はすでに開いています");
    const controlled = this.requireControlledAgent();
    const hasTool = shortcut.requiredDefinitionIds.some((definitionId) => this.findHeldItem(controlled.id, definitionId));
    if (!hasTool) return this.rejectEquipment("TOOL_REQUIRED", "バールまたはボルトカッターが必要です");
    this.state.shortcutOpenById[shortcut.id] = true;
    const failure = this.navigation.setEdgeEnabled(shortcut.navigationEdgeId, true);
    if (failure) return this.rejectEquipment(failure.code, failure.reason);
    this.setFeedback("SHORTCUT_OPENED", `${shortcut.label}を開放しました`);
    return { accepted: true, code: "SHORTCUT_OPENED", reason: "短縮路を開放しました", itemInstanceId: null };
  }

  getInteractions(): readonly InteractionDefinition[] {
    const shortcuts = this.definition.toolShortcuts
      .filter((shortcut) => !this.state.shortcutOpenById[shortcut.id])
      .map((shortcut) => ({
        id: `shortcut-${shortcut.id}`,
        position: shortcut.interactionPosition,
        radius: 1.35,
        prompt: `E  ${shortcut.label}を工具で開放`,
        response: shortcut.label,
        action: { type: "mission-shortcut" as const, shortcutId: shortcut.id },
      }));
    const relayRestarts = this.state.disabledRelayItemIds.flatMap((itemInstanceId) => {
      const location = this.itemLocations[itemInstanceId];
      if (location?.kind !== "mission-ground") return [];
      const restarting = this.state.relayRestartByItemId[itemInstanceId];
      return [{
        id: `relay-restart-${itemInstanceId}`,
        position: copyVec3(location.position),
        radius: 1.6,
        prompt: restarting ? "RELAY RESTART // 1.5 SEC" : "E  携帯リレーを再起動",
        response: "携帯リレー再起動",
        action: { type: "mission-relay-restart" as const, itemInstanceId },
      }];
    });
    return [...shortcuts, ...relayRestarts];
  }

  applyInterference(targetAgentId: CrewId, untilSeconds: number): void {
    if (!this.state.agents[targetAgentId]) return;
    this.state.interferenceUntilByAgentId[targetAgentId] = Math.max(
      this.state.interferenceUntilByAgentId[targetAgentId] ?? 0,
      untilSeconds,
    );
    for (const [relayId, restart] of Object.entries(this.state.relayRestartByItemId)) {
      if (restart.startedByAgentId === targetAgentId) delete this.state.relayRestartByItemId[relayId];
    }
    this.evaluateCommunication(this.state.communicationEvaluatedAtSeconds);
    this.setFeedback("INTERFERENCE_PULSE", `${targetAgentId}の通信はBURSTへ制限されています`);
  }

  restoreOpenedShortcut(shortcutId: string): EquipmentActionResolution {
    const shortcut = this.definition.toolShortcuts.find((candidate) => candidate.id === shortcutId);
    if (!shortcut) return this.rejectEquipment("UNKNOWN_SHORTCUT", "復元対象の短縮路がありません");
    this.state.shortcutOpenById[shortcut.id] = true;
    const failure = this.navigation.setEdgeEnabled(shortcut.navigationEdgeId, true);
    if (failure) return this.rejectEquipment(failure.code, failure.reason);
    return { accepted: true, code: "SHORTCUT_RESTORED", reason: "開放済み経路を復元しました", itemInstanceId: null };
  }

  restoreDeployedRelay(
    itemInstanceId: string,
    position: Vec3,
    operationalState: "active" | "disabled",
  ): EquipmentActionResolution {
    this.itemLocations[itemInstanceId] = { kind: "mission-ground", position: copyVec3(position) };
    if (!this.state.deployedRelayItemIds.includes(itemInstanceId)) this.state.deployedRelayItemIds.push(itemInstanceId);
    const disabledIndex = this.state.disabledRelayItemIds.indexOf(itemInstanceId);
    if (operationalState === "disabled" && disabledIndex < 0) this.state.disabledRelayItemIds.push(itemInstanceId);
    if (operationalState === "active" && disabledIndex >= 0) this.state.disabledRelayItemIds.splice(disabledIndex, 1);
    this.evaluateCommunication(this.state.communicationEvaluatedAtSeconds);
    return {
      accepted: true,
      code: operationalState === "disabled" ? "RELAY_RESTORED_DISABLED" : "RELAY_RESTORED_ACTIVE",
      reason: "置き去り携帯リレーを復元しました",
      itemInstanceId,
    };
  }

  disableRelay(itemInstanceId: string, elapsedSeconds: number): EquipmentActionResolution {
    const location = this.itemLocations[itemInstanceId];
    if (!this.state.deployedRelayItemIds.includes(itemInstanceId) || location?.kind !== "mission-ground") {
      return this.rejectEquipment("RELAY_NOT_ACTIVE", "対象リレーはactiveではありません");
    }
    if (!this.state.disabledRelayItemIds.includes(itemInstanceId)) this.state.disabledRelayItemIds.push(itemInstanceId);
    delete this.state.relayRestartByItemId[itemInstanceId];
    this.communication.removeNode(`relay:${itemInstanceId}`);
    this.evaluateCommunication(elapsedSeconds);
    this.setFeedback("RELAY_DISABLED", `${itemInstanceId}が妨害されました。現地で再起動できます`);
    return { accepted: true, code: "RELAY_DISABLED", reason: "携帯リレーを一時停止しました", itemInstanceId };
  }

  beginRelayRestart(itemInstanceId: string, elapsedSeconds: number): EquipmentActionResolution {
    const controlled = this.requireControlledAgent();
    const location = this.itemLocations[itemInstanceId];
    if (!this.state.disabledRelayItemIds.includes(itemInstanceId) || location?.kind !== "mission-ground") {
      return this.rejectEquipment("RELAY_NOT_DISABLED", "再起動対象の停止リレーがありません");
    }
    if (distanceSquared(controlled.position, location.position) > 1.6 ** 2) {
      return this.rejectEquipment("RELAY_OUT_OF_RANGE", "リレー再起動範囲外です");
    }
    this.state.relayRestartByItemId[itemInstanceId] = {
      startedByAgentId: controlled.id,
      startedAtSeconds: elapsedSeconds,
    };
    this.setFeedback("RELAY_RESTARTING", `${itemInstanceId}を再起動中 // 1.5 SEC`);
    return { accepted: true, code: "RELAY_RESTARTING", reason: "再起動シーケンスを開始しました", itemInstanceId };
  }

  setFriendlyMachineVoiceNode(machineId: string, position: Vec3, enabled: boolean): void {
    const previous = this.state.friendlyMachineVoiceNodes[machineId];
    if (enabled && previous && distanceSquared(previous, position) < 0.4 ** 2) return;
    if (!enabled && !previous) return;
    if (enabled) this.state.friendlyMachineVoiceNodes[machineId] = copyVec3(position);
    else delete this.state.friendlyMachineVoiceNodes[machineId];
    this.evaluateCommunication(this.state.communicationEvaluatedAtSeconds);
  }

  getInterferenceRemaining(agentId: CrewId, elapsedSeconds: number): number {
    return Math.max(0, (this.state.interferenceUntilByAgentId[agentId] ?? 0) - elapsedSeconds);
  }

  isRelayDisabled(itemInstanceId: string): boolean {
    return this.state.disabledRelayItemIds.includes(itemInstanceId);
  }

  getControlledPosition(): Vec3 {
    return copyVec3(this.requireControlledAgent().position);
  }

  getAgentPositions(): Readonly<Record<string, Vec3>> {
    return Object.fromEntries(Object.values(this.state.agents).map((agent) => [agent.id, copyVec3(agent.position)]));
  }

  getCommunicationStatus(sourceAgentId: CrewId, targetAgentId: CrewId): AgentCommunicationStatus {
    const status = this.communication.evaluateAgentLinks(sourceAgentId, [targetAgentId])[targetAgentId];
    const resolved = status ?? {
      agentId: targetAgentId,
      quality: 0,
      band: "none",
      routeNodeIds: [],
      localInstructionAllowed: false,
    };
    return this.capCommunicationForInterference(targetAgentId, resolved, this.state.communicationEvaluatedAtSeconds);
  }

  hasHeldItemDefinition(agentId: CrewId, definitionId: string): boolean {
    return Boolean(this.findHeldItem(agentId, definitionId));
  }

  setAgentPositionForQa(agentId: CrewId, position: Vec3): void {
    const agent = this.state.agents[agentId];
    if (!agent) return;
    agent.position = copyVec3(position);
    agent.lastKnownPosition = copyVec3(position);
    this.evaluateCommunication(this.state.communicationEvaluatedAtSeconds);
  }

  hasFieldTerminal(): boolean {
    return this.manifest.items.some((item) => {
      if (item.definitionId !== "field-terminal") return false;
      return this.itemLocations[item.instanceId]?.kind === "crew";
    });
  }

  dispose(): void {
    this.disposed = true;
  }

  private updateAutonomousAgent(agent: AgentRuntimeState, dt: number, elapsedSeconds: number): void {
    const runtime = agent.currentOrder;
    if (!runtime || runtime.order.type === "hold") return;

    if (runtime.order.type === "follow") {
      const target = runtime.order.targetAgentId ? this.state.agents[runtime.order.targetAgentId] : null;
      if (!target) return this.failOrder(agent, "追従対象を見失いました");
      if (
        !runtime.lastPlannedTarget ||
        distanceSquared(runtime.lastPlannedTarget, target.position) >= 1.6 ** 2 ||
        runtime.pathIndex >= runtime.pathPoints.length
      ) {
        const path = this.navigation.findPath(agent.position, target.position);
        if (!path.ok) return this.failOrder(agent, path.reason);
        this.applyPath(runtime, path, target.position);
      }
      if (distanceSquared(agent.position, target.position) <= 1.45 ** 2) {
        agent.statusLabel = `FOLLOW // ${target.id}`;
        return;
      }
    }

    const before = copyVec3(agent.position);
    const arrived = this.advanceAlongPath(agent, runtime, dt);
    const progress = Math.sqrt(distanceSquared(before, agent.position));
    runtime.noProgressSeconds = progress < 0.0005 && !arrived ? runtime.noProgressSeconds + dt : 0;
    if (runtime.noProgressSeconds >= 1) {
      this.recoverStuckAgent(agent, runtime);
      return;
    }
    if (!arrived) return;

    if (runtime.order.type === "follow") return;
    if (runtime.order.type === "search-zone") {
      this.advanceSearch(agent, runtime, elapsedSeconds);
      return;
    }
    this.completeOrderAndHold(agent);
  }

  private advanceAlongPath(agent: AgentRuntimeState, runtime: AgentOrderRuntime, dt: number): boolean {
    while (runtime.pathIndex < runtime.pathPoints.length) {
      const target = runtime.pathPoints[runtime.pathIndex];
      if (!target) break;
      const dx = target.x - agent.position.x;
      const dz = target.z - agent.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= WAYPOINT_RADIUS) {
        runtime.pathIndex += 1;
        continue;
      }
      const step = Math.min(distance, AUTONOMOUS_SPEED * dt);
      agent.position.x += (dx / distance) * step;
      agent.position.z += (dz / distance) * step;
      agent.position.y = target.y;
      agent.facingYaw = Math.atan2(-dx, -dz);
      return false;
    }
    return true;
  }

  private advanceSearch(agent: AgentRuntimeState, runtime: AgentOrderRuntime, elapsedSeconds: number): void {
    const zone = this.findSearchZone(runtime.order.targetZoneId);
    if (!zone) return this.failOrder(agent, "探索区域が見つかりません");
    if (runtime.searchPointIndex >= 0) this.discoverAtSearchPoint(agent, zone, runtime.searchPointIndex, elapsedSeconds);
    runtime.searchPointIndex += 1;
    const nextPoint = zone.searchPoints[runtime.searchPointIndex];
    if (!nextPoint) {
      this.completeOrderAndHold(agent);
      return;
    }
    const path = this.navigation.findPath(agent.position, nextPoint);
    if (!path.ok) return this.failOrder(agent, path.reason);
    this.applyPath(runtime, path, nextPoint);
  }

  private discoverAtSearchPoint(
    agent: AgentRuntimeState,
    zone: SearchZoneDefinition,
    pointIndex: number,
    elapsedSeconds: number,
  ): void {
    const point = zone.searchPoints[pointIndex];
    if (!point) return;
    for (const discovery of zone.discoveries) {
      if (distanceSquared(discovery.position, point) > 1.1 ** 2) continue;
      const entry: KnowledgeEntry = {
        id: `knowledge:${discovery.id}`,
        kind: discovery.kind,
        label: discovery.label,
        sourceId: discovery.id,
        position: copyVec3(discovery.position),
        discoveredByAgentId: agent.id,
        discoveredAtSeconds: elapsedSeconds,
      };
      const canShare = agent.localInstructionAllowed || communicationBandRank(agent.communicationBand) >= 1;
      this.knowledge.discover(entry, canShare);
      agent.statusLabel = canShare ? `REPORT SENT // ${discovery.label}` : `REPORT PENDING // ${discovery.label}`;
    }
  }

  private recoverStuckAgent(agent: AgentRuntimeState, runtime: AgentOrderRuntime): void {
    runtime.noProgressSeconds = 0;
    runtime.recoveryStep = Math.min(4, runtime.recoveryStep + 1) as AgentOrderRuntime["recoveryStep"];
    const target = runtime.lastPlannedTarget;
    if (!target) return this.failOrder(agent, "再計画対象がありません");
    if (runtime.recoveryStep === 1 || runtime.recoveryStep === 3) {
      const path = this.navigation.findPath(agent.position, target);
      if (path.ok) {
        this.applyPath(runtime, path, target);
        agent.statusLabel = `REPLAN ${runtime.recoveryStep}/3`;
        return;
      }
    }
    if (runtime.recoveryStep === 2) {
      const projection = this.navigation.projectToNavigablePoint(agent.position, 2.5);
      if (projection) {
        const path = this.navigation.findPath(projection.point, target);
        if (path.ok) {
          runtime.pathNodeIds = [...path.nodeIds];
          runtime.pathPoints = [copyVec3(projection.point), ...path.points.slice(1).map(copyVec3)];
          runtime.pathIndex = 0;
          agent.statusLabel = "REPROJECT / RETRY";
          return;
        }
      }
    }
    this.failOrder(agent, "経路復旧に失敗しました。現在位置で待機します");
  }

  private completeOrderAndHold(agent: AgentRuntimeState): void {
    const completedType = agent.currentOrder?.order.type ?? null;
    agent.lastCompletedOrderType = completedType;
    const holdOrder = this.createOrder(agent.id, agent.id, { type: "hold" }, this.state.communicationEvaluatedAtSeconds);
    agent.currentOrder = this.createOrderRuntime(agent, holdOrder) as AgentOrderRuntime;
    agent.statusLabel = `${completedType?.toUpperCase() ?? "ORDER"} COMPLETE // HOLD`;
  }

  private failOrder(agent: AgentRuntimeState, reason: string): void {
    if (agent.currentOrder) {
      agent.currentOrder.status = "failed";
      agent.currentOrder.failureReason = reason;
    }
    this.setFeedback("PATH_FAILURE", `${agent.id}: ${reason}`);
    const holdOrder = this.createOrder(agent.id, agent.id, { type: "hold" }, this.state.communicationEvaluatedAtSeconds);
    agent.currentOrder = this.createOrderRuntime(agent, holdOrder) as AgentOrderRuntime;
    agent.statusLabel = "PATH FAILED // HOLD";
  }

  private createOrder(
    issuerId: CrewId,
    recipientId: CrewId,
    request: SquadOrderRequest,
    elapsedSeconds: number,
  ): SquadOrder {
    this.orderSequence += 1;
    const targetAgentId = request.type === "follow" ? issuerId : null;
    const beacon = request.type === "rally" ? this.signals.getActiveBeacon(request.targetBeaconId) : null;
    return {
      id: `order-${this.orderSequence}`,
      type: request.type,
      issuerId,
      recipientId,
      targetPosition: request.targetPosition ? copyVec3(request.targetPosition) : beacon ? copyVec3(beacon.position) : null,
      targetAgentId,
      targetZoneId: request.targetZoneId ?? null,
      targetBeaconId: beacon?.id ?? null,
      issuedAtSeconds: elapsedSeconds,
    };
  }

  private createOrderRuntime(agent: AgentRuntimeState, order: SquadOrder): AgentOrderRuntime | Error {
    let goal: Vec3 | null = null;
    if (order.type === "follow" && order.targetAgentId) goal = this.state.agents[order.targetAgentId]?.position ?? null;
    if (order.type === "move-to" || order.type === "rally") goal = order.targetPosition;
    if (order.type === "search-zone") goal = this.findSearchZone(order.targetZoneId)?.entrance ?? null;
    if (order.type === "rally" && !goal) return new Error("有効なフレア信号がありません");
    if (order.type === "search-zone" && !goal) return new Error("探索区域が見つかりません");

    const runtime: AgentOrderRuntime = {
      order,
      status: "active",
      pathNodeIds: [],
      pathPoints: [],
      pathIndex: 0,
      searchPointIndex: -1,
      lastPlannedTarget: goal ? copyVec3(goal) : null,
      noProgressSeconds: 0,
      recoveryStep: 0,
      failureReason: null,
    };
    if (!goal || order.type === "hold") return runtime;
    const path = this.navigation.findPath(agent.position, goal);
    if (!path.ok) return new Error(path.reason);
    this.applyPath(runtime, path, goal);
    return runtime;
  }

  private applyPath(runtime: AgentOrderRuntime, path: Extract<NavigationPathResult, { ok: true }>, target: Vec3): void {
    runtime.pathNodeIds = [...path.nodeIds];
    runtime.pathPoints = path.points.map(copyVec3);
    runtime.pathIndex = runtime.pathPoints.length > 1 ? 1 : 0;
    runtime.lastPlannedTarget = copyVec3(target);
    runtime.recoveryStep = 0;
  }

  private evaluateCommunication(elapsedSeconds: number): void {
    for (const agent of Object.values(this.state.agents)) {
      const hasRadio = Boolean(this.findHeldItem(agent.id, "radio"));
      this.communication.setNode({
        id: `radio:${agent.id}`,
        kind: "agent-radio",
        position: copyVec3(agent.position),
        agentId: agent.id,
        enabled: hasRadio,
      });
      this.communication.setNode({
        id: `terminal:${agent.id}`,
        kind: "field-terminal",
        position: copyVec3(agent.position),
        agentId: agent.id,
        enabled: Boolean(this.findHeldItem(agent.id, "field-terminal")),
      });
    }
    this.communication.setNode({
      id: "extraction-beacon",
      kind: "extraction-beacon",
      position: copyVec3(this.definition.extractionPoint),
      agentId: null,
      enabled: true,
    });
    for (const relayId of this.state.deployedRelayItemIds) {
      const location = this.itemLocations[relayId];
      if (location?.kind !== "mission-ground") continue;
      this.communication.setNode({
        id: `relay:${relayId}`,
        kind: "portable-relay",
        position: copyVec3(location.position),
        agentId: null,
        enabled: !this.state.disabledRelayItemIds.includes(relayId),
      });
    }
    for (const [machineId, position] of Object.entries(this.state.friendlyMachineVoiceNodes)) {
      this.communication.setNode({
        id: `machine:${machineId}`,
        kind: "friendly-machine",
        position: copyVec3(position),
        agentId: null,
        enabled: true,
      });
    }
    const controlledId = this.state.control.controlledAgentId;
    const statuses = this.communication.evaluateAgentLinks(controlledId, Object.keys(this.state.agents));
    for (const agent of Object.values(this.state.agents)) {
      const status = statuses[agent.id];
      if (!status) continue;
      const capped = this.capCommunicationForInterference(agent.id, status, elapsedSeconds);
      agent.communicationBand = capped.band;
      agent.communicationQuality = capped.quality;
      agent.localInstructionAllowed = capped.localInstructionAllowed;
      if (status.band !== "none") agent.lastKnownPosition = copyVec3(agent.position);
      this.knowledge.flushPending(agent.id, status.localInstructionAllowed || communicationBandRank(status.band) >= 1);
    }
    this.state.communicationEvaluatedAtSeconds = elapsedSeconds;
    this.state.communicationRevision += 1;
  }

  private capCommunicationForInterference(
    agentId: CrewId,
    status: AgentCommunicationStatus,
    elapsedSeconds: number,
  ): AgentCommunicationStatus {
    if ((this.state.interferenceUntilByAgentId[agentId] ?? 0) <= elapsedSeconds) return status;
    return {
      ...status,
      quality: Math.min(status.quality, 0.41),
      band: status.band === "none" ? "none" : "burst",
      localInstructionAllowed: false,
    };
  }

  private updateInterferenceAndRelayRestart(elapsedSeconds: number): void {
    let communicationChanged = false;
    for (const [agentId, until] of Object.entries(this.state.interferenceUntilByAgentId)) {
      if (until > elapsedSeconds) continue;
      delete this.state.interferenceUntilByAgentId[agentId];
      communicationChanged = true;
    }
    for (const [relayId, restart] of Object.entries(this.state.relayRestartByItemId)) {
      if (elapsedSeconds - restart.startedAtSeconds < RELAY_RESTART_SECONDS) continue;
      const disabledIndex = this.state.disabledRelayItemIds.indexOf(relayId);
      if (disabledIndex >= 0) this.state.disabledRelayItemIds.splice(disabledIndex, 1);
      delete this.state.relayRestartByItemId[relayId];
      this.setFeedback("RELAY_RESTARTED", `${relayId}を再起動しました`);
      communicationChanged = true;
    }
    if (communicationChanged) this.evaluateCommunication(elapsedSeconds);
  }

  private updateRallyObjective(dt: number): void {
    const objective = this.state.rallyObjective;
    if (!objective.active || objective.achieved) return;
    const positions = Object.values(this.state.agents).map((agent) => agent.position);
    let together = true;
    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        const a = positions[left];
        const b = positions[right];
        if (a && b && distanceSquared(a, b) > objective.radius ** 2) together = false;
      }
    }
    objective.heldSeconds = together ? Math.min(objective.requiredHoldSeconds, objective.heldSeconds + dt) : 0;
    objective.progress = objective.heldSeconds / objective.requiredHoldSeconds;
    if (objective.heldSeconds >= objective.requiredHoldSeconds) {
      objective.achieved = true;
      objective.active = false;
      this.setFeedback("CREW_REESTABLISHED", "REESTABLISH THE CREW // COMPLETE");
    }
  }

  private findHeldItem(agentId: CrewId, definitionId: string): string | null {
    for (const [instanceId, itemDefinitionId] of this.itemDefinitionByInstanceId) {
      if (itemDefinitionId !== definitionId) continue;
      const location = this.itemLocations[instanceId];
      if (location?.kind === "crew" && location.crewId === agentId) return instanceId;
    }
    return null;
  }

  private findSearchZone(zoneId: string | null): SearchZoneDefinition | null {
    return this.definition.searchZones.find((zone) => zone.id === zoneId) ?? null;
  }

  private requireControlledAgent(): AgentRuntimeState {
    const agent = this.state.agents[this.state.control.controlledAgentId];
    if (!agent) throw new Error("Controlled agent is missing");
    return agent;
  }

  private rejectOrder(code: Exclude<SquadCommandResolution["code"], "ORDER_ACCEPTED">, reason: string): SquadCommandResolution {
    this.setFeedback(code, reason);
    return { accepted: false, code, reason, orderId: null };
  }

  private rejectEquipment(code: string, reason: string): EquipmentActionResolution {
    this.setFeedback(code, reason);
    return { accepted: false, code, reason, itemInstanceId: null };
  }

  private setFeedback(code: string, message: string): void {
    this.state.feedback.code = code;
    this.state.feedback.message = message;
    this.state.feedback.revision += 1;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("DistributedSquadController has been disposed");
  }
}

export function canIssueRemoteOrder(band: CommunicationBand, localInstructionAllowed: boolean): boolean {
  return localInstructionAllowed || communicationBandRank(band) >= 2;
}
