import { communicationBandRank } from "../communication/CommunicationGraph";
import { copyVec3, distanceSquared, type Vec3 } from "../core/types";
import type { InteractionDefinition } from "../interaction/interactionTypes";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import type { NavigationPathResult } from "../navigation/navigationTypes";
import type { DistributedSquadState, CrewId } from "../squad/squadTypes";
import type { MachineStimulus, PorterAndroidState } from "../machines/machineTypes";
import {
  assessPresence,
  DEFAULT_PRESENCE_SETTINGS,
  PresenceHysteresis,
  type PresenceAssessment,
  type PresenceEntity,
} from "./PresenceService";
import type {
  AgentThreatKnowledge,
  ScoutDroneEncounterDefinition,
  ScoutDroneMode,
  ThreatCommunicationStatus,
  ThreatDisableResolution,
  ThreatEncounterState,
  ThreatReport,
} from "./threatTypes";

const DRONE_WAYPOINT_RADIUS = 0.24;
const REPORT_INTERVAL_SECONDS = 2;
const REPORT_MOVEMENT_DISTANCE = 1.1;
const RECEIVED_REPORT_HISTORY_LIMIT = 32;

export type ThreatLineOfSightQuery = (from: Vec3, to: Vec3) => boolean;
export type ThreatCommunicationQuery = (sourceAgentId: CrewId, targetAgentId: CrewId) => ThreatCommunicationStatus;

interface VisibleTarget {
  readonly id: CrewId;
  readonly position: Vec3;
  readonly distanceSquared: number;
}

export interface ThreatRelayStimulus extends MachineStimulus {
  readonly kind: "relay";
  readonly disabled: boolean;
}

export interface ThreatEcologyContext {
  readonly extractionPoint: Vec3;
  readonly stimuli: readonly MachineStimulus[];
  readonly relays: readonly ThreatRelayStimulus[];
  readonly friendlyMachine: PorterAndroidState | null;
  readonly onInterdict?: (targetAgentId: CrewId) => void;
  readonly onRelaySabotage?: (relayItemId: string) => void;
}

export class ScoutDroneController {
  readonly state: ThreatEncounterState;
  private pathPoints: Vec3[] = [];
  private pathIndex = 0;
  private plannedTarget: Vec3 | null = null;
  private reportSequence = 0;
  private decisionAccumulator = 0.25;
  private perceptionAccumulator = 0.2;
  private presenceHysteresis: PresenceHysteresis | null = null;
  private ecologyContext: ThreatEcologyContext | null = null;
  private disposed = false;

  constructor(
    readonly definition: ScoutDroneEncounterDefinition,
    agentIds: readonly CrewId[],
    private readonly navigation: WaypointNavigationService,
    startedAtSeconds = 0,
    debugDroneCount = 1,
  ) {
    const byAgent: Record<string, AgentThreatKnowledge> = {};
    for (const agentId of [...agentIds].sort()) {
      byAgent[agentId] = {
        contact: null,
        pendingReports: {},
        receivedReportIds: [],
        lastLocalReportAtSeconds: Number.NEGATIVE_INFINITY,
        lastLocalReportPosition: null,
      };
    }
    this.state = {
      drone: {
        id: definition.id,
        definitionId: "hostile-scout-drone",
        faction: "hostile",
        label: definition.label,
        mode: "dormant",
        position: copyVec3(definition.spawn),
        facing: Math.PI,
        facingYaw: Math.PI,
        targetEntityId: null,
        path: [],
        pathIndex: 0,
        cooldowns: {},
        perception: {
          evaluatedAtSeconds: startedAtSeconds,
          visibleEntityIds: [],
          lastStimulusId: null,
          lastStimulusPosition: null,
        },
        targetAgentId: null,
        lastKnownTargetPosition: null,
        lastObservedAtSeconds: null,
        modeEnteredAtSeconds: startedAtSeconds,
        transitionRevision: 0,
        transitionReason: "encounter registered",
        patrolIndex: 0,
        active: true,
        visible: true,
        lockOnProgress: 0,
        sabotageRelayId: null,
        presence: null,
      },
      additionalDrones: [],
      byAgent,
      communicationRevisionHandled: -1,
      reportRevision: 0,
      deliveryRevision: 0,
      resolution: "active",
      firstRetreatAnalysisRevision: 0,
      interferenceRevision: 0,
    };
    for (let index = 1; index < Math.min(2, Math.max(1, debugDroneCount)); index += 1) {
      this.state.additionalDrones.push({
        ...structuredClone(this.state.drone),
        id: `${definition.id}-debug-${index + 1}`,
        position: { ...definition.spawn, x: definition.spawn.x - 2.2 },
      });
    }
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
    this.ecologyContext = ecologyContext;
    this.perceptionAccumulator += dt;
    if (this.perceptionAccumulator >= this.definition.perceptionIntervalSeconds) {
      this.perceptionAccumulator %= this.definition.perceptionIntervalSeconds;
      this.updateKnowledge(elapsedSeconds, squad, hasLineOfSight);
    }
    if (squad.communicationRevision !== this.state.communicationRevisionHandled) {
      this.propagatePendingReports(elapsedSeconds, squad, getCommunication);
      this.state.communicationRevisionHandled = squad.communicationRevision;
    }
    this.decisionAccumulator += dt;
    const decisionDue = this.decisionAccumulator >= this.definition.decisionIntervalSeconds;
    if (decisionDue) this.decisionAccumulator %= this.definition.decisionIntervalSeconds;
    this.updateDrone(dt, elapsedSeconds, squad, hasLineOfSight, getCommunication, decisionDue);
  }

  getInteractions(): readonly InteractionDefinition[] {
    const drone = this.state.drone;
    if (!drone.active || drone.mode === "dormant") return [];
    return [{
      id: `threat-disable:${drone.id}`,
      position: copyVec3(drone.position),
      radius: this.definition.disableRange,
      prompt: "E  FIELD TERMINAL // SCOUT DRONE JAM",
      response: "非致死性ジャムを試行",
      action: { type: "mission-threat-disable", threatId: drone.id },
    }];
  }

  attemptDisable(
    agentId: CrewId,
    agentPosition: Vec3,
    hasFieldTerminal: boolean,
    elapsedSeconds: number,
    hasLineOfSight: ThreatLineOfSightQuery,
  ): ThreatDisableResolution {
    const agentKnowledge = this.state.byAgent[agentId];
    if (!agentKnowledge) return { accepted: false, code: "UNKNOWN_AGENT", reason: "対象隊員は遠征に参加していません" };
    if (!this.state.drone.active) {
      return { accepted: false, code: "THREAT_ALREADY_RESOLVED", reason: "ScoutDrone接触はすでに解決しています" };
    }
    if (!hasFieldTerminal) {
      return { accepted: false, code: "FIELD_TERMINAL_REQUIRED", reason: "非致死性ジャムには簡易フィールド端末が必要です" };
    }
    if (distanceSquared(agentPosition, this.state.drone.position) > this.definition.disableRange ** 2) {
      return { accepted: false, code: "THREAT_OUT_OF_RANGE", reason: "ScoutDroneがジャム有効距離外です" };
    }
    if (!hasLineOfSight(this.sensorPoint(agentPosition), this.state.drone.position)) {
      return { accepted: false, code: "THREAT_OCCLUDED", reason: "ScoutDroneへの見通しが遮られています" };
    }
    this.transition("disabled", elapsedSeconds, `${agentId} field-terminal jam`);
    this.state.drone.active = false;
    this.state.resolution = "disabled";
    this.observeLocally(agentId, elapsedSeconds, true);
    return { accepted: true, code: "THREAT_DISABLED", reason: "ScoutDroneを非致死性ジャムで停止しました" };
  }

  getActiveDroneCount(): number {
    return Number(this.state.drone.active) + this.state.additionalDrones.filter((drone) => drone.active).length;
  }

  getPendingReportCount(): number {
    return Object.values(this.state.byAgent).reduce(
      (total, knowledge) => total + Object.keys(knowledge.pendingReports).length,
      0,
    );
  }

  getDebugReadback(controlledAgentId: CrewId): {
    readonly mode: ScoutDroneMode;
    readonly targetAgentId: CrewId | null;
    readonly lastKnownTargetPosition: Vec3 | null;
    readonly observerAgentIds: CrewId[];
    readonly transitionReason: string;
    readonly transitionRevision: number;
    readonly controlledContact: AgentThreatKnowledge["contact"];
    readonly pendingReportCount: number;
    readonly presence: PresenceAssessment | null;
    readonly lockOnProgress: number;
  } {
    const observerAgentIds = (Object.entries(this.state.byAgent) as [CrewId, AgentThreatKnowledge][])
      .filter(([, knowledge]) => knowledge.contact?.route === "direct" && knowledge.contact.freshness === "live")
      .map(([agentId]) => agentId)
      .sort();
    return {
      mode: this.state.drone.mode,
      targetAgentId: this.state.drone.targetAgentId,
      lastKnownTargetPosition: this.state.drone.lastKnownTargetPosition
        ? copyVec3(this.state.drone.lastKnownTargetPosition)
        : null,
      observerAgentIds,
      transitionReason: this.state.drone.transitionReason,
      transitionRevision: this.state.drone.transitionRevision,
      controlledContact: this.state.byAgent[controlledAgentId]?.contact
        ? structuredClone(this.state.byAgent[controlledAgentId]?.contact)
        : null,
      pendingReportCount: this.getPendingReportCount(),
      presence: this.state.drone.presence ? structuredClone(this.state.drone.presence) : null,
      lockOnProgress: this.state.drone.lockOnProgress,
    };
  }

  setDronePositionForQa(position: Vec3, facingYaw = Math.PI): void {
    this.state.drone.position = { x: position.x, y: this.definition.cruiseAltitude, z: position.z };
    this.state.drone.facingYaw = facingYaw;
    this.pathPoints = [];
    this.pathIndex = 0;
    this.plannedTarget = null;
  }

  dispose(): void {
    this.disposed = true;
    this.pathPoints = [];
  }

  private updateKnowledge(
    elapsedSeconds: number,
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
  ): void {
    const drone = this.state.drone;
    if (drone.visible) {
      for (const agent of Object.values(squad.agents).sort((left, right) => left.id.localeCompare(right.id))) {
        if (agent.controlMode === "incapacitated") continue;
        const inRange = distanceSquared(agent.position, drone.position) <= this.definition.observationRange ** 2;
        if (inRange && hasLineOfSight(this.sensorPoint(agent.position), drone.position)) {
          this.observeLocally(agent.id, elapsedSeconds, false);
        }
      }
    }
    for (const knowledge of Object.values(this.state.byAgent)) {
      if (!knowledge.contact) continue;
      knowledge.contact.freshness = elapsedSeconds - knowledge.contact.observedAtSeconds <= this.definition.staleAfterSeconds
        ? "live"
        : "stale";
    }
  }

  private observeLocally(agentId: CrewId, elapsedSeconds: number, forceReport: boolean): void {
    const knowledge = this.state.byAgent[agentId];
    if (!knowledge) return;
    const previous = knowledge.contact;
    const shouldReport = forceReport
      || !previous
      || previous.freshness === "stale"
      || previous.route !== "direct"
      || previous.observedByAgentId !== agentId
      || (this.state.drone.active && elapsedSeconds - knowledge.lastLocalReportAtSeconds >= REPORT_INTERVAL_SECONDS)
      || !knowledge.lastLocalReportPosition
      || distanceSquared(knowledge.lastLocalReportPosition, this.state.drone.position) >= REPORT_MOVEMENT_DISTANCE ** 2;
    const reportId = shouldReport ? this.nextReportId(agentId) : previous.reportId;
    knowledge.contact = {
      droneId: this.state.drone.id,
      position: copyVec3(this.state.drone.position),
      observedByAgentId: agentId,
      observedAtSeconds: elapsedSeconds,
      receivedAtSeconds: elapsedSeconds,
      freshness: "live",
      route: "direct",
      reportId,
    };
    if (!shouldReport) return;
    knowledge.lastLocalReportAtSeconds = elapsedSeconds;
    knowledge.lastLocalReportPosition = copyVec3(this.state.drone.position);
    for (const recipientAgentId of Object.keys(this.state.byAgent).sort() as CrewId[]) {
      if (recipientAgentId === agentId) continue;
      for (const [pendingId, pending] of Object.entries(knowledge.pendingReports)) {
        if (pending.recipientAgentId === recipientAgentId) delete knowledge.pendingReports[pendingId];
      }
      const pendingId = `${reportId}:${recipientAgentId}`;
      knowledge.pendingReports[pendingId] = {
        id: reportId,
        droneId: this.state.drone.id,
        senderAgentId: agentId,
        recipientAgentId,
        observedByAgentId: agentId,
        position: copyVec3(this.state.drone.position),
        observedAtSeconds: elapsedSeconds,
        createdAtSeconds: elapsedSeconds,
      };
    }
    this.state.reportRevision += 1;
  }

  private propagatePendingReports(
    elapsedSeconds: number,
    squad: DistributedSquadState,
    getCommunication: ThreatCommunicationQuery,
  ): void {
    for (const senderAgentId of Object.keys(this.state.byAgent).sort() as CrewId[]) {
      const senderKnowledge = this.state.byAgent[senderAgentId];
      if (!senderKnowledge || !squad.agents[senderAgentId]) continue;
      for (const [pendingId, report] of Object.entries(senderKnowledge.pendingReports).sort(([left], [right]) => left.localeCompare(right))) {
        if (!squad.agents[report.recipientAgentId]) {
          delete senderKnowledge.pendingReports[pendingId];
          continue;
        }
        const status = getCommunication(senderAgentId, report.recipientAgentId);
        if (!status.localInstructionAllowed && communicationBandRank(status.band) < 1) continue;
        const recipient = this.state.byAgent[report.recipientAgentId];
        if (!recipient) continue;
        if (!recipient.receivedReportIds.includes(report.id)) {
          this.deliverReport(recipient, report, elapsedSeconds, status);
          recipient.receivedReportIds.push(report.id);
          if (recipient.receivedReportIds.length > RECEIVED_REPORT_HISTORY_LIMIT) {
            recipient.receivedReportIds.splice(0, recipient.receivedReportIds.length - RECEIVED_REPORT_HISTORY_LIMIT);
          }
          this.state.deliveryRevision += 1;
        }
        delete senderKnowledge.pendingReports[pendingId];
      }
    }
  }

  private deliverReport(
    recipient: AgentThreatKnowledge,
    report: ThreatReport,
    elapsedSeconds: number,
    status: ThreatCommunicationStatus,
  ): void {
    if (recipient.contact && recipient.contact.observedAtSeconds > report.observedAtSeconds) return;
    recipient.contact = {
      droneId: report.droneId,
      position: copyVec3(report.position),
      observedByAgentId: report.observedByAgentId,
      observedAtSeconds: report.observedAtSeconds,
      receivedAtSeconds: elapsedSeconds,
      freshness: elapsedSeconds - report.observedAtSeconds <= this.definition.staleAfterSeconds ? "live" : "stale",
      route: status.localInstructionAllowed ? "local" : status.band,
      reportId: report.id,
    };
  }

  private updateDrone(
    dt: number,
    elapsedSeconds: number,
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
    getCommunication: ThreatCommunicationQuery,
    decisionDue: boolean,
  ): void {
    const drone = this.state.drone;
    if (!drone.active) return;
    if (drone.mode === "dormant") {
      if (elapsedSeconds - drone.modeEnteredAtSeconds >= this.definition.dormantSeconds) {
        this.transition("patrol", elapsedSeconds, "wake timer elapsed");
        this.planTo(this.definition.patrolPoints[drone.patrolIndex] ?? this.definition.spawn);
      }
      return;
    }
    const visibleTargets = this.findVisibleTargets(squad, hasLineOfSight);
    const visibleCurrent = visibleTargets.find((target) => target.id === drone.targetAgentId) ?? null;
    if (visibleCurrent) this.acquireTarget(visibleCurrent, elapsedSeconds, "visual maintained");

    if (drone.mode === "lock-on") {
      const assessment = visibleCurrent
        ? this.evaluatePresence(visibleCurrent, elapsedSeconds, squad, hasLineOfSight, true)
        : null;
      const unsafe = !visibleCurrent
        || !assessment
        || assessment.band === "outnumbered"
        || distanceSquared(drone.position, visibleCurrent.position) > this.definition.interdictRange ** 2
        || this.isSafeZone(visibleCurrent.position);
      if (unsafe) {
        if (assessment?.band === "outnumbered") this.beginDisengage(elapsedSeconds, "lock-on aborted by allied reinforcement");
        else this.transition("stalk", elapsedSeconds, "lock-on aborted by sight/range/safe-zone");
        drone.lockOnProgress = 0;
        return;
      }
      drone.lockOnProgress = Math.min(1, (elapsedSeconds - drone.modeEnteredAtSeconds) / this.definition.lockOnSeconds);
      if (elapsedSeconds - drone.modeEnteredAtSeconds >= this.definition.lockOnSeconds) {
        this.transition("interdict", elapsedSeconds, `interdict ${visibleCurrent.id}`);
        drone.cooldowns.interdictUntilSeconds = elapsedSeconds + this.definition.interdictCooldownSeconds;
        this.state.interferenceRevision += 1;
        this.ecologyContext?.onInterdict?.(visibleCurrent.id);
      }
      return;
    }

    if (drone.mode === "interdict") {
      drone.lockOnProgress = 0;
      this.beginDisengage(elapsedSeconds, "interference pulse complete");
      return;
    }

    if (drone.mode === "disengage") {
      if (this.advancePath(dt, this.definition.pursuitSpeed)) {
        this.transition("observe", elapsedSeconds, "retreat point reached; rescanning");
      }
      return;
    }

    if (drone.mode === "observe") {
      if (elapsedSeconds - drone.modeEnteredAtSeconds >= this.definition.retreatHoldSeconds) {
        this.transition("return-to-route", elapsedSeconds, "rescan complete");
        this.planTo(this.definition.patrolPoints[drone.patrolIndex] ?? this.definition.spawn);
      }
      return;
    }

    if (drone.mode === "return-to-route") {
      if (this.advancePath(dt, this.definition.patrolSpeed)) this.transition("patrol", elapsedSeconds, "patrol route resumed");
      return;
    }

    if (drone.mode === "sabotage-relay") {
      const relay = this.ecologyContext?.relays.find((candidate) => candidate.id === drone.sabotageRelayId) ?? null;
      if (!relay || relay.disabled || this.isRelayDefended(relay.position, squad) || this.isSafeZone(relay.position)) {
        drone.sabotageRelayId = null;
        this.transition("return-to-route", elapsedSeconds, "relay sabotage aborted");
        this.planTo(this.definition.patrolPoints[drone.patrolIndex] ?? this.definition.spawn);
        return;
      }
      if (distanceSquared(drone.position, relay.position) > 1.2 ** 2) {
        this.advancePath(dt, this.definition.pursuitSpeed);
        return;
      }
      if (elapsedSeconds - drone.modeEnteredAtSeconds >= this.definition.relaySabotageSeconds) {
        this.ecologyContext?.onRelaySabotage?.(relay.id);
        drone.sabotageRelayId = null;
        this.transition("return-to-route", elapsedSeconds, "relay disabled");
        this.planTo(this.definition.patrolPoints[drone.patrolIndex] ?? this.definition.spawn);
      }
      return;
    }

    if (!decisionDue) {
      if (drone.mode === "patrol" || drone.mode === "investigate" || drone.mode === "stalk") {
        const speed = drone.mode === "stalk" ? this.definition.pursuitSpeed : this.definition.patrolSpeed;
        this.advancePath(dt, speed);
      }
      return;
    }

    const target = this.selectTarget(visibleTargets, elapsedSeconds, squad, hasLineOfSight, getCommunication);
    if (target) {
      const assessment = this.evaluatePresence(target, elapsedSeconds, squad, hasLineOfSight, drone.mode === "stalk");
      if (assessment.band === "outnumbered") {
        this.beginDisengage(elapsedSeconds, "local allied presence outnumbers drone");
        return;
      }
      this.acquireTarget(target, elapsedSeconds, "isolated target scored by presence/comms/range");
      if (drone.mode !== "stalk") {
        this.transition("stalk", elapsedSeconds, `stalk ${target.id}`);
        this.planTo(target.position);
        return;
      }
      if (
        !this.isSafeZone(target.position)
        && distanceSquared(drone.position, target.position) <= this.definition.interdictRange ** 2
        && (drone.cooldowns.interdictUntilSeconds ?? 0) <= elapsedSeconds
      ) {
        this.transition("lock-on", elapsedSeconds, `lock-on ${target.id}`);
        drone.lockOnProgress = 0;
        return;
      }
      if (!this.plannedTarget || distanceSquared(this.plannedTarget, target.position) >= 0.8 ** 2) this.planTo(target.position);
      return;
    }

    const relay = this.findSabotageRelay(squad);
    if (relay) {
      drone.sabotageRelayId = relay.id;
      this.transition("sabotage-relay", elapsedSeconds, `sabotage ${relay.id}`);
      this.planTo(relay.position);
      return;
    }

    const flare = this.findFlareStimulus(squad, hasLineOfSight, elapsedSeconds);
    if (flare) {
      drone.perception.lastStimulusId = flare.stimulus.id;
      drone.perception.lastStimulusPosition = copyVec3(flare.stimulus.position);
      this.transition(flare.grouped ? "observe" : "investigate", elapsedSeconds, flare.grouped ? "grouped flare observed" : "isolated flare investigated");
      if (!flare.grouped) this.planTo(flare.stimulus.position);
      return;
    }

    if (drone.mode === "investigate") {
      if (this.advancePath(dt, this.definition.patrolSpeed)) {
        this.transition("return-to-route", elapsedSeconds, "stimulus location checked");
        this.planTo(this.definition.patrolPoints[drone.patrolIndex] ?? this.definition.spawn);
      }
      return;
    }
    if (drone.mode !== "patrol") {
      this.transition("patrol", elapsedSeconds, "no higher priority stimulus");
      this.planTo(this.definition.patrolPoints[drone.patrolIndex] ?? this.definition.spawn);
      return;
    }
    if (this.advancePath(dt, this.definition.patrolSpeed)) {
      drone.patrolIndex = (drone.patrolIndex + 1) % Math.max(this.definition.patrolPoints.length, 1);
      this.planTo(this.definition.patrolPoints[drone.patrolIndex] ?? this.definition.spawn);
    }
  }

  armIsolatedContactForQa(position: Vec3, elapsedSeconds: number, facingYaw = Math.PI): void {
    this.setDronePositionForQa(position, facingYaw);
    this.state.drone.cooldowns = {};
    this.state.drone.targetAgentId = null;
    this.state.drone.targetEntityId = null;
    this.state.drone.presence = null;
    this.state.drone.lockOnProgress = 0;
    this.presenceHysteresis = null;
    this.transition("patrol", elapsedSeconds, "qa isolated contact armed");
  }

  private selectTarget(
    visibleTargets: readonly VisibleTarget[],
    elapsedSeconds: number,
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
    getCommunication: ThreatCommunicationQuery,
  ): VisibleTarget | null {
    return [...visibleTargets]
      .filter((target) => !this.isSafeZone(target.position))
      .filter((target) => (this.state.drone.cooldowns[`reacquire:${target.id}`] ?? 0) <= elapsedSeconds)
      .map((target) => {
        const assessment = this.evaluatePresence(target, elapsedSeconds, squad, hasLineOfSight, false);
        const controlledId = squad.control.controlledAgentId;
        const communication = getCommunication(controlledId, target.id);
        const bandScore = assessment.band === "predatory" ? 0 : assessment.band === "cautious" ? 1 : 2;
        const communicationScore = communication.band === "none" ? 0 : communication.band === "burst" ? 1 : communication.band === "voice" ? 2 : 3;
        return { target, bandScore, communicationScore };
      })
      .sort((left, right) => left.bandScore - right.bandScore
        || left.communicationScore - right.communicationScore
        || left.target.distanceSquared - right.target.distanceSquared
        || left.target.id.localeCompare(right.target.id))[0]?.target ?? null;
  }

  private evaluatePresence(
    target: VisibleTarget,
    elapsedSeconds: number,
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
    immediateOutnumbered: boolean,
  ): PresenceAssessment {
    const entities: PresenceEntity[] = [];
    for (const agent of Object.values(squad.agents)) {
      entities.push({
        id: agent.id,
        side: "allied",
        kind: "crew",
        position: agent.position,
        operational: agent.controlMode !== "incapacitated",
        perceptible: this.isRecognizable(agent.position, hasLineOfSight),
      });
    }
    const machine = this.ecologyContext?.friendlyMachine;
    if (machine?.authenticated) {
      entities.push({
        id: machine.id,
        side: "allied",
        kind: "friendly-machine",
        position: machine.position,
        operational: machine.mode !== "path-failed",
        perceptible: this.isRecognizable(machine.position, hasLineOfSight),
      });
    }
    entities.push({
      id: this.state.drone.id,
      side: "hostile",
      kind: "hostile-drone",
      position: this.state.drone.position,
      operational: this.state.drone.active,
      perceptible: true,
    });
    for (const additional of this.state.additionalDrones) {
      entities.push({ id: additional.id, side: "hostile", kind: "hostile-drone", position: additional.position, operational: additional.active, perceptible: true });
    }
    const settings = {
      ...DEFAULT_PRESENCE_SETTINGS,
      radius: this.definition.presenceRadius,
      hysteresisSeconds: this.definition.presenceHysteresisSeconds,
      sameTargetCooldownSeconds: this.definition.sameTargetCooldownSeconds,
    };
    const raw = assessPresence(target.id, target.position, entities, elapsedSeconds, hasLineOfSight, settings);
    if (!this.presenceHysteresis || this.presenceHysteresis.state.current.targetAgentId !== target.id) {
      this.presenceHysteresis = new PresenceHysteresis(raw, settings);
    }
    const stable = this.presenceHysteresis.update(raw, elapsedSeconds, immediateOutnumbered);
    this.state.drone.presence = structuredClone(stable);
    return stable;
  }

  private findSabotageRelay(squad: DistributedSquadState): ThreatRelayStimulus | null {
    return this.ecologyContext?.relays
      .filter((relay) => relay.active && !relay.disabled)
      .filter((relay) => distanceSquared(relay.position, this.state.drone.position) <= this.definition.relaySabotageRange ** 2)
      .filter((relay) => !this.isSafeZone(relay.position) && !this.isRelayDefended(relay.position, squad))
      .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
  }

  private isRelayDefended(position: Vec3, squad: DistributedSquadState): boolean {
    const defendedByCrew = Object.values(squad.agents).some((agent) =>
      agent.controlMode !== "incapacitated" && distanceSquared(agent.position, position) <= this.definition.relayDefenseRadius ** 2,
    );
    const machine = this.ecologyContext?.friendlyMachine;
    return defendedByCrew || Boolean(
      machine?.authenticated && machine.mode !== "path-failed"
      && distanceSquared(machine.position, position) <= this.definition.relayDefenseRadius ** 2,
    );
  }

  private findFlareStimulus(
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
    elapsedSeconds: number,
  ): { stimulus: MachineStimulus; grouped: boolean } | null {
    const stimulus = this.ecologyContext?.stimuli
      .filter((candidate) => candidate.kind === "flare" && candidate.active)
      .filter((candidate) => distanceSquared(candidate.position, this.state.drone.position) <= this.definition.detectionRange ** 2)
      .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
    if (!stimulus || stimulus.id === this.state.drone.perception.lastStimulusId) return null;
    const nearbyCrew = Object.values(squad.agents).filter((agent) =>
      agent.controlMode !== "incapacitated"
      && distanceSquared(agent.position, stimulus.position) <= 3.2 ** 2
      && hasLineOfSight(stimulus.position, agent.position),
    );
    this.state.drone.perception.evaluatedAtSeconds = elapsedSeconds;
    return { stimulus, grouped: nearbyCrew.length >= 2 };
  }

  private beginDisengage(elapsedSeconds: number, reason: string): void {
    const targetId = this.state.drone.targetAgentId;
    if (targetId) this.state.drone.cooldowns[`reacquire:${targetId}`] = elapsedSeconds + this.definition.sameTargetCooldownSeconds;
    this.state.drone.lockOnProgress = 0;
    this.transition("disengage", elapsedSeconds, reason);
    this.planTo(this.definition.spawn);
    if (this.state.firstRetreatAnalysisRevision === 0) this.state.firstRetreatAnalysisRevision = 1;
  }

  private isSafeZone(position: Vec3): boolean {
    const extraction = this.ecologyContext?.extractionPoint;
    return Boolean(extraction && distanceSquared(position, extraction) <= this.definition.safeZoneRadius ** 2);
  }

  private isRecognizable(position: Vec3, hasLineOfSight: ThreatLineOfSightQuery): boolean {
    const drone = this.state.drone;
    const dx = position.x - drone.position.x;
    const dz = position.z - drone.position.z;
    const horizontalDistance = Math.hypot(dx, dz);
    if (horizontalDistance > this.definition.observationRange) return false;
    const forwardX = -Math.sin(drone.facingYaw);
    const forwardZ = -Math.cos(drone.facingYaw);
    const minimumDot = Math.cos((this.definition.fieldOfViewDegrees * Math.PI / 180) / 2);
    const dot = horizontalDistance <= 0.001 ? 1 : (dx / horizontalDistance) * forwardX + (dz / horizontalDistance) * forwardZ;
    return dot >= minimumDot && hasLineOfSight(drone.position, this.sensorPoint(position));
  }

  private findVisibleTargets(
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
  ): VisibleTarget[] {
    const drone = this.state.drone;
    const forwardX = -Math.sin(drone.facingYaw);
    const forwardZ = -Math.cos(drone.facingYaw);
    const minimumDot = Math.cos((this.definition.fieldOfViewDegrees * Math.PI / 180) / 2);
    const targets: VisibleTarget[] = [];
    for (const agent of Object.values(squad.agents)) {
      if (agent.controlMode === "incapacitated") continue;
      const dx = agent.position.x - drone.position.x;
      const dz = agent.position.z - drone.position.z;
      const horizontalDistance = Math.hypot(dx, dz);
      if (horizontalDistance > this.definition.detectionRange) continue;
      const dot = horizontalDistance <= 0.001 ? 1 : (dx / horizontalDistance) * forwardX + (dz / horizontalDistance) * forwardZ;
      if (dot < minimumDot) continue;
      if (!hasLineOfSight(drone.position, this.sensorPoint(agent.position))) continue;
      targets.push({ id: agent.id, position: copyVec3(agent.position), distanceSquared: distanceSquared(agent.position, drone.position) });
    }
    return targets.sort((left, right) => left.distanceSquared - right.distanceSquared || left.id.localeCompare(right.id));
  }

  private acquireTarget(target: VisibleTarget, elapsedSeconds: number, reason: string): void {
    this.state.drone.targetAgentId = target.id;
    this.state.drone.targetEntityId = target.id;
    this.state.drone.lastKnownTargetPosition = copyVec3(target.position);
    this.state.drone.lastObservedAtSeconds = elapsedSeconds;
    this.state.drone.transitionReason = reason;
  }

  private planTo(target: Vec3): boolean {
    const result = this.navigation.findPath(this.state.drone.position, target);
    if (!result.ok) {
      this.pathPoints = [];
      this.pathIndex = 0;
      this.plannedTarget = copyVec3(target);
      return false;
    }
    this.applyPath(result, target);
    return true;
  }

  private applyPath(path: Extract<NavigationPathResult, { ok: true }>, target: Vec3): void {
    this.pathPoints = path.points.map((point) => ({ x: point.x, y: this.definition.cruiseAltitude, z: point.z }));
    this.pathIndex = this.pathPoints.length > 1 ? 1 : 0;
    this.state.drone.path = this.pathPoints.map(copyVec3);
    this.state.drone.pathIndex = this.pathIndex;
    this.plannedTarget = copyVec3(target);
  }

  private advancePath(dt: number, speed: number): boolean {
    const drone = this.state.drone;
    while (this.pathIndex < this.pathPoints.length) {
      const target = this.pathPoints[this.pathIndex];
      if (!target) break;
      const dx = target.x - drone.position.x;
      const dz = target.z - drone.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= DRONE_WAYPOINT_RADIUS) {
        this.pathIndex += 1;
        continue;
      }
      const step = Math.min(distance, speed * dt);
      drone.position.x += (dx / distance) * step;
      drone.position.z += (dz / distance) * step;
      drone.position.y = this.definition.cruiseAltitude;
      drone.facingYaw = Math.atan2(-dx, -dz);
      drone.facing = drone.facingYaw;
      drone.pathIndex = this.pathIndex;
      return false;
    }
    return true;
  }

  private transition(mode: ScoutDroneMode, elapsedSeconds: number, reason: string): void {
    const drone = this.state.drone;
    if (drone.mode === mode) return;
    drone.mode = mode;
    drone.modeEnteredAtSeconds = elapsedSeconds;
    drone.transitionRevision += 1;
    drone.transitionReason = reason;
    this.pathPoints = [];
    this.pathIndex = 0;
    this.plannedTarget = null;
    drone.path = [];
    drone.pathIndex = 0;
  }

  private nextReportId(agentId: CrewId): string {
    this.reportSequence += 1;
    return `threat-report:${this.state.drone.id}:${agentId}:${this.reportSequence}`;
  }

  private sensorPoint(position: Vec3): Vec3 {
    return { x: position.x, y: 1.25, z: position.z };
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("ScoutDroneController has been disposed");
  }
}
