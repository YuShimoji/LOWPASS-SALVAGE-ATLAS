import { copyVec3, distanceSquared, type Vec3 } from "../core/types";
import type { InteractionDefinition } from "../interaction/interactionTypes";
import type { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import type { DistributedSquadState, CrewId } from "../squad/squadTypes";
import {
  ScoutDroneController,
  type ThreatCommunicationQuery,
  type ThreatEcologyContext,
  type ThreatLineOfSightQuery,
} from "../threat/ScoutDroneController";
import { assessPresence, DEFAULT_PRESENCE_SETTINGS, type PresenceEntity } from "../threat/PresenceService";
import type {
  ScoutDroneEncounterDefinition,
  ScoutDroneRuntimeState,
  ThreatDisableResolution,
} from "../threat/threatTypes";
import type { SecurityPosture } from "../world/worldTypes";
import {
  collectReadyBroadcasts,
  createHostileMachineKnowledge,
  decayHostileMachineKnowledge,
  observeSecurityFact,
  queueSecurityBroadcast,
  securityBroadcastId,
  securityFactId,
} from "./HostileMachineKnowledge";
import { createSecurityBlackboard, expireSecurityFacts, shareSecurityFact } from "./SecurityBlackboard";
import { HostileMachineLinkGraph } from "./HostileMachineLinkGraph";
import { SecurityPressureController } from "./SecurityPressureController";
import { allocateSecurityTasks } from "./SecurityTaskAllocator";
import type {
  HostileMachineId,
  HostileMachineKnowledge,
  SecurityCellDefinition,
  SecurityCellRuntimeState,
  SecurityFactKind,
  SecurityMachineDescriptor,
  SecurityTaskAssignment,
} from "./securityTypes";

const NEEDLE_ID = "machine:security:needle-01" as const;
const WATCHER_ID = "machine:security:watcher-01" as const;
const CELL_ID = "security-cell:flooded-market-01" as const;
const WATCHER_WAYPOINT_RADIUS = 0.32;

export function createFloodedMarketSecurityCellDefinition(
  signalZones: SecurityCellDefinition["signalZones"],
): SecurityCellDefinition {
  return {
    id: CELL_ID,
    needleId: NEEDLE_ID,
    watcherId: WATCHER_ID,
    watcherSpawn: { x: -3.45, y: 2.65, z: -4.65 },
    watcherPatrolPoints: [
      { x: -3.45, y: 2.65, z: -4.65 },
      { x: -3.4, y: 2.65, z: -1.5 },
      { x: 0, y: 2.65, z: 1.1 },
      { x: 3.4, y: 2.65, z: -1.5 },
      { x: 3.45, y: 2.65, z: -4.65 },
      { x: 0, y: 2.65, z: -4.25 },
    ],
    watcherCruiseAltitude: 2.65,
    watcherPatrolSpeed: 1.05,
    watcherObservationRange: 12,
    watcherFieldOfViewDegrees: 164,
    directContactConfirmationSeconds: 0.6,
    factTtlSeconds: 8,
    factDecayPerSecond: 0.09,
    uncertaintyGrowthPerSecond: 0.42,
    communicationRange: 32,
    communicationIntervalSeconds: 1 / 3,
    assignmentIntervalSeconds: 0.5,
    minimumTaskSeconds: 1.25,
    reassignmentCooldownSeconds: 0.5,
    maximumConcurrentLockOnsPerAgent: 1,
    maximumConcurrentInterdictions: 1,
    maximumConcurrentRelaySabotages: 1,
    postInterferenceGraceSeconds: 4,
    signalZones,
  };
}

export interface SecurityCellDebugReadback {
  readonly posture: SecurityPosture;
  readonly cellId: SecurityCellRuntimeState["id"];
  readonly linkQuality: number;
  readonly linkConnected: boolean;
  readonly sharedFactCount: number;
  readonly sharedFacts: readonly {
    readonly id: string;
    readonly confidence: number;
    readonly uncertaintyRadius: number;
  }[];
  readonly localFactCountByMachine: Readonly<Record<string, number>>;
  readonly assignments: Readonly<Record<string, SecurityTaskAssignment>>;
  readonly reservationIds: readonly string[];
  readonly pressureTokens: SecurityCellRuntimeState["blackboard"]["pressureTokens"];
  readonly presence: SecurityCellRuntimeState["presence"];
  readonly lastAssignmentAtSeconds: number;
  readonly confirmedContact: boolean;
  readonly sharedContactRevision: number;
}

export class SecurityCellController {
  readonly definition: ScoutDroneEncounterDefinition;
  readonly state: ScoutDroneController["state"];
  readonly securityDefinition: SecurityCellDefinition;
  private readonly needle: ScoutDroneController;
  private readonly linkGraph: HostileMachineLinkGraph;
  private readonly pressure: SecurityPressureController;
  private watcherPath: Vec3[] = [];
  private watcherPathIndex = 0;
  private watcherPlannedTarget: Vec3 | null = null;
  private perceptionAccumulator = 0.2;
  private communicationAccumulator = 1 / 3;
  private assignmentAccumulator = 0.5;
  private decayAccumulator = 0.4;
  private lastBlackboardDecayAtSeconds: number;
  private linkSuppressedForQa = false;
  private outnumberedDisengageApplied = false;
  private disposed = false;

  constructor(
    definition: ScoutDroneEncounterDefinition,
    agentIds: readonly CrewId[],
    private readonly navigation: WaypointNavigationService,
    startedAtSeconds = 0,
    posture: SecurityPosture = "routine",
    securityDefinition = createFloodedMarketSecurityCellDefinition([]),
  ) {
    this.definition = { ...definition, id: NEEDLE_ID };
    this.securityDefinition = securityDefinition;
    this.needle = new ScoutDroneController(this.definition, agentIds, navigation, startedAtSeconds, 1);
    this.state = this.needle.state;
    const blackboard = createSecurityBlackboard();
    const cell: SecurityCellRuntimeState = {
      id: CELL_ID,
      posture,
      needle: this.state.drone,
      watcher: null,
      knowledgeByMachine: {
        [NEEDLE_ID]: createHostileMachineKnowledge(NEEDLE_ID, startedAtSeconds),
        [WATCHER_ID]: createHostileMachineKnowledge(WATCHER_ID, startedAtSeconds),
      },
      blackboard,
      link: null,
      presence: null,
      confirmedContact: false,
      directContactStartedAtSeconds: null,
      observedTacticTags: new Set(),
      sharedContactRevision: 0,
      lastAssignmentAtSeconds: startedAtSeconds,
    };
    this.state.securityCell = cell;
    this.linkGraph = new HostileMachineLinkGraph(securityDefinition.signalZones, securityDefinition.communicationRange);
    this.pressure = new SecurityPressureController(blackboard.pressureTokens, securityDefinition);
    this.lastBlackboardDecayAtSeconds = startedAtSeconds;
    this.setPosture(posture);
  }

  fixedUpdate(
    dt: number,
    elapsedSeconds: number,
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
    getCommunication: ThreatCommunicationQuery,
    ecologyContext: ThreatEcologyContext | null = null,
  ): void {
    this.assertActive();
    const cell = this.requireCell();
    const ecology = ecologyContext ? this.withPressurePolicy(ecologyContext, elapsedSeconds) : null;
    this.needle.fixedUpdate(dt, elapsedSeconds, squad, hasLineOfSight, getCommunication, ecology);
    if (this.pressure.tokens.activeInterdictionMachineId === NEEDLE_ID && this.state.drone.mode !== "interdict") {
      this.pressure.endInterdiction(NEEDLE_ID);
    }
    this.perceptionAccumulator += dt;
    if (this.perceptionAccumulator >= 0.2) {
      this.perceptionAccumulator %= 0.2;
      this.updatePerception(elapsedSeconds, squad, hasLineOfSight, ecologyContext);
      this.updatePresence(elapsedSeconds, squad, hasLineOfSight, ecologyContext);
    }
    this.communicationAccumulator += dt;
    if (this.communicationAccumulator >= this.securityDefinition.communicationIntervalSeconds) {
      this.communicationAccumulator %= this.securityDefinition.communicationIntervalSeconds;
      this.updateCommunication(elapsedSeconds, hasLineOfSight);
    }
    this.decayAccumulator += dt;
    if (this.decayAccumulator >= 0.4) {
      this.decayAccumulator %= 0.4;
      this.decayFacts(elapsedSeconds);
    }
    this.assignmentAccumulator += dt;
    if (this.assignmentAccumulator >= this.securityDefinition.assignmentIntervalSeconds) {
      this.assignmentAccumulator %= this.securityDefinition.assignmentIntervalSeconds;
      this.assignTasks(elapsedSeconds, ecologyContext);
    }
    this.applyAssignments(elapsedSeconds);
    this.updateWatcher(dt, elapsedSeconds);
    if (cell.presence?.band === "outnumbered") this.releaseAttackPosture(elapsedSeconds);
    else this.outnumberedDisengageApplied = false;
  }

  getInteractions(): readonly InteractionDefinition[] {
    return this.needle.getInteractions();
  }

  attemptDisable(
    agentId: CrewId,
    agentPosition: Vec3,
    hasFieldTerminal: boolean,
    elapsedSeconds: number,
    hasLineOfSight: ThreatLineOfSightQuery,
  ): ThreatDisableResolution {
    const result = this.needle.attemptDisable(agentId, agentPosition, hasFieldTerminal, elapsedSeconds, hasLineOfSight);
    if (result.accepted) this.pressure.clearAttackTokens(NEEDLE_ID);
    return result;
  }

  getActiveDroneCount(): number {
    return this.needle.getActiveDroneCount();
  }

  getPendingReportCount(): number {
    return this.needle.getPendingReportCount();
  }

  getDebugReadback(controlledAgentId: CrewId): ReturnType<ScoutDroneController["getDebugReadback"]> & {
    readonly security: SecurityCellDebugReadback;
  } {
    const base = this.needle.getDebugReadback(controlledAgentId);
    const cell = this.requireCell();
    return {
      ...base,
      security: {
        posture: cell.posture,
        cellId: cell.id,
        linkQuality: cell.link?.quality ?? 0,
        linkConnected: cell.link?.connected ?? false,
        sharedFactCount: Object.keys(cell.blackboard.sharedFacts).length,
        sharedFacts: Object.values(cell.blackboard.sharedFacts)
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((fact) => ({
            id: fact.id,
            confidence: fact.confidence,
            uncertaintyRadius: fact.uncertaintyRadius,
          })),
        localFactCountByMachine: Object.fromEntries(
          Object.entries(cell.knowledgeByMachine)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([id, knowledge]) => [id, Object.keys(knowledge.localFacts).length]),
        ),
        assignments: structuredClone(cell.blackboard.currentAssignments),
        reservationIds: Object.keys(cell.blackboard.taskReservations).sort(),
        pressureTokens: structuredClone(cell.blackboard.pressureTokens),
        presence: cell.presence ? structuredClone(cell.presence) : null,
        lastAssignmentAtSeconds: cell.lastAssignmentAtSeconds,
        confirmedContact: cell.confirmedContact,
        sharedContactRevision: cell.sharedContactRevision,
      },
    };
  }

  getSecurityObservation(): {
    readonly confirmedContact: boolean;
    readonly observedTacticTags: readonly ("flare-observed" | "field-relay-observed" | "porter-support-observed" | "opened-traversal-observed")[];
  } {
    const cell = this.requireCell();
    return {
      confirmedContact: cell.confirmedContact,
      observedTacticTags: [...cell.observedTacticTags].sort(),
    };
  }

  setDronePositionForQa(position: Vec3, facingYaw = Math.PI): void {
    this.needle.setDronePositionForQa(position, facingYaw);
  }

  armIsolatedContactForQa(position: Vec3, elapsedSeconds: number, facingYaw = Math.PI): void {
    this.needle.armIsolatedContactForQa(position, elapsedSeconds, facingYaw);
  }

  setWatcherPositionForQa(position: Vec3, facingYaw = 0): void {
    const watcher = this.requireCell().watcher;
    if (!watcher) return;
    watcher.position = { x: position.x, y: this.securityDefinition.watcherCruiseAltitude, z: position.z };
    watcher.facingYaw = facingYaw;
    watcher.facing = facingYaw;
    this.watcherPath = [];
    this.watcherPathIndex = 0;
  }

  setHostileLinkSuppressedForQa(suppressed: boolean): void {
    this.linkSuppressedForQa = suppressed;
  }

  forcePostureForQa(posture: SecurityPosture): void {
    this.setPosture(posture);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pressure.clearAttackTokens(NEEDLE_ID);
    this.needle.dispose();
    this.watcherPath = [];
  }

  private setPosture(posture: SecurityPosture): void {
    const cell = this.requireCell();
    cell.posture = posture;
    if (posture === "watchful" && !cell.watcher) {
      cell.watcher = createWatcher(this.securityDefinition);
      this.state.additionalDrones.push(cell.watcher);
      this.planWatcherTo(this.securityDefinition.watcherPatrolPoints[0] ?? this.securityDefinition.watcherSpawn);
    } else if (posture === "routine" && cell.watcher) {
      const watcherIndex = this.state.additionalDrones.findIndex((drone) => drone.id === WATCHER_ID);
      if (watcherIndex >= 0) this.state.additionalDrones.splice(watcherIndex, 1);
      cell.watcher = null;
      this.watcherPath = [];
      delete cell.blackboard.currentAssignments[WATCHER_ID];
    }
  }

  private withPressurePolicy(ecology: ThreatEcologyContext, _elapsedSeconds: number): ThreatEcologyContext {
    return {
      ...ecology,
      attackPostureHeld: this.requireCell().presence?.band === "outnumbered",
      pressurePolicy: {
        canBeginLockOn: (targetAgentId, presence, currentSeconds) => {
          this.requireCell().presence = structuredClone(presence);
          return this.pressure.canBeginLockOn(
            NEEDLE_ID,
            targetAgentId,
            currentSeconds,
            presence.band,
            true,
            this.isSafeZone(this.state.drone.lastKnownTargetPosition ?? this.state.drone.position, ecology.extractionPoint),
          );
        },
        onLockOnStarted: (targetAgentId) => {
          this.pressure.beginLockOn(NEEDLE_ID, targetAgentId);
          this.confirmContact();
        },
        onLockOnReleased: (targetAgentId) => this.pressure.releaseLockOn(NEEDLE_ID, targetAgentId),
        onInterdiction: (targetAgentId, currentSeconds) => {
          if (this.pressure.beginInterdiction(NEEDLE_ID, targetAgentId, currentSeconds)) this.confirmContact();
        },
        canBeginRelaySabotage: (relayId) => this.pressure.canBeginRelaySabotage(
          NEEDLE_ID,
          relayId,
          this.requireCell().presence?.band ?? "predatory",
          false,
        ),
        onRelaySabotageStarted: (relayId) => this.pressure.beginRelaySabotage(NEEDLE_ID, relayId),
        onRelaySabotageReleased: (relayId) => this.pressure.releaseRelaySabotage(NEEDLE_ID, relayId),
      },
      onInterdict: (targetAgentId) => {
        ecology.onInterdict?.(targetAgentId);
        this.confirmContact();
      },
    };
  }

  private updatePerception(
    elapsedSeconds: number,
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
    ecology: ThreatEcologyContext | null,
  ): void {
    const cell = this.requireCell();
    let directAgentSeen = false;
    const machines = this.activeMachineStates();
    for (const [machineId, machine] of machines) {
      const knowledge = this.requireKnowledge(machineId);
      for (const agent of Object.values(squad.agents).sort((left, right) => left.id.localeCompare(right.id))) {
        if (agent.controlMode === "incapacitated" || !this.canObserve(machine, agent.position, hasLineOfSight)) continue;
        directAgentSeen = true;
        this.observe(knowledge, "agent-sighting", agent.id, agent.position, elapsedSeconds, 1);
      }
      for (const stimulus of ecology?.stimuli ?? []) {
        if (stimulus.kind !== "flare" || !stimulus.active || !this.canObserve(machine, stimulus.position, hasLineOfSight)) continue;
        this.observe(knowledge, "flare-sighting", stimulus.id, stimulus.position, elapsedSeconds, 0.88);
        cell.observedTacticTags.add("flare-observed");
      }
      for (const relay of ecology?.relays ?? []) {
        if (!relay.active || relay.disabled || !this.canObserve(machine, relay.position, hasLineOfSight)) continue;
        this.observe(knowledge, "relay-sighting", relay.id, relay.position, elapsedSeconds, 0.96);
        cell.observedTacticTags.add("field-relay-observed");
        this.confirmContact();
      }
      const porter = ecology?.friendlyMachine;
      if (porter?.authenticated && this.canObserve(machine, porter.position, hasLineOfSight)) {
        this.observe(knowledge, "friendly-machine-sighting", porter.id, porter.position, elapsedSeconds, 0.94);
        cell.observedTacticTags.add("porter-support-observed");
        this.confirmContact();
      }
      for (const traversal of ecology?.openedTraversals ?? []) {
        if (!this.canObserve(machine, traversal.position, hasLineOfSight)) continue;
        cell.observedTacticTags.add("opened-traversal-observed");
      }
    }
    if (!directAgentSeen) {
      cell.directContactStartedAtSeconds = null;
    } else if (cell.directContactStartedAtSeconds === null) {
      cell.directContactStartedAtSeconds = elapsedSeconds;
    } else if (elapsedSeconds - cell.directContactStartedAtSeconds >= this.securityDefinition.directContactConfirmationSeconds) {
      this.confirmContact();
    }
  }

  private updateCommunication(elapsedSeconds: number, hasLineOfSight: ThreatLineOfSightQuery): void {
    const cell = this.requireCell();
    const watcher = cell.watcher;
    this.linkGraph.setNode({ id: NEEDLE_ID, position: cell.needle.position, enabled: cell.needle.active });
    if (watcher) this.linkGraph.setNode({ id: WATCHER_ID, position: watcher.position, enabled: watcher.active });
    else this.linkGraph.removeNode(WATCHER_ID);
    cell.link = this.linkSuppressedForQa || !watcher
      ? {
        sourceMachineId: WATCHER_ID,
        targetMachineId: NEEDLE_ID,
        quality: 0,
        delaySeconds: Number.POSITIVE_INFINITY,
        connected: false,
        evaluatedAtSeconds: elapsedSeconds,
      }
      : this.linkGraph.evaluate(WATCHER_ID, NEEDLE_ID, elapsedSeconds, hasLineOfSight);
    if (!cell.link.connected) return;
    this.queueFactsForRecipient(this.requireKnowledge(WATCHER_ID), NEEDLE_ID, cell.link.delaySeconds, elapsedSeconds);
    this.queueFactsForRecipient(this.requireKnowledge(NEEDLE_ID), WATCHER_ID, cell.link.delaySeconds, elapsedSeconds);
    this.deliverFacts(this.requireKnowledge(WATCHER_ID), elapsedSeconds);
    this.deliverFacts(this.requireKnowledge(NEEDLE_ID), elapsedSeconds);
  }

  private queueFactsForRecipient(
    knowledge: HostileMachineKnowledge,
    recipientMachineId: HostileMachineId,
    delaySeconds: number,
    elapsedSeconds: number,
  ): void {
    for (const fact of Object.values(knowledge.localFacts).sort((left, right) => left.id.localeCompare(right.id))) {
      if (!fact.directlyObserved || fact.expiresAtSeconds <= elapsedSeconds) continue;
      const id = securityBroadcastId(fact, recipientMachineId);
      queueSecurityBroadcast(knowledge, {
        id,
        factId: fact.id,
        sourceMachineId: knowledge.machineId,
        recipientMachineId,
        queuedAtSeconds: elapsedSeconds,
        readyAtSeconds: elapsedSeconds + delaySeconds,
      });
    }
  }

  private deliverFacts(source: HostileMachineKnowledge, elapsedSeconds: number): void {
    const cell = this.requireCell();
    const delivered = collectReadyBroadcasts(source, elapsedSeconds, () => Boolean(cell.link?.connected));
    for (const { broadcast, fact } of delivered) {
      observeSecurityFact(this.requireKnowledge(broadcast.recipientMachineId), fact);
      if (shareSecurityFact(cell.blackboard, fact)) cell.sharedContactRevision += 1;
    }
  }

  private decayFacts(elapsedSeconds: number): void {
    const cell = this.requireCell();
    for (const knowledge of Object.values(cell.knowledgeByMachine)) {
      decayHostileMachineKnowledge(
        knowledge,
        elapsedSeconds,
        this.securityDefinition.factDecayPerSecond,
        this.securityDefinition.uncertaintyGrowthPerSecond,
      );
    }
    const blackboardDt = Math.max(0, elapsedSeconds - this.lastBlackboardDecayAtSeconds);
    this.lastBlackboardDecayAtSeconds = elapsedSeconds;
    for (const fact of Object.values(cell.blackboard.sharedFacts)) {
      fact.confidence = Math.max(0, fact.confidence - this.securityDefinition.factDecayPerSecond * blackboardDt);
      fact.uncertaintyRadius += this.securityDefinition.uncertaintyGrowthPerSecond * blackboardDt;
    }
    expireSecurityFacts(cell.blackboard, elapsedSeconds);
  }

  private assignTasks(elapsedSeconds: number, ecology: ThreatEcologyContext | null): void {
    const cell = this.requireCell();
    const previousRevision = cell.blackboard.revision;
    const safeTargetIds = new Set(
      Object.values(cell.blackboard.sharedFacts)
        .filter((fact) => fact.kind === "agent-sighting" && this.isSafeZone(fact.position, ecology?.extractionPoint))
        .map((fact) => fact.targetId),
    );
    allocateSecurityTasks(
      cell.blackboard,
      this.activeMachineStates().map(([id, machine]) => ({
        id,
        kind: id === NEEDLE_ID ? "needle" : "watcher",
        position: machine.position,
        operational: machine.active,
      } satisfies SecurityMachineDescriptor)),
      {
        elapsedSeconds,
        presenceBand: cell.presence?.band ?? "predatory",
        safeTargetIds,
        isReachable: (machineId, position) => machineId === WATCHER_ID
          ? Boolean(this.navigation.projectToNavigablePoint(position, 8))
          : this.navigation.isReachable(cell.needle.position, position),
      },
      this.securityDefinition.minimumTaskSeconds,
      this.securityDefinition.reassignmentCooldownSeconds,
    );
    if (cell.blackboard.revision !== previousRevision) cell.lastAssignmentAtSeconds = elapsedSeconds;
  }

  private applyAssignments(elapsedSeconds: number): void {
    const cell = this.requireCell();
    const needleAssignment = cell.blackboard.currentAssignments[NEEDLE_ID];
    if (needleAssignment?.task === "disengage") {
      this.releaseAttackPosture(elapsedSeconds);
    } else if (
      needleAssignment?.task === "observe-agent"
      || needleAssignment?.task === "investigate-flare"
      || needleAssignment?.task === "sabotage-relay"
    ) {
      const fact = needleAssignment.factId ? cell.blackboard.sharedFacts[needleAssignment.factId] : null;
      if (fact && this.state.drone.perception.lastStimulusId !== fact.id) {
        this.needle.investigateSharedPosition(fact.position, elapsedSeconds, fact.id);
      }
    }
    const watcher = cell.watcher;
    const watcherAssignment = cell.blackboard.currentAssignments[WATCHER_ID];
    if (!watcher || !watcherAssignment) return;
    if (watcherAssignment.task === "disengage") {
      if (watcher.mode !== "disengage") {
        watcher.mode = "disengage";
        this.planWatcherTo(this.securityDefinition.watcherSpawn);
      }
      return;
    }
    if (watcherAssignment.task === "maintain-overwatch" || watcherAssignment.task === "observe-agent") {
      watcher.mode = "observe";
      const fact = watcherAssignment.factId ? cell.blackboard.sharedFacts[watcherAssignment.factId] : null;
      if (fact) {
        watcher.targetEntityId = fact.targetId;
        watcher.lastKnownTargetPosition = copyVec3(fact.position);
      }
      return;
    }
    if (watcherAssignment.task === "investigate-flare") {
      const fact = watcherAssignment.factId ? cell.blackboard.sharedFacts[watcherAssignment.factId] : null;
      if (fact && (!this.watcherPlannedTarget || distanceSquared(this.watcherPlannedTarget, fact.position) > 1)) {
        watcher.mode = "investigate";
        this.planWatcherTo(offsetFrom(fact.position, watcher.position, 4));
      }
      return;
    }
    if (watcher.mode !== "patrol") watcher.mode = "patrol";
  }

  private updateWatcher(dt: number, elapsedSeconds: number): void {
    const watcher = this.requireCell().watcher;
    if (!watcher?.active) return;
    watcher.perception.evaluatedAtSeconds = elapsedSeconds;
    if ((watcher.mode === "disengage" || watcher.mode === "investigate") && this.advanceWatcherPath(dt)) {
      watcher.mode = watcher.mode === "disengage" ? "observe" : "patrol";
    } else if (watcher.mode === "patrol") {
      if (this.watcherPath.length === 0) {
        this.planWatcherTo(this.securityDefinition.watcherPatrolPoints[watcher.patrolIndex] ?? this.securityDefinition.watcherSpawn);
      }
      if (this.advanceWatcherPath(dt)) {
        watcher.patrolIndex = (watcher.patrolIndex + 1) % Math.max(1, this.securityDefinition.watcherPatrolPoints.length);
        this.planWatcherTo(this.securityDefinition.watcherPatrolPoints[watcher.patrolIndex] ?? this.securityDefinition.watcherSpawn);
      }
    }
    watcher.facing = watcher.facingYaw;
  }

  private updatePresence(
    elapsedSeconds: number,
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
    ecology: ThreatEcologyContext | null,
  ): void {
    const cell = this.requireCell();
    const target = Object.values(squad.agents)
      .filter((agent) => agent.controlMode !== "incapacitated")
      .sort((left, right) => distanceSquared(left.position, cell.needle.position) - distanceSquared(right.position, cell.needle.position)
        || left.id.localeCompare(right.id))[0];
    if (!target) {
      cell.presence = null;
      return;
    }
    const machines = this.activeMachineStates().map(([, machine]) => machine);
    const canCellRecognize = (position: Vec3): boolean => machines.some((machine) => this.canObserve(machine, position, hasLineOfSight));
    const entities: PresenceEntity[] = Object.values(squad.agents).map((agent) => ({
      id: agent.id,
      side: "allied",
      kind: "crew",
      position: agent.position,
      operational: agent.controlMode !== "incapacitated",
      perceptible: canCellRecognize(agent.position),
    }));
    const porter = ecology?.friendlyMachine;
    if (porter?.authenticated) {
      entities.push({
        id: porter.id,
        side: "allied",
        kind: "friendly-machine",
        position: porter.position,
        operational: porter.mode !== "path-failed",
        perceptible: canCellRecognize(porter.position),
      });
    }
    entities.push({
      id: NEEDLE_ID,
      side: "hostile",
      kind: "hostile-drone",
      position: cell.needle.position,
      operational: cell.needle.active,
      perceptible: true,
    });
    if (cell.watcher) {
      entities.push({
        id: WATCHER_ID,
        side: "hostile",
        kind: "hostile-observer",
        position: cell.watcher.position,
        operational: cell.watcher.active,
        perceptible: true,
      });
    }
    cell.presence = assessPresence(
      target.id,
      target.position,
      entities,
      elapsedSeconds,
      hasLineOfSight,
      { ...DEFAULT_PRESENCE_SETTINGS, radius: this.definition.presenceRadius },
    );
  }

  private observe(
    knowledge: HostileMachineKnowledge,
    kind: SecurityFactKind,
    targetId: string,
    position: Vec3,
    elapsedSeconds: number,
    confidence: number,
  ): void {
    const id = securityFactId(kind, targetId);
    observeSecurityFact(knowledge, {
      id,
      kind,
      sourceMachineId: knowledge.machineId,
      targetId,
      position: copyVec3(position),
      observedAtSeconds: elapsedSeconds,
      confidence,
      uncertaintyRadius: 0,
      expiresAtSeconds: elapsedSeconds + this.securityDefinition.factTtlSeconds,
      directlyObserved: true,
    });
  }

  private canObserve(
    machine: ScoutDroneRuntimeState,
    position: Vec3,
    hasLineOfSight: ThreatLineOfSightQuery,
  ): boolean {
    const isWatcher = machine.id === WATCHER_ID;
    const range = isWatcher ? this.securityDefinition.watcherObservationRange : this.definition.observationRange;
    const fieldOfView = isWatcher ? this.securityDefinition.watcherFieldOfViewDegrees : this.definition.fieldOfViewDegrees;
    const dx = position.x - machine.position.x;
    const dz = position.z - machine.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > range) return false;
    const forwardX = -Math.sin(machine.facingYaw);
    const forwardZ = -Math.cos(machine.facingYaw);
    const dot = distance <= 0.001 ? 1 : (dx / distance) * forwardX + (dz / distance) * forwardZ;
    return dot >= Math.cos((fieldOfView * Math.PI / 180) / 2)
      && hasLineOfSight(machine.position, { x: position.x, y: position.y + 0.55, z: position.z });
  }

  private confirmContact(): void {
    this.requireCell().confirmedContact = true;
  }

  private releaseAttackPosture(elapsedSeconds: number): void {
    if (this.outnumberedDisengageApplied) return;
    this.outnumberedDisengageApplied = true;
    const cell = this.requireCell();
    this.pressure.clearAttackTokens(NEEDLE_ID);
    this.needle.enforceSecurityDisengage(elapsedSeconds, "security cell outnumbered; attack posture released");
    const watcher = cell.watcher;
    if (watcher && watcher.mode !== "disengage") {
      watcher.mode = "disengage";
      this.planWatcherTo(this.securityDefinition.watcherSpawn);
    }
  }

  private planWatcherTo(target: Vec3): boolean {
    const watcher = this.requireCell().watcher;
    if (!watcher) return false;
    const groundTarget = { ...target, y: watcher.position.y };
    const path = this.navigation.findPath(watcher.position, groundTarget);
    if (!path.ok) return false;
    this.watcherPath = path.points.map((point) => ({ ...point, y: this.securityDefinition.watcherCruiseAltitude }));
    this.watcherPathIndex = this.watcherPath.length > 1 ? 1 : 0;
    this.watcherPlannedTarget = copyVec3(target);
    watcher.path = this.watcherPath.map(copyVec3);
    watcher.pathIndex = this.watcherPathIndex;
    return true;
  }

  private advanceWatcherPath(dt: number): boolean {
    const watcher = this.requireCell().watcher;
    const target = this.watcherPath[this.watcherPathIndex];
    if (!watcher || !target) return true;
    const dx = target.x - watcher.position.x;
    const dz = target.z - watcher.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= WATCHER_WAYPOINT_RADIUS) {
      this.watcherPathIndex += 1;
      watcher.pathIndex = this.watcherPathIndex;
      if (this.watcherPathIndex >= this.watcherPath.length) {
        this.watcherPath = [];
        this.watcherPlannedTarget = null;
        return true;
      }
      return false;
    }
    const step = Math.min(distance, this.securityDefinition.watcherPatrolSpeed * dt);
    watcher.position.x += dx / distance * step;
    watcher.position.z += dz / distance * step;
    watcher.position.y = this.securityDefinition.watcherCruiseAltitude;
    watcher.facingYaw = Math.atan2(-dx, -dz);
    return false;
  }

  private activeMachineStates(): [HostileMachineId, ScoutDroneRuntimeState][] {
    const cell = this.requireCell();
    const entries: [HostileMachineId, ScoutDroneRuntimeState][] = [[NEEDLE_ID, cell.needle]];
    if (cell.watcher) entries.push([WATCHER_ID, cell.watcher]);
    return entries;
  }

  private requireKnowledge(machineId: HostileMachineId): HostileMachineKnowledge {
    const knowledge = this.requireCell().knowledgeByMachine[machineId];
    if (!knowledge) throw new Error(`Security knowledge missing: ${machineId}`);
    return knowledge;
  }

  private requireCell(): SecurityCellRuntimeState {
    const cell = this.state.securityCell;
    if (!cell) throw new Error("Security cell state is not initialized");
    return cell;
  }

  private isSafeZone(position: Vec3, extractionPoint?: Vec3): boolean {
    return Boolean(extractionPoint && distanceSquared(position, extractionPoint) <= this.definition.safeZoneRadius ** 2);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("SecurityCellController has been disposed");
  }
}

function createWatcher(definition: SecurityCellDefinition): ScoutDroneRuntimeState {
  return {
    id: WATCHER_ID,
    definitionId: "hostile-observation-drone",
    faction: "hostile",
    label: "HOSTILE OBSERVATION DRONE",
    mode: "patrol",
    position: copyVec3(definition.watcherSpawn),
    facing: 0,
    facingYaw: 0,
    targetEntityId: null,
    path: [],
    pathIndex: 0,
    cooldowns: {},
    perception: {
      evaluatedAtSeconds: 0,
      visibleEntityIds: [],
      lastStimulusId: null,
      lastStimulusPosition: null,
    },
    targetAgentId: null,
    lastKnownTargetPosition: null,
    lastObservedAtSeconds: null,
    modeEnteredAtSeconds: 0,
    transitionRevision: 0,
    transitionReason: "watchful posture activated",
    patrolIndex: 0,
    active: true,
    visible: true,
    lockOnProgress: 0,
    sabotageRelayId: null,
    presence: null,
  };
}

function offsetFrom(target: Vec3, origin: Vec3, distance: number): Vec3 {
  const dx = origin.x - target.x;
  const dz = origin.z - target.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    x: target.x + dx / length * distance,
    y: origin.y,
    z: target.z + dz / length * distance,
  };
}
