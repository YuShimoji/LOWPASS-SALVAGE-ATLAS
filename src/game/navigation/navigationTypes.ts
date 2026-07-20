import type { Vec3 } from "../core/types";

export interface NavigationNodeDefinition {
  readonly id: string;
  readonly position: Vec3;
}

export interface NavigationEdgeDefinition {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly bidirectional: boolean;
  readonly enabledByDefault: boolean;
  readonly cost?: number;
}

export interface NavigationGraphDefinition {
  readonly nodes: readonly NavigationNodeDefinition[];
  readonly edges: readonly NavigationEdgeDefinition[];
}

export type NavigationFailureCode =
  | "NO_NAVIGABLE_START"
  | "NO_NAVIGABLE_GOAL"
  | "NO_PATH"
  | "UNKNOWN_EDGE";

export interface NavigationPathSuccess {
  readonly ok: true;
  readonly nodeIds: readonly string[];
  readonly points: readonly Vec3[];
  readonly cost: number;
}

export interface NavigationPathFailure {
  readonly ok: false;
  readonly code: NavigationFailureCode;
  readonly reason: string;
}

export type NavigationPathResult = NavigationPathSuccess | NavigationPathFailure;

export interface NavigableProjection {
  readonly nodeId: string;
  readonly point: Vec3;
  readonly distance: number;
}

export interface NavigationService {
  findPath(start: Vec3, goal: Vec3): NavigationPathResult;
  projectToNavigablePoint(point: Vec3, maximumDistance?: number): NavigableProjection | null;
  isReachable(start: Vec3, goal: Vec3): boolean;
  setEdgeEnabled(edgeId: string, enabled: boolean): NavigationPathFailure | null;
  isEdgeEnabled(edgeId: string): boolean;
}
