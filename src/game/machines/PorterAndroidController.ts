import { copyVec3, distanceSquared, type Vec3 } from "../core/types";
import type { InteractionDefinition } from "../interaction/interactionTypes";
import type { ItemLocationLedger } from "../items/itemLocation";
import type { NavigationPathResult } from "../navigation/navigationTypes";
import type { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import type { CrewId } from "../squad/squadTypes";
import { evaluateMachineForGate, type MachineGateEvaluation } from "./machineGateEvaluator";
import type {
  AlliedMachineOutcome,
  PorterAndroidDefinition,
  PorterAndroidMode,
  PorterAndroidState,
} from "./machineTypes";

const WAYPOINT_RADIUS = 0.28;
const FOLLOW_STANDOFF = 1.4;

export interface PorterAuthenticationContext {
  readonly agentId: CrewId;
  readonly position: Vec3;
  readonly operable: boolean;
  readonly hasFieldTerminal: boolean;
  readonly exclusiveOperationActive: boolean;
}

export interface PorterMissionPort {
  readonly missionId: string;
  readonly itemLocations: ItemLocationLedger;
  transferResourceToMachine(itemId: string, machineId: string): boolean;
  placeMachineResourceAtExtraction(itemId: string, machineId: string): boolean;
  placeMachineResourceSafely(itemId: string, machineId: string, position: Vec3): boolean;
}

export interface PorterActionResolution {
  readonly accepted: boolean;
  readonly code: string;
  readonly reason: string;
}

export class PorterAndroidController {
  readonly state: PorterAndroidState;
  private handshakeAgentId: CrewId | null = null;
  private targetItemId: string | null = null;
  private followAgentId: CrewId | null = null;
  private failureRecoveryStep = 0;
  private disposed = false;

  constructor(
    readonly definition: PorterAndroidDefinition,
    private readonly navigation: Pick<WaypointNavigationService, "findPath" | "projectToNavigablePoint">,
    private readonly mission: PorterMissionPort,
    startedAtSeconds = 0,
  ) {
    this.state = {
      id: definition.id,
      definitionId: definition.definitionId,
      faction: "neutral",
      mode: "dormant",
      position: copyVec3(definition.spawn),
      facing: Math.PI,
      targetEntityId: null,
      path: [],
      pathIndex: 0,
      cooldowns: { modeEnteredAtSeconds: startedAtSeconds },
      perception: {
        evaluatedAtSeconds: startedAtSeconds,
        visibleEntityIds: [],
        lastStimulusId: null,
        lastStimulusPosition: null,
      },
      authenticated: false,
      handshakeStartedAtSeconds: null,
      command: "none",
      carriedItemId: null,
      destination: null,
      assistedItemIds: [],
      failureReport: null,
      gateEvaluationCodes: [],
    };
  }

  getInteractions(coolingCoilItemId: string | null): readonly InteractionDefinition[] {
    if (this.state.mode === "dormant" || this.state.mode === "handshake") {
      return [{
        id: `porter-auth:${this.state.id}`,
        position: copyVec3(this.state.position),
        radius: this.definition.interactionRange,
        prompt: this.state.mode === "handshake" ? "PORTER AUTH // 3.0 SEC" : "E  簡易端末で荷役補助機を認証",
        response: "荷役補助機認証",
        action: { type: "mission-porter-auth", machineId: this.state.id },
      }];
    }
    if (!this.state.authenticated || this.state.mode === "gate-rejected") return [];
    const commands: InteractionDefinition[] = [
      this.commandInteraction("follow", "FOLLOW"),
      this.commandInteraction("hold", "HOLD"),
    ];
    if (coolingCoilItemId && this.mission.itemLocations[coolingCoilItemId]?.kind === "mission-ground") {
      commands.push(this.commandInteraction("carry-to", "CARRY COOLING COIL TO EXTRACTION"));
    }
    return commands;
  }

  beginAuthentication(context: PorterAuthenticationContext, elapsedSeconds: number): PorterActionResolution {
    if (this.state.authenticated) return this.reject("ALREADY_AUTHENTICATED", "荷役補助機はすでに友好化されています");
    if (!context.operable) return this.reject("AGENT_NOT_OPERABLE", "操作可能な隊員が必要です");
    if (!context.hasFieldTerminal) return this.reject("FIELD_TERMINAL_REQUIRED", "簡易フィールド端末が必要です");
    if (context.exclusiveOperationActive) return this.reject("EXCLUSIVE_OPERATION_ACTIVE", "排他的操作中は認証できません");
    if (distanceSquared(context.position, this.state.position) > this.definition.interactionRange ** 2) {
      return this.reject("PORTER_OUT_OF_RANGE", "荷役補助機が認証範囲外です");
    }
    this.handshakeAgentId = context.agentId;
    this.state.handshakeStartedAtSeconds = elapsedSeconds;
    this.transition("handshake", elapsedSeconds);
    return { accepted: true, code: "HANDSHAKE_STARTED", reason: "3秒の認証ハンドシェイクを開始しました" };
  }

  issueCommand(
    command: "follow" | "hold" | "carry-to",
    agentId: CrewId,
    elapsedSeconds: number,
    coolingCoilItemId: string | null,
    extractionPoint: Vec3,
  ): PorterActionResolution {
    if (!this.state.authenticated) return this.reject("PORTER_NOT_AUTHENTICATED", "先に簡易端末で認証してください");
    if (command === "follow") {
      this.followAgentId = agentId;
      this.state.command = command;
      this.state.targetEntityId = agentId;
      this.transition("following", elapsedSeconds);
      return { accepted: true, code: "PORTER_FOLLOW", reason: "荷役補助機が追従します" };
    }
    if (command === "hold") {
      this.followAgentId = null;
      this.state.command = command;
      this.state.targetEntityId = null;
      this.state.path = [];
      this.transition("holding", elapsedSeconds);
      return { accepted: true, code: "PORTER_HOLD", reason: "荷役補助機が待機します" };
    }
    if (!coolingCoilItemId || this.mission.itemLocations[coolingCoilItemId]?.kind !== "mission-ground") {
      return this.reject("CARRY_ITEM_UNAVAILABLE", "搬送可能な冷却コイルがありません");
    }
    const location = this.mission.itemLocations[coolingCoilItemId];
    if (location?.kind !== "mission-ground") return this.reject("CARRY_ITEM_UNAVAILABLE", "搬送対象が地上にありません");
    this.state.command = command;
    this.targetItemId = coolingCoilItemId;
    this.state.targetEntityId = coolingCoilItemId;
    this.state.destination = copyVec3(extractionPoint);
    if (!this.planTo(location.position)) return this.pathFailed(elapsedSeconds, "資源への経路がありません");
    this.transition("moving-to-item", elapsedSeconds);
    return { accepted: true, code: "PORTER_CARRY_TO", reason: "冷却コイルを抽出台へ搬送します" };
  }

  fixedUpdate(
    dt: number,
    elapsedSeconds: number,
    authenticationContext: PorterAuthenticationContext | null,
    agentPositions: Readonly<Record<string, Vec3>>,
  ): void {
    this.assertActive();
    this.state.perception.evaluatedAtSeconds = elapsedSeconds;
    if (this.state.mode === "handshake") {
      const valid = authenticationContext
        && authenticationContext.agentId === this.handshakeAgentId
        && authenticationContext.operable
        && authenticationContext.hasFieldTerminal
        && !authenticationContext.exclusiveOperationActive
        && distanceSquared(authenticationContext.position, this.state.position) <= this.definition.interactionRange ** 2;
      if (!valid) {
        this.handshakeAgentId = null;
        this.state.handshakeStartedAtSeconds = null;
        this.transition("dormant", elapsedSeconds);
        return;
      }
      if (elapsedSeconds - (this.state.handshakeStartedAtSeconds ?? elapsedSeconds) >= this.definition.authenticationSeconds) {
        this.state.authenticated = true;
        this.state.faction = "friendly";
        this.handshakeAgentId = null;
        this.transition("friendly-idle", elapsedSeconds);
      }
      return;
    }
    if (this.state.mode === "following") {
      const target = this.followAgentId ? agentPositions[this.followAgentId] : null;
      if (!target) return;
      if (distanceSquared(this.state.position, target) <= FOLLOW_STANDOFF ** 2) {
        this.state.path = [];
        return;
      }
      if (this.state.pathIndex >= this.state.path.length || distanceSquared(this.state.path.at(-1) ?? this.state.position, target) > 1.5 ** 2) {
        if (!this.planTo(target)) this.pathFailed(elapsedSeconds, "追従経路を再計算できません");
      }
      this.advance(dt);
      return;
    }
    if (this.state.mode === "moving-to-item") {
      if (!this.advance(dt)) return;
      if (!this.targetItemId || !this.mission.transferResourceToMachine(this.targetItemId, this.state.id)) {
        this.pathFailed(elapsedSeconds, "搬送対象を取得できません");
        return;
      }
      this.state.carriedItemId = this.targetItemId;
      if (!this.state.assistedItemIds.includes(this.targetItemId)) this.state.assistedItemIds.push(this.targetItemId);
      this.transition("carrying", elapsedSeconds);
      return;
    }
    if (this.state.mode === "carrying") {
      const destination = this.state.destination;
      if (!destination || !this.planTo(destination)) {
        this.pathFailed(elapsedSeconds, "抽出台への経路を計算できません");
        return;
      }
      this.transition("moving-to-destination", elapsedSeconds);
      return;
    }
    if (this.state.mode === "moving-to-destination") {
      if (!this.advance(dt)) return;
      this.transition("placing-item", elapsedSeconds);
      return;
    }
    if (this.state.mode === "placing-item") {
      if (this.state.carriedItemId) {
        this.mission.placeMachineResourceAtExtraction(this.state.carriedItemId, this.state.id);
      }
      this.state.carriedItemId = null;
      this.targetItemId = null;
      this.finalizeGateAttempt(elapsedSeconds);
    }
  }

  getGateEvaluation(): MachineGateEvaluation {
    return evaluateMachineForGate(this.state.id, this.definition.gateTraits);
  }

  getOutcome(): AlliedMachineOutcome | null {
    if (!this.state.authenticated) return null;
    return Object.freeze({
      machineId: this.state.id,
      disposition: "friendly-left-behind" as const,
      assistedItemIds: Object.freeze([...this.state.assistedItemIds]),
    });
  }

  contributesPresence(): boolean {
    return this.state.authenticated && this.state.mode !== "path-failed";
  }

  interruptExclusiveOperation(agentId: CrewId, elapsedSeconds: number): boolean {
    if (this.state.mode !== "handshake" || this.handshakeAgentId !== agentId) return false;
    this.handshakeAgentId = null;
    this.state.handshakeStartedAtSeconds = null;
    this.transition("dormant", elapsedSeconds);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.state.path = [];
  }

  private commandInteraction(command: "follow" | "hold" | "carry-to", label: string): InteractionDefinition {
    return {
      id: `porter-command:${this.state.id}:${command}`,
      position: copyVec3(this.state.position),
      radius: this.definition.interactionRange,
      prompt: `E  PORTER // ${label}`,
      response: `PORTER ${label}`,
      action: { type: "mission-porter-command", machineId: this.state.id, command },
    };
  }

  private planTo(target: Vec3): boolean {
    const result = this.navigation.findPath(this.state.position, target);
    if (!result.ok) return false;
    this.applyPath(result);
    return true;
  }

  private applyPath(path: Extract<NavigationPathResult, { ok: true }>): void {
    this.state.path = path.points.map(copyVec3);
    this.state.pathIndex = this.state.path.length > 1 ? 1 : 0;
    this.failureRecoveryStep = 0;
  }

  private advance(dt: number): boolean {
    while (this.state.pathIndex < this.state.path.length) {
      const target = this.state.path[this.state.pathIndex];
      if (!target) break;
      const dx = target.x - this.state.position.x;
      const dz = target.z - this.state.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= WAYPOINT_RADIUS) {
        this.state.pathIndex += 1;
        continue;
      }
      const step = Math.min(distance, this.definition.moveSpeed * dt);
      this.state.position.x += dx / distance * step;
      this.state.position.z += dz / distance * step;
      this.state.position.y = this.definition.spawn.y;
      this.state.facing = Math.atan2(-dx, -dz);
      return false;
    }
    return true;
  }

  private pathFailed(elapsedSeconds: number, reason: string): PorterActionResolution {
    this.failureRecoveryStep += 1;
    const destination = this.state.destination;
    if (destination && this.failureRecoveryStep <= 2 && this.planTo(destination)) {
      this.transition(this.state.carriedItemId ? "moving-to-destination" : "moving-to-item", elapsedSeconds);
      return { accepted: true, code: "PATH_REPLANNED", reason: "経路を再計算しました" };
    }
    if (destination && this.failureRecoveryStep <= 3) {
      const projection = this.navigation.projectToNavigablePoint(this.state.position, 2.5);
      if (projection) {
        this.state.position = copyVec3(projection.point);
        if (this.planTo(destination)) {
          this.transition(this.state.carriedItemId ? "moving-to-destination" : "moving-to-item", elapsedSeconds);
          return { accepted: true, code: "PATH_REPROJECTED", reason: "安全点へ再投影して再試行します" };
        }
      }
    }
    if (this.state.carriedItemId) {
      this.mission.placeMachineResourceSafely(this.state.carriedItemId, this.state.id, this.state.position);
      this.state.carriedItemId = null;
    }
    this.state.failureReport = `${reason} // SAFE DROP // HOLD`;
    this.state.command = "hold";
    this.transition("path-failed", elapsedSeconds);
    return this.reject("PORTER_PATH_FAILED", this.state.failureReport);
  }

  private finalizeGateAttempt(elapsedSeconds: number): void {
    const gate = this.getGateEvaluation();
    this.state.gateEvaluationCodes = gate.violations.map((violation) => violation.code);
    this.state.command = "hold";
    this.state.destination = null;
    this.transition(gate.accepted ? "holding" : "gate-rejected", elapsedSeconds);
  }

  private transition(mode: PorterAndroidMode, elapsedSeconds: number): void {
    this.state.mode = mode;
    this.state.cooldowns.modeEnteredAtSeconds = elapsedSeconds;
  }

  private reject(code: string, reason: string): PorterActionResolution {
    return { accepted: false, code, reason };
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("PorterAndroidController has been disposed");
  }
}
