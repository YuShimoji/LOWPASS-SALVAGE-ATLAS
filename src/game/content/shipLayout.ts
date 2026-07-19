import type { Vec3 } from "../core/types";

export interface ShipColliderSpec {
  id: string;
  center: Vec3;
  halfExtents: Vec3;
  surface: "floor" | "wall" | "fixture";
  visible: boolean;
}

export const SHIP_COLLIDERS: readonly ShipColliderSpec[] = [
  {
    id: "deck-floor",
    center: { x: 0, y: -0.25, z: -3 },
    halfExtents: { x: 6.5, y: 0.25, z: 7.5 },
    surface: "floor",
    visible: true,
  },
  {
    id: "cabin-port-wall",
    center: { x: -6.25, y: 1.8, z: 0 },
    halfExtents: { x: 0.25, y: 1.8, z: 4.5 },
    surface: "wall",
    visible: true,
  },
  {
    id: "cabin-starboard-wall",
    center: { x: 6.25, y: 1.8, z: 0 },
    halfExtents: { x: 0.25, y: 1.8, z: 4.5 },
    surface: "wall",
    visible: true,
  },
  {
    id: "cabin-aft-wall",
    center: { x: 0, y: 1.8, z: 4.25 },
    halfExtents: { x: 6.5, y: 1.8, z: 0.25 },
    surface: "wall",
    visible: true,
  },
  {
    id: "bulkhead-port",
    center: { x: -5.15, y: 1.8, z: -4.25 },
    halfExtents: { x: 1.35, y: 1.8, z: 0.25 },
    surface: "wall",
    visible: true,
  },
  {
    id: "bulkhead-starboard",
    center: { x: 5.15, y: 1.8, z: -4.25 },
    halfExtents: { x: 1.35, y: 1.8, z: 0.25 },
    surface: "wall",
    visible: true,
  },
  {
    id: "gate-port-wall",
    center: { x: -4.25, y: 1.8, z: -7.25 },
    halfExtents: { x: 0.25, y: 1.8, z: 3.25 },
    surface: "wall",
    visible: true,
  },
  {
    id: "gate-starboard-wall",
    center: { x: 4.25, y: 1.8, z: -7.25 },
    halfExtents: { x: 0.25, y: 1.8, z: 3.25 },
    surface: "wall",
    visible: true,
  },
  {
    id: "gate-forward-wall",
    center: { x: 0, y: 1.8, z: -10.25 },
    halfExtents: { x: 4.5, y: 1.8, z: 0.25 },
    surface: "wall",
    visible: true,
  },
  {
    id: "navigation-console",
    center: { x: -4.9, y: 0.55, z: 0.25 },
    halfExtents: { x: 0.65, y: 0.55, z: 1.4 },
    surface: "fixture",
    visible: true,
  },
  {
    id: "gate-console",
    center: { x: 2.85, y: 0.6, z: -7.6 },
    halfExtents: { x: 0.65, y: 0.6, z: 0.55 },
    surface: "fixture",
    visible: true,
  },
] as const;

export interface InteractionDefinition {
  id: string;
  position: Vec3;
  radius: number;
  prompt: string;
  response: string;
  action: InteractionAction;
}

export type InteractionAction =
  | { type: "show-notice" }
  | { type: "open-expedition-console" }
  | { type: "scan-gate-item"; itemInstanceId: string };

export const SHIP_INTERACTIONS: readonly InteractionDefinition[] = [
  {
    id: "expedition-console",
    position: { x: -4.05, y: 0.8, z: 0.25 },
    radius: 1.75,
    prompt: "E  出撃編成コンソールを開く",
    response: "出撃編成コンソール // ローカル編集モード",
    action: { type: "open-expedition-console" },
  },
  {
    id: "scan-field-terminal",
    position: { x: -2.1, y: 0.7, z: -8 },
    radius: 1.15,
    prompt: "E  簡易フィールド端末をスキャン",
    response: "ゲートスキャンを開始",
    action: { type: "scan-gate-item", itemInstanceId: "scan-field-terminal" },
  },
  {
    id: "scan-advanced-terminal",
    position: { x: 0, y: 0.7, z: -8 },
    radius: 1.15,
    prompt: "E  高性能端末をスキャン",
    response: "ゲートスキャンを開始",
    action: { type: "scan-gate-item", itemInstanceId: "scan-advanced-terminal" },
  },
  {
    id: "scan-shopping-cart",
    position: { x: 2.1, y: 0.7, z: -8 },
    radius: 1.15,
    prompt: "E  ショッピングカートをスキャン",
    response: "ゲートスキャンを開始",
    action: { type: "scan-gate-item", itemInstanceId: "scan-shopping-cart" },
  },
  {
    id: "observation-window",
    position: { x: -5.15, y: 1, z: -1.7 },
    radius: 1.8,
    prompt: "E  低層雲海を観測",
    response: "雲海高度 1,420m // 浮遊船体は安定",
    action: { type: "show-notice" },
  },
] as const;
