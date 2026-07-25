import { distanceSquared, type Vec3 } from "../core/types";
import type { InteractionAction, InteractionDefinition } from "../interaction/interactionTypes";
import { cloneItemLocationLedger, type ItemLocationLedger } from "../items/itemLocation";
import type { AlliedMachineOutcome } from "../machines/machineTypes";
import type { CrewId } from "../squad/squadTypes";
import { applyInterferencePulse, type InterferencePulseResult } from "../threat/InterferenceService";
import type { MovementIntent } from "../input/InputActions";
import type { ExpeditionManifest } from "./expeditionTypes";
import type { FixedMissionDefinition, FixedSalvageSpawn } from "./fixedMissionTypes";

export type FixedMissionOutcome = "complete" | "partial" | "aborted";

export interface FixedMissionResult {
  readonly missionId: string;
  readonly sessionId: string;
  readonly manifestId: string;
  readonly outcome: FixedMissionOutcome;
  readonly recoveredResourceIds: readonly string[];
  readonly returnedCrewIds: readonly CrewId[];
  readonly elapsedSeconds: number;
  readonly cartRecovered: false;
  readonly leftBehindEquipmentIds: readonly string[];
  readonly consumedEquipmentIds: readonly string[];
  readonly alliedMachineOutcomes: readonly AlliedMachineOutcome[];
}

export interface MissionSessionState {
  readonly sessionId: string;
  readonly missionId: string;
  readonly manifestId: string;
  phase: "deployed" | "results";
  elapsedSeconds: number;
  readonly itemLocations: ItemLocationLedger;
  readonly cartId: string;
  cartAttached: boolean;
  cartFacingYaw: number;
  cartSpeed: number;
  cartCollisionBlocked: boolean;
  heavyCarryRejections: number;
  eventRevision: number;
  lastEvent: string;
  result: FixedMissionResult | null;
  alliedMachineOutcomes: AlliedMachineOutcome[];
}

export interface CartMotionRequest {
  readonly currentPosition: Vec3;
  readonly currentFacingYaw: number;
  readonly desiredPosition: Vec3;
  readonly desiredFacingYaw: number;
  readonly operatorOffset: number;
}

export interface CartMotionResolution {
  readonly position: Vec3;
  readonly facingYaw: number;
  readonly collisionBlocked: boolean;
}

export interface CartControlStep {
  readonly cartPosition: Vec3;
  readonly playerPosition: Vec3;
  readonly facingYaw: number;
  readonly speed: number;
  readonly collisionBlocked: boolean;
}

export interface CartDiagnostics {
  readonly attached: boolean;
  readonly position: Vec3;
  readonly facingYaw: number;
  readonly speed: number;
  readonly collisionBlocked: boolean;
}

const CART_FORWARD_SPEED = 2.35;
const CART_REVERSE_SPEED = 1.05;
const CART_ACCELERATION = 7;
const CART_DECELERATION = 3.6;
const CART_TURN_RATE = 1.45;
const CART_HANDLE_OFFSET = 0.72;
export const CART_OPERATOR_OFFSET = 1.12;

export interface MissionObjectiveProgress {
  readonly securedResources: number;
  readonly requiredResources: number;
  readonly filtersSecured: number;
  readonly filtersRequired: number;
  readonly coolingCoilLoaded: boolean;
  readonly cartAtExtraction: boolean;
}

export interface MissionActionResolution {
  readonly notice: string;
  readonly result: FixedMissionResult | null;
}

export class MissionSessionController {
  readonly state: MissionSessionState;
  private readonly resourceByInstanceId = new Map<string, FixedSalvageSpawn>();
  private disposed = false;

  constructor(
    readonly definition: FixedMissionDefinition,
    private readonly manifest: ExpeditionManifest,
    sessionId: string,
    reservedLocations: Readonly<ItemLocationLedger>,
  ) {
    const itemLocations = cloneItemLocationLedger(reservedLocations);
    for (const resource of definition.salvage) {
      const itemId = missionItemId(sessionId, resource.sourceId);
      this.resourceByInstanceId.set(itemId, resource);
      itemLocations[itemId] = { kind: "mission-ground", position: { ...resource.position } };
    }
    const cartId = missionItemId(sessionId, definition.cart.sourceId);
    itemLocations[cartId] = {
      kind: "mission-ground",
      position: { ...definition.cart.initialPosition },
    };
    this.state = {
      sessionId,
      missionId: definition.id,
      manifestId: manifest.manifestId,
      phase: "deployed",
      elapsedSeconds: 0,
      itemLocations,
      cartId,
      cartAttached: false,
      cartFacingYaw: 0,
      cartSpeed: 0,
      cartCollisionBlocked: false,
      heavyCarryRejections: 0,
      eventRevision: 0,
      lastEvent: "降下完了。回収対象を確認してください",
      result: null,
      alliedMachineOutcomes: [],
    };
  }

  fixedUpdate(dt: number): void {
    this.assertActive();
    this.state.elapsedSeconds += dt;
  }

  stepCartControl(
    dt: number,
    input: Pick<MovementIntent, "rawX" | "rawY">,
    limitMotion: (request: CartMotionRequest) => CartMotionResolution,
  ): CartControlStep | null {
    this.assertActive();
    if (!this.state.cartAttached) return null;
    const cartLocation = this.state.itemLocations[this.state.cartId];
    if (cartLocation?.kind !== "mission-ground") return null;

    const targetSpeed = input.rawY >= 0
      ? input.rawY * CART_FORWARD_SPEED
      : input.rawY * CART_REVERSE_SPEED;
    const acceleration = Math.abs(targetSpeed) > Math.abs(this.state.cartSpeed)
      ? CART_ACCELERATION
      : CART_DECELERATION;
    this.state.cartSpeed = approach(this.state.cartSpeed, targetSpeed, acceleration * dt);
    if (Math.abs(input.rawY) < 0.01 && Math.abs(this.state.cartSpeed) < 0.02) this.state.cartSpeed = 0;

    const steeringScale = 0.42 + Math.min(1, Math.abs(this.state.cartSpeed) / CART_FORWARD_SPEED) * 0.58;
    const desiredFacingYaw = normalizeYaw(
      this.state.cartFacingYaw + input.rawX * CART_TURN_RATE * steeringScale * dt,
    );
    const desiredPosition = {
      x: clamp(cartLocation.position.x - Math.sin(desiredFacingYaw) * this.state.cartSpeed * dt, -6.2, 6.2),
      y: this.definition.cart.initialPosition.y,
      z: clamp(cartLocation.position.z - Math.cos(desiredFacingYaw) * this.state.cartSpeed * dt, -6.2, 6.2),
    };
    const requestedDistance = Math.hypot(
      desiredPosition.x - cartLocation.position.x,
      desiredPosition.z - cartLocation.position.z,
    );
    const resolved = limitMotion({
      currentPosition: { ...cartLocation.position },
      currentFacingYaw: this.state.cartFacingYaw,
      desiredPosition,
      desiredFacingYaw,
      operatorOffset: CART_OPERATOR_OFFSET,
    });
    const actualDistance = Math.hypot(
      resolved.position.x - cartLocation.position.x,
      resolved.position.z - cartLocation.position.z,
    );
    cartLocation.position.x = resolved.position.x;
    cartLocation.position.y = resolved.position.y;
    cartLocation.position.z = resolved.position.z;
    this.state.cartFacingYaw = resolved.facingYaw;
    this.state.cartCollisionBlocked = resolved.collisionBlocked
      || (requestedDistance > 0.001 && actualDistance < requestedDistance * 0.4);
    if (this.state.cartCollisionBlocked) this.state.cartSpeed = 0;

    return {
      cartPosition: { ...cartLocation.position },
      playerPosition: this.getCartOperatorPosition(),
      facingYaw: this.state.cartFacingYaw,
      speed: Math.abs(this.state.cartSpeed),
      collisionBlocked: this.state.cartCollisionBlocked,
    };
  }

  getInteractions(): readonly InteractionDefinition[] {
    if (this.state.phase !== "deployed") return [];
    const interactions: InteractionDefinition[] = [];
    const cartPosition = this.getCartPosition();
    let cartLoadAvailable = false;
    let cartHasLoad = false;

    for (const [itemId, resource] of this.resourceByInstanceId) {
      const location = this.state.itemLocations[itemId];
      cartHasLoad ||= location?.kind === "cart";
      if (location?.kind !== "mission-ground") continue;
      const cartCanLoad =
        resource.carryMode === "cart-only" &&
        this.state.heavyCarryRejections > 0 &&
        this.state.cartAttached &&
        distanceSquared(location.position, cartPosition) <= 2.2 ** 2;
      cartLoadAvailable ||= cartCanLoad;
      interactions.push({
        id: `salvage-${itemId}`,
        position: location.position,
        radius: 1.3,
        prompt: cartCanLoad ? `E  ${resource.label}をカートへ積載` : `E  ${resource.label}を回収`,
        response: `${resource.label}を確認`,
        action: { type: "mission-item", itemInstanceId: itemId },
      });
    }

    const cartReadyForExtraction = cartHasLoad && this.isCartAtExtraction();
    if (!cartLoadAvailable && !cartReadyForExtraction) {
      interactions.push({
        id: `cart-${this.state.cartId}`,
        position: this.getCartHandlePosition(),
        radius: 0.95,
        prompt: this.state.cartAttached ? "E  カートを離す" : "E  カートを押す",
        response: "現地カート操作",
        action: { type: "mission-cart-toggle" },
      });
    }
    interactions.push({
      id: "mission-extraction",
      position: this.definition.extractionPoint,
      radius: this.definition.extractionRadius,
      prompt: "E  回収物を照合して船へ帰還",
      response: "抽出照合を開始",
      action: { type: "mission-extract" },
    });
    return interactions;
  }

  handleInteraction(action: InteractionAction, actorId: CrewId = "player"): MissionActionResolution {
    this.assertActive();
    if (action.type === "mission-item") return this.handleItem(action.itemInstanceId, actorId);
    if (action.type === "mission-cart-toggle") {
      if (this.state.cartAttached) return this.releaseCart();
      this.state.cartAttached = true;
      this.state.cartSpeed = 0;
      this.state.cartCollisionBlocked = false;
      return this.record("カートを押します");
    }
    if (action.type === "mission-extract") return this.extract();
    return this.record("この操作は探索セッションでは使用できません");
  }

  releaseCart(notice = "カートを離しました"): MissionActionResolution {
    this.state.cartAttached = false;
    this.state.cartSpeed = 0;
    this.state.cartCollisionBlocked = false;
    return this.record(notice);
  }

  getCartOperatorPosition(): Vec3 {
    const cartPosition = this.getCartPosition();
    return {
      x: cartPosition.x + Math.sin(this.state.cartFacingYaw) * CART_OPERATOR_OFFSET,
      y: 0.93,
      z: cartPosition.z + Math.cos(this.state.cartFacingYaw) * CART_OPERATOR_OFFSET,
    };
  }

  setCartPoseForQa(position: Vec3, facingYaw = 0): void {
    const cartLocation = this.state.itemLocations[this.state.cartId];
    if (cartLocation?.kind !== "mission-ground") throw new Error("Mission cart is unavailable");
    cartLocation.position.x = position.x;
    cartLocation.position.y = position.y;
    cartLocation.position.z = position.z;
    this.state.cartAttached = true;
    this.state.cartFacingYaw = facingYaw;
    this.state.cartSpeed = 0;
    this.state.cartCollisionBlocked = false;
  }

  getCartDiagnostics(): CartDiagnostics {
    return {
      attached: this.state.cartAttached,
      position: { ...this.getCartPosition() },
      facingYaw: this.state.cartFacingYaw,
      speed: this.state.cartSpeed,
      collisionBlocked: this.state.cartCollisionBlocked,
    };
  }

  getObjectiveProgress(): MissionObjectiveProgress {
    const cartAtExtraction = this.isCartAtExtraction();
    let filtersSecured = 0;
    let filtersRequired = 0;
    let securedResources = 0;
    let requiredResources = 0;
    let coolingCoilLoaded = false;
    for (const [itemId, resource] of this.resourceByInstanceId) {
      if (resource.required) requiredResources += 1;
      if (resource.resourceType === "water-filter") filtersRequired += Number(resource.required);
      const location = this.state.itemLocations[itemId];
      const secured = location?.kind === "crew"
        || location?.kind === "cart"
        || location?.kind === "machine-carried"
        || location?.kind === "extraction-pad"
        || location?.kind === "recovered-to-ship";
      if (secured && resource.required) securedResources += 1;
      if (secured && resource.resourceType === "water-filter") filtersSecured += 1;
      if (
        resource.resourceType === "cooling-coil"
        && (
          location?.kind === "cart"
          || location?.kind === "machine-carried"
          || location?.kind === "extraction-pad"
          || location?.kind === "recovered-to-ship"
        )
      ) coolingCoilLoaded = true;
    }
    return {
      securedResources,
      requiredResources,
      filtersSecured,
      filtersRequired,
      coolingCoilLoaded,
      cartAtExtraction,
    };
  }

  getCartPosition(): Vec3 {
    const location = this.state.itemLocations[this.state.cartId];
    if (location?.kind !== "mission-ground") {
      throw new Error("Cart location is missing from MissionSession");
    }
    return location.position;
  }

  getResourceItemId(sourceId: string): string | null {
    return [...this.resourceByInstanceId.entries()].find(([, resource]) => resource.sourceId === sourceId)?.[0] ?? null;
  }

  transferResourceToMachine(itemId: string, machineId: string): boolean {
    const resource = this.resourceByInstanceId.get(itemId);
    const location = this.state.itemLocations[itemId];
    if (!resource || resource.carryMode !== "cart-only" || location?.kind !== "mission-ground") return false;
    this.state.itemLocations[itemId] = { kind: "machine-carried", machineId };
    this.record(`${resource.label}を${machineId}が保持しました`);
    return true;
  }

  placeMachineResourceAtExtraction(itemId: string, machineId: string): boolean {
    const resource = this.resourceByInstanceId.get(itemId);
    const location = this.state.itemLocations[itemId];
    if (!resource || location?.kind !== "machine-carried" || location.machineId !== machineId) return false;
    this.state.itemLocations[itemId] = {
      kind: "extraction-pad",
      missionId: this.definition.id,
      position: copyExtractionPosition(this.definition.extractionPoint),
    };
    this.record(`${resource.label}を抽出台へ配置しました`);
    return true;
  }

  placeMachineResourceSafely(itemId: string, machineId: string, position: Vec3): boolean {
    const location = this.state.itemLocations[itemId];
    if (location?.kind !== "machine-carried" || location.machineId !== machineId) return false;
    this.state.itemLocations[itemId] = { kind: "mission-ground", position: copyExtractionPosition(position) };
    this.record(`${itemId}を安全地点へ配置しました`);
    return true;
  }

  applyInterference(targetAgentId: CrewId, targetPosition: Vec3, elapsedSeconds: number): InterferencePulseResult {
    const handResourceIds = [...this.resourceByInstanceId.entries()]
      .filter(([, resource]) => resource.carryMode === "hand")
      .map(([itemId]) => itemId);
    const result = applyInterferencePulse(
      targetAgentId,
      targetPosition,
      elapsedSeconds,
      handResourceIds,
      this.state.itemLocations,
    );
    this.state.cartAttached = false;
    this.state.cartSpeed = 0;
    this.state.cartCollisionBlocked = false;
    this.record(result.droppedItemId
      ? `INTERFERENCE // ${result.droppedItemId}を落としました`
      : "INTERFERENCE // 通信と操作が一時妨害されました");
    return result;
  }

  setAlliedMachineOutcomes(outcomes: readonly AlliedMachineOutcome[]): void {
    this.state.alliedMachineOutcomes = outcomes.map((outcome) => ({
      ...outcome,
      assistedItemIds: [...outcome.assistedItemIds],
    }));
  }

  dispose(): void {
    this.disposed = true;
    this.state.cartAttached = false;
    this.state.cartSpeed = 0;
    this.state.cartCollisionBlocked = false;
  }

  private handleItem(itemId: string, actorId: CrewId): MissionActionResolution {
    const resource = this.resourceByInstanceId.get(itemId);
    const location = this.state.itemLocations[itemId];
    if (!resource || location?.kind !== "mission-ground") return this.record("対象はすでに移動しています");

    if (resource.carryMode === "hand") {
      this.state.itemLocations[itemId] = { kind: "crew", crewId: actorId };
      return this.record(`${resource.label}を手持ち回収しました`);
    }

    const cartCanLoad =
      this.state.heavyCarryRejections > 0 &&
      this.state.cartAttached &&
      distanceSquared(location.position, this.getCartPosition()) <= 2.2 ** 2;
    if (cartCanLoad) {
      this.state.itemLocations[itemId] = { kind: "cart", cartId: this.state.cartId };
      return this.record(`${resource.label}をカートへ積載しました`);
    }

    this.state.heavyCarryRejections += 1;
    return this.record(`${resource.label}は重量超過のため手持ちできません。カートを近づけてください`);
  }

  private extract(): MissionActionResolution {
    const cartAtExtraction = this.isCartAtExtraction();
    const recoveredResourceIds: string[] = [];
    let complete = true;
    for (const [itemId, resource] of this.resourceByInstanceId) {
      const location = this.state.itemLocations[itemId];
      const recovered = location?.kind === "crew"
        || location?.kind === "extraction-pad"
        || (location?.kind === "cart" && cartAtExtraction);
      if (recovered) recoveredResourceIds.push(itemId);
      if (resource.required && !recovered) complete = false;
    }
    for (const itemId of recoveredResourceIds) {
      this.state.itemLocations[itemId] = {
        kind: "recovered-to-ship",
        missionId: this.definition.id,
      };
    }
    this.state.cartAttached = false;
    this.state.cartSpeed = 0;
    this.state.cartCollisionBlocked = false;
    this.state.phase = "results";
    this.state.result = deepFreeze({
      missionId: this.definition.id,
      sessionId: this.state.sessionId,
      manifestId: this.manifest.manifestId,
      outcome: complete ? "complete" : recoveredResourceIds.length > 0 ? "partial" : "aborted",
      recoveredResourceIds,
      returnedCrewIds: [...this.manifest.selectedAgentIds],
      elapsedSeconds: this.state.elapsedSeconds,
      cartRecovered: false as const,
      leftBehindEquipmentIds: this.manifest.items
        .map((item) => item.instanceId)
        .filter((itemId) => this.state.itemLocations[itemId]?.kind === "mission-ground"),
      consumedEquipmentIds: this.manifest.items
        .map((item) => item.instanceId)
        .filter((itemId) => this.state.itemLocations[itemId]?.kind === "consumed"),
      alliedMachineOutcomes: this.state.alliedMachineOutcomes.map((outcome) => ({
        ...outcome,
        assistedItemIds: [...outcome.assistedItemIds],
      })),
    });
    const notice = complete
      ? "COMPLETE // 全必須資源を回収しました"
      : recoveredResourceIds.length > 0
        ? "PARTIAL // 回収済み資源を確保して帰還します"
        : "ABORTED // 回収物なしで帰還します";
    return this.record(notice, this.state.result);
  }

  private isCartAtExtraction(): boolean {
    return distanceSquared(this.getCartPosition(), this.definition.extractionPoint) <= this.definition.extractionRadius ** 2;
  }

  private getCartHandlePosition(): Vec3 {
    const cartPosition = this.getCartPosition();
    return {
      x: cartPosition.x + Math.sin(this.state.cartFacingYaw) * CART_HANDLE_OFFSET,
      y: 0.93,
      z: cartPosition.z + Math.cos(this.state.cartFacingYaw) * CART_HANDLE_OFFSET,
    };
  }

  private record(notice: string, result: FixedMissionResult | null = null): MissionActionResolution {
    this.state.lastEvent = notice;
    this.state.eventRevision += 1;
    return { notice, result };
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("MissionSession has been disposed");
  }
}

export function missionItemId(sessionId: string, sourceId: string): string {
  return `${sessionId}:${sourceId}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function approach(current: number, target: number, maximumDelta: number): number {
  if (current < target) return Math.min(target, current + maximumDelta);
  if (current > target) return Math.max(target, current - maximumDelta);
  return target;
}

function normalizeYaw(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function copyExtractionPosition(value: Vec3): Vec3 {
  return { x: value.x, y: Math.max(0.32, value.y), z: value.z };
}
