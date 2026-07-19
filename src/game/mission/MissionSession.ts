import { distanceSquared, type Vec3 } from "../core/types";
import type { InteractionAction, InteractionDefinition } from "../interaction/interactionTypes";
import { cloneItemLocationLedger, type ItemLocationLedger } from "../items/itemLocation";
import type { CrewId } from "../squad/squadTypes";
import type { ExpeditionManifest } from "./expeditionTypes";
import type { FixedMissionDefinition, FixedSalvageSpawn } from "./fixedMissionTypes";

export type FixedMissionOutcome = "complete" | "partial";

export interface FixedMissionResult {
  readonly missionId: string;
  readonly sessionId: string;
  readonly manifestId: string;
  readonly outcome: FixedMissionOutcome;
  readonly recoveredResourceIds: readonly string[];
  readonly returnedCrewIds: readonly CrewId[];
  readonly elapsedSeconds: number;
  readonly cartRecovered: false;
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
  heavyCarryRejections: number;
  eventRevision: number;
  lastEvent: string;
  result: FixedMissionResult | null;
}

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
      heavyCarryRejections: 0,
      eventRevision: 0,
      lastEvent: "降下完了。回収対象を確認してください",
      result: null,
    };
  }

  fixedUpdate(dt: number, playerPosition: Vec3, playerFacingYaw: number): void {
    this.assertActive();
    this.state.elapsedSeconds += dt;
    if (!this.state.cartAttached) return;
    const cartLocation = this.state.itemLocations[this.state.cartId];
    if (cartLocation?.kind !== "mission-ground") return;
    const target = {
      x: clamp(playerPosition.x + Math.sin(playerFacingYaw) * 1.15, -6.2, 6.2),
      y: this.definition.cart.initialPosition.y,
      z: clamp(playerPosition.z + Math.cos(playerFacingYaw) * 1.15, -6.2, 6.2),
    };
    cartLocation.position.x += (target.x - cartLocation.position.x) * 0.28;
    cartLocation.position.y = target.y;
    cartLocation.position.z += (target.z - cartLocation.position.z) * 0.28;
  }

  getInteractions(): readonly InteractionDefinition[] {
    if (this.state.phase !== "deployed") return [];
    const interactions: InteractionDefinition[] = [];
    const cartPosition = this.getCartPosition();

    for (const [itemId, resource] of this.resourceByInstanceId) {
      const location = this.state.itemLocations[itemId];
      if (location?.kind !== "mission-ground") continue;
      const cartCanLoad =
        resource.carryMode === "cart-only" &&
        this.state.heavyCarryRejections > 0 &&
        this.state.cartAttached &&
        distanceSquared(location.position, cartPosition) <= 2.2 ** 2;
      interactions.push({
        id: `salvage-${itemId}`,
        position: location.position,
        radius: 1.3,
        prompt: cartCanLoad ? `E  ${resource.label}をカートへ積載` : `E  ${resource.label}を回収`,
        response: `${resource.label}を確認`,
        action: { type: "mission-item", itemInstanceId: itemId },
      });
    }

    interactions.push({
      id: `cart-${this.state.cartId}`,
      position: cartPosition,
      radius: 1.45,
      prompt: this.state.cartAttached ? "E  カートを放す" : "E  カートを牽引する",
      response: "現地カート操作",
      action: { type: "mission-cart-toggle" },
    });
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

  handleInteraction(action: InteractionAction): MissionActionResolution {
    this.assertActive();
    if (action.type === "mission-item") return this.handleItem(action.itemInstanceId);
    if (action.type === "mission-cart-toggle") {
      this.state.cartAttached = !this.state.cartAttached;
      return this.record(this.state.cartAttached ? "カートを牽引します" : "カートをその場に固定しました");
    }
    if (action.type === "mission-extract") return this.extract();
    return this.record("この操作は探索セッションでは使用できません");
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
      const secured = location?.kind === "crew" || location?.kind === "cart" || location?.kind === "recovered-to-ship";
      if (secured) securedResources += 1;
      if (secured && resource.resourceType === "water-filter") filtersSecured += 1;
      if (resource.resourceType === "cooling-coil" && location?.kind === "cart") coolingCoilLoaded = true;
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

  dispose(): void {
    this.disposed = true;
    this.state.cartAttached = false;
  }

  private handleItem(itemId: string): MissionActionResolution {
    const resource = this.resourceByInstanceId.get(itemId);
    const location = this.state.itemLocations[itemId];
    if (!resource || location?.kind !== "mission-ground") return this.record("対象はすでに移動しています");

    if (resource.carryMode === "hand") {
      this.state.itemLocations[itemId] = { kind: "crew", crewId: "player" };
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
      const recovered = location?.kind === "crew" || (location?.kind === "cart" && cartAtExtraction);
      if (recovered) recoveredResourceIds.push(itemId);
      if (resource.required && !recovered) complete = false;
    }
    if (recoveredResourceIds.length === 0) {
      return this.record("回収物がありません。少なくとも1点を確保してください");
    }

    for (const itemId of recoveredResourceIds) {
      this.state.itemLocations[itemId] = {
        kind: "recovered-to-ship",
        missionId: this.definition.id,
      };
    }
    this.state.cartAttached = false;
    this.state.phase = "results";
    this.state.result = deepFreeze({
      missionId: this.definition.id,
      sessionId: this.state.sessionId,
      manifestId: this.manifest.manifestId,
      outcome: complete ? "complete" : "partial",
      recoveredResourceIds,
      returnedCrewIds: [...this.manifest.selectedAgentIds],
      elapsedSeconds: this.state.elapsedSeconds,
      cartRecovered: false as const,
    });
    return this.record(
      complete ? "COMPLETE // 全必須資源を回収しました" : "PARTIAL // 回収済み資源を確保して帰還します",
      this.state.result,
    );
  }

  private isCartAtExtraction(): boolean {
    return distanceSquared(this.getCartPosition(), this.definition.extractionPoint) <= this.definition.extractionRadius ** 2;
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

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
