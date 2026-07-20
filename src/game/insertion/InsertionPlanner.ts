import { distanceSquared, type Vec3 } from "../core/types";
import type { ExpeditionManifest } from "../mission/expeditionTypes";
import type { WorldColliderSpec } from "../../physics/physicsTypes";
import type { NavigationService } from "../navigation/navigationTypes";
import type { CrewId } from "../squad/squadTypes";

export type InsertionMode = "stable" | "paired" | "scattered";

export interface MissionLaunchOptions {
  readonly insertionMode: InsertionMode;
  readonly insertionSeed: string;
}

export interface InsertionAnchorDefinition {
  readonly id: string;
  readonly position: Vec3;
  readonly cameraPosition: Vec3;
  readonly navigationNodeId: string;
  readonly toolFreeExit: boolean;
}

export interface InsertionPresetDefinition {
  readonly id: string;
  readonly mode: InsertionMode;
  readonly anchorIds: readonly string[];
}

export interface InsertionPlacement {
  readonly agentId: CrewId;
  readonly anchorId: string;
  readonly position: Vec3;
  readonly cameraPosition: Vec3;
}

export interface InsertionPlan {
  readonly missionId: string;
  readonly manifestId: string;
  readonly seed: string;
  readonly mode: InsertionMode;
  readonly presetId: string;
  readonly placements: readonly InsertionPlacement[];
}

export type InsertionViolationCode =
  | "UNKNOWN_ANCHOR"
  | "ANCHOR_COUNT_MISMATCH"
  | "ANCHOR_INSIDE_COLLIDER"
  | "ANCHOR_NOT_NAVIGABLE"
  | "ANCHOR_UNREACHABLE"
  | "ANCHOR_REQUIRES_TOOL"
  | "INVALID_CAMERA_START"
  | "MODE_DISTANCE_VIOLATION";

export interface InsertionViolation {
  readonly code: InsertionViolationCode;
  readonly reason: string;
  readonly anchorId?: string;
}

export class InvalidInsertionPlanError extends Error {
  constructor(readonly violations: readonly InsertionViolation[]) {
    super(violations[0]?.reason ?? "Insertion plan is invalid");
  }
}

export interface InsertionPlannerContext {
  readonly missionId: string;
  readonly extractionPoint: Vec3;
  readonly anchors: readonly InsertionAnchorDefinition[];
  readonly presets: readonly InsertionPresetDefinition[];
  readonly colliders: readonly WorldColliderSpec[];
  readonly navigation: NavigationService;
}

export function createInsertionPlan(
  manifest: ExpeditionManifest,
  mode: InsertionMode,
  seed: string,
  context: InsertionPlannerContext,
): InsertionPlan {
  const presets = context.presets.filter(
    (preset) => preset.mode === mode && preset.anchorIds.length === manifest.selectedAgentIds.length,
  );
  if (presets.length === 0) {
    throw new InvalidInsertionPlanError([{
      code: "ANCHOR_COUNT_MISMATCH",
      reason: `${mode}用の${manifest.selectedAgentIds.length}名配置がありません`,
    }]);
  }
  const preset = presets[stableHash(`${context.missionId}:${manifest.manifestId}:${seed}:${mode}`) % presets.length];
  if (!preset) throw new Error("Insertion preset selection failed");
  const anchorById = new Map(context.anchors.map((anchor) => [anchor.id, anchor]));
  const violations: InsertionViolation[] = [];
  const anchors = preset.anchorIds.map((anchorId) => {
    const anchor = anchorById.get(anchorId);
    if (!anchor) violations.push({ code: "UNKNOWN_ANCHOR", anchorId, reason: `不明な挿入アンカーです: ${anchorId}` });
    return anchor;
  });

  for (const anchor of anchors) {
    if (!anchor) continue;
    if (!anchor.toolFreeExit) {
      violations.push({ code: "ANCHOR_REQUIRES_TOOL", anchorId: anchor.id, reason: `${anchor.id}は工具なしで脱出できません` });
    }
    if (isInsideBlockingCollider(anchor.position, context.colliders)) {
      violations.push({ code: "ANCHOR_INSIDE_COLLIDER", anchorId: anchor.id, reason: `${anchor.id}がコライダー内にあります` });
    }
    const projection = context.navigation.projectToNavigablePoint(anchor.position, 1.75);
    if (!projection || projection.nodeId !== anchor.navigationNodeId) {
      violations.push({ code: "ANCHOR_NOT_NAVIGABLE", anchorId: anchor.id, reason: `${anchor.id}が指定ナビゲーション点へ接続されていません` });
    } else if (!context.navigation.isReachable(anchor.position, context.extractionPoint)) {
      violations.push({ code: "ANCHOR_UNREACHABLE", anchorId: anchor.id, reason: `${anchor.id}から抽出地点へ到達できません` });
    }
    if (!isFiniteVec3(anchor.cameraPosition) || isInsideBlockingCollider(anchor.cameraPosition, context.colliders)) {
      violations.push({ code: "INVALID_CAMERA_START", anchorId: anchor.id, reason: `${anchor.id}のカメラ開始位置が無効です` });
    }
  }

  if (anchors.every((anchor): anchor is InsertionAnchorDefinition => Boolean(anchor))) {
    const modeReason = validateModeDistances(mode, anchors);
    if (modeReason) violations.push({ code: "MODE_DISTANCE_VIOLATION", reason: modeReason });
  }
  if (violations.length > 0) throw new InvalidInsertionPlanError(violations);

  const rotation = stableHash(`${seed}:${manifest.manifestId}`) % manifest.selectedAgentIds.length;
  const placements = manifest.selectedAgentIds.map((agentId, index) => {
    const anchor = anchors[(index + rotation) % anchors.length];
    if (!anchor) throw new Error("Validated insertion anchor disappeared");
    return Object.freeze({
      agentId,
      anchorId: anchor.id,
      position: Object.freeze({ ...anchor.position }),
      cameraPosition: Object.freeze({ ...anchor.cameraPosition }),
    });
  });
  return deepFreeze({
    missionId: context.missionId,
    manifestId: manifest.manifestId,
    seed,
    mode,
    presetId: preset.id,
    placements,
  });
}

function validateModeDistances(mode: InsertionMode, anchors: readonly InsertionAnchorDefinition[]): string | null {
  if (anchors.length <= 1) return null;
  const distances: number[] = [];
  for (let left = 0; left < anchors.length; left += 1) {
    for (let right = left + 1; right < anchors.length; right += 1) {
      const a = anchors[left];
      const b = anchors[right];
      if (a && b) distances.push(Math.sqrt(distanceSquared(a.position, b.position)));
    }
  }
  if (mode === "stable" && distances.some((distance) => distance > 2.6)) {
    return "stable配置の隊員間距離が2.6mを超えています";
  }
  if (mode === "paired" && anchors.length >= 3) {
    const hasPair = distances.some((distance) => distance <= 2.6);
    const hasSeparated = distances.some((distance) => distance >= 4);
    if (!hasPair || !hasSeparated) return "paired配置に近接ペアと分離隊員の両方がありません";
  }
  if (mode === "scattered" && distances.some((distance) => distance < 5)) {
    return "scattered配置の隊員間距離が5m未満です";
  }
  return null;
}

function isInsideBlockingCollider(position: Vec3, colliders: readonly WorldColliderSpec[]): boolean {
  return colliders.some((collider) =>
    collider.surface !== "floor" &&
    Math.abs(position.x - collider.center.x) < collider.halfExtents.x + 0.3 &&
    Math.abs(position.y - collider.center.y) < collider.halfExtents.y + 0.8 &&
    Math.abs(position.z - collider.center.z) < collider.halfExtents.z + 0.3,
  );
}

function isFiniteVec3(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
