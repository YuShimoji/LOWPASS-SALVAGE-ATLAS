import { communicationBandRank } from "../communication/CommunicationGraph";
import { copyVec3, distanceSquared, type Vec3 } from "../core/types";
import type { InteractionDefinition } from "../interaction/interactionTypes";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import type { NavigationPathResult } from "../navigation/navigationTypes";
import type { DistributedSquadState, CrewId } from "../squad/squadTypes";
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
const TRACK_STANDOFF_DISTANCE = 1.65;
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

export class ScoutDroneController {
  readonly state: ThreatEncounterState;
  private pathPoints: Vec3[] = [];
  private pathIndex = 0;
  private plannedTarget: Vec3 | null = null;
  private reportSequence = 0;
  private disposed = false;

  constructor(
    readonly definition: ScoutDroneEncounterDefinition,
    agentIds: readonly CrewId[],
    private readonly navigation: WaypointNavigationService,
    startedAtSeconds = 0,
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
        label: definition.label,
        mode: "dormant",
        position: copyVec3(definition.spawn),
        facingYaw: Math.PI,
        targetAgentId: null,
        lastKnownTargetPosition: null,
        lastObservedAtSeconds: null,
        modeEnteredAtSeconds: startedAtSeconds,
        transitionRevision: 0,
        transitionReason: "encounter registered",
        patrolIndex: 0,
        active: true,
        visible: true,
      },
      byAgent,
      communicationRevisionHandled: -1,
      reportRevision: 0,
      deliveryRevision: 0,
      resolution: "active",
    };
  }

  fixedUpdate(
    dt: number,
    elapsedSeconds: number,
    squad: DistributedSquadState,
    hasLineOfSight: ThreatLineOfSightQuery,
    getCommunication: ThreatCommunicationQuery,
  ): void {
    this.assertActive();
    this.updateKnowledge(elapsedSeconds, squad, hasLineOfSight);
    if (squad.communicationRevision !== this.state.communicationRevisionHandled) {
      this.propagatePendingReports(elapsedSeconds, squad, getCommunication);
      this.state.communicationRevisionHandled = squad.communicationRevision;
    }
    this.updateDrone(dt, elapsedSeconds, squad, hasLineOfSight);
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
    return this.state.drone.active ? 1 : 0;
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
    const nearest = visibleTargets[0] ?? null;

    if (drone.mode === "patrol") {
      if (nearest) {
        this.acquireTarget(nearest, elapsedSeconds, "patrol sensor contact");
        this.transition("investigate", elapsedSeconds, `investigate ${nearest.id}`);
        this.planTo(nearest.position);
        return;
      }
      if (this.advancePath(dt, this.definition.patrolSpeed)) {
        drone.patrolIndex = (drone.patrolIndex + 1) % Math.max(this.definition.patrolPoints.length, 1);
        this.planTo(this.definition.patrolPoints[drone.patrolIndex] ?? this.definition.spawn);
      }
      return;
    }

    if (drone.mode === "investigate") {
      if (visibleCurrent) this.acquireTarget(visibleCurrent, elapsedSeconds, "investigation visual maintained");
      else if (nearest) this.acquireTarget(nearest, elapsedSeconds, "investigation target changed");
      if (drone.lastKnownTargetPosition) {
        if (!this.plannedTarget || distanceSquared(this.plannedTarget, drone.lastKnownTargetPosition) >= 0.8 ** 2) {
          this.planTo(drone.lastKnownTargetPosition);
        }
        this.advancePath(dt, this.definition.patrolSpeed);
      }
      if (elapsedSeconds - drone.modeEnteredAtSeconds >= this.definition.investigateSeconds) {
        this.transition("track", elapsedSeconds, `track ${drone.targetAgentId ?? "last-known"}`);
      }
      return;
    }

    if (drone.mode === "track") {
      if (visibleCurrent) this.acquireTarget(visibleCurrent, elapsedSeconds, "tracking visual maintained");
      else if (nearest) this.acquireTarget(nearest, elapsedSeconds, "tracking target changed");
      const lastSeenAgo = drone.lastObservedAtSeconds === null
        ? Number.POSITIVE_INFINITY
        : elapsedSeconds - drone.lastObservedAtSeconds;
      if (lastSeenAgo > this.definition.lostSightGraceSeconds) {
        this.transition("search_last_known", elapsedSeconds, "visual contact lost");
        if (drone.lastKnownTargetPosition) this.planTo(drone.lastKnownTargetPosition);
        return;
      }
      if (drone.lastKnownTargetPosition && distanceSquared(drone.position, drone.lastKnownTargetPosition) > TRACK_STANDOFF_DISTANCE ** 2) {
        if (!this.plannedTarget || distanceSquared(this.plannedTarget, drone.lastKnownTargetPosition) >= 0.8 ** 2) {
          this.planTo(drone.lastKnownTargetPosition);
        }
        this.advancePath(dt, this.definition.pursuitSpeed);
      }
      return;
    }

    if (drone.mode === "search_last_known") {
      if (nearest) {
        this.acquireTarget(nearest, elapsedSeconds, "target reacquired during search");
        this.transition("track", elapsedSeconds, `reacquired ${nearest.id}`);
        return;
      }
      this.advancePath(dt, this.definition.patrolSpeed);
      if (elapsedSeconds - drone.modeEnteredAtSeconds >= this.definition.searchSeconds) {
        this.transition("disengage", elapsedSeconds, "last-known search expired");
        drone.targetAgentId = null;
        this.planTo(this.definition.spawn);
      }
      return;
    }

    if (drone.mode === "disengage" && this.advancePath(dt, this.definition.pursuitSpeed)) {
      drone.active = false;
      drone.visible = false;
      this.state.resolution = "disengaged";
    }
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
