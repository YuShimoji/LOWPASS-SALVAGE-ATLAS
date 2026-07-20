import { distanceSquared, type Vec3 } from "../core/types";
import type {
  NavigableProjection,
  NavigationEdgeDefinition,
  NavigationGraphDefinition,
  NavigationPathFailure,
  NavigationPathResult,
  NavigationService,
} from "./navigationTypes";

interface DirectedEdge {
  readonly definition: NavigationEdgeDefinition;
  readonly to: string;
  readonly cost: number;
}

export class WaypointNavigationService implements NavigationService {
  private readonly nodes = new Map<string, Vec3>();
  private readonly edges = new Map<string, NavigationEdgeDefinition>();
  private readonly adjacency = new Map<string, DirectedEdge[]>();
  private readonly edgeOverrides = new Map<string, boolean>();

  constructor(readonly definition: NavigationGraphDefinition) {
    for (const node of definition.nodes) {
      if (this.nodes.has(node.id)) throw new Error(`Duplicate navigation node: ${node.id}`);
      this.nodes.set(node.id, { ...node.position });
      this.adjacency.set(node.id, []);
    }
    for (const edge of definition.edges) {
      if (this.edges.has(edge.id)) throw new Error(`Duplicate navigation edge: ${edge.id}`);
      const from = this.nodes.get(edge.from);
      const to = this.nodes.get(edge.to);
      if (!from || !to) throw new Error(`Navigation edge ${edge.id} references an unknown node`);
      this.edges.set(edge.id, edge);
      const cost = edge.cost ?? Math.sqrt(distanceSquared(from, to));
      this.adjacency.get(edge.from)?.push({ definition: edge, to: edge.to, cost });
      if (edge.bidirectional) {
        this.adjacency.get(edge.to)?.push({ definition: edge, to: edge.from, cost });
      }
    }
    for (const edges of this.adjacency.values()) edges.sort((a, b) => a.to.localeCompare(b.to));
  }

  findPath(start: Vec3, goal: Vec3): NavigationPathResult {
    const projectedStart = this.projectToNavigablePoint(start);
    if (!projectedStart) {
      return { ok: false, code: "NO_NAVIGABLE_START", reason: "開始位置をナビゲーション点へ投影できません" };
    }
    const projectedGoal = this.projectToNavigablePoint(goal);
    if (!projectedGoal) {
      return { ok: false, code: "NO_NAVIGABLE_GOAL", reason: "目標位置をナビゲーション点へ投影できません" };
    }

    const startId = projectedStart.nodeId;
    const goalId = projectedGoal.nodeId;
    const open = new Set([startId]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startId, 0]]);
    const fScore = new Map<string, number>([[startId, heuristic(projectedStart.point, projectedGoal.point)]]);

    while (open.size > 0) {
      const current = [...open].sort((left, right) => {
        const scoreDelta = (fScore.get(left) ?? Number.POSITIVE_INFINITY) - (fScore.get(right) ?? Number.POSITIVE_INFINITY);
        return scoreDelta !== 0 ? scoreDelta : left.localeCompare(right);
      })[0];
      if (!current) break;
      if (current === goalId) {
        const nodeIds = reconstructPath(cameFrom, current);
        const points = nodeIds.map((id) => ({ ...requireNode(this.nodes, id) }));
        points[0] = { ...start };
        points[points.length - 1] = { ...goal };
        return { ok: true, nodeIds, points, cost: gScore.get(current) ?? 0 };
      }

      open.delete(current);
      for (const edge of this.adjacency.get(current) ?? []) {
        if (!this.isEdgeEnabled(edge.definition.id)) continue;
        const tentative = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + edge.cost;
        const previous = gScore.get(edge.to) ?? Number.POSITIVE_INFINITY;
        if (tentative >= previous) continue;
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentative);
        fScore.set(edge.to, tentative + heuristic(requireNode(this.nodes, edge.to), projectedGoal.point));
        open.add(edge.to);
      }
    }

    return {
      ok: false,
      code: "NO_PATH",
      reason: `ナビゲーション経路がありません: ${startId} -> ${goalId}`,
    };
  }

  projectToNavigablePoint(point: Vec3, maximumDistance = 6): NavigableProjection | null {
    let best: NavigableProjection | null = null;
    for (const [nodeId, candidate] of this.nodes) {
      const distance = Math.sqrt(distanceSquared(point, candidate));
      if (distance > maximumDistance) continue;
      if (!best || distance < best.distance || (distance === best.distance && nodeId < best.nodeId)) {
        best = { nodeId, point: { ...candidate }, distance };
      }
    }
    return best;
  }

  isReachable(start: Vec3, goal: Vec3): boolean {
    return this.findPath(start, goal).ok;
  }

  setEdgeEnabled(edgeId: string, enabled: boolean): NavigationPathFailure | null {
    if (!this.edges.has(edgeId)) {
      return { ok: false, code: "UNKNOWN_EDGE", reason: `不明なナビゲーションエッジです: ${edgeId}` };
    }
    this.edgeOverrides.set(edgeId, enabled);
    return null;
  }

  isEdgeEnabled(edgeId: string): boolean {
    const edge = this.edges.get(edgeId);
    if (!edge) return false;
    return this.edgeOverrides.get(edgeId) ?? edge.enabledByDefault;
  }
}

function heuristic(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSquared(a, b));
}

function requireNode(nodes: ReadonlyMap<string, Vec3>, id: string): Vec3 {
  const node = nodes.get(id);
  if (!node) throw new Error(`Navigation node disappeared: ${id}`);
  return node;
}

function reconstructPath(cameFrom: ReadonlyMap<string, string>, current: string): string[] {
  const path = [current];
  let cursor = current;
  while (cameFrom.has(cursor)) {
    cursor = cameFrom.get(cursor) ?? cursor;
    path.unshift(cursor);
  }
  return path;
}
