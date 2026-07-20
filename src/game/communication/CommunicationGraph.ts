import { distanceSquared, type Vec3 } from "../core/types";
import type {
  AgentCommunicationStatus,
  CommunicationBand,
  CommunicationLink,
  CommunicationNode,
  SignalZoneDefinition,
} from "./communicationTypes";

const LOCAL_INSTRUCTION_RANGE = 2.4;
const MAX_RADIO_RANGE = 28;

export class CommunicationGraph {
  private readonly nodes = new Map<string, CommunicationNode>();

  constructor(private readonly signalZones: readonly SignalZoneDefinition[]) {}

  setNode(node: CommunicationNode): void {
    this.nodes.set(node.id, cloneNode(node));
  }

  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  hasNode(nodeId: string): boolean {
    return this.nodes.has(nodeId);
  }

  evaluateAgentLinks(sourceAgentId: string, agentIds: readonly string[]): Readonly<Record<string, AgentCommunicationStatus>> {
    const result: Record<string, AgentCommunicationStatus> = {};
    const sourceNode = this.findAgentNode(sourceAgentId);
    for (const agentId of [...agentIds].sort()) {
      const targetNode = this.findAgentNode(agentId);
      const sourcePosition = this.findAgentPosition(sourceAgentId);
      const targetPosition = this.findAgentPosition(agentId);
      const localInstructionAllowed = Boolean(
        sourcePosition && targetPosition && distanceSquared(sourcePosition, targetPosition) <= LOCAL_INSTRUCTION_RANGE ** 2,
      );
      if (agentId === sourceAgentId) {
        result[agentId] = {
          agentId,
          quality: 1,
          band: "telemetry",
          routeNodeIds: sourceNode ? [sourceNode.id] : [],
          localInstructionAllowed: true,
        };
        continue;
      }
      if (!sourceNode || !targetNode) {
        result[agentId] = { agentId, quality: 0, band: "none", routeNodeIds: [], localInstructionAllowed };
        continue;
      }
      const link = this.findBestLink(sourceNode.id, targetNode.id, localInstructionAllowed);
      result[agentId] = {
        agentId,
        quality: link.quality,
        band: link.band,
        routeNodeIds: link.routeNodeIds,
        localInstructionAllowed,
      };
    }
    return result;
  }

  findBestLink(sourceNodeId: string, targetNodeId: string, localInstructionAllowed = false): CommunicationLink {
    const source = this.nodes.get(sourceNodeId);
    const target = this.nodes.get(targetNodeId);
    if (!source?.enabled || !target?.enabled) {
      return { sourceNodeId, targetNodeId, quality: 0, band: "none", routeNodeIds: [], localInstructionAllowed };
    }

    const available = [...this.nodes.values()]
      .filter((node) => node.enabled && node.kind !== "field-terminal")
      .sort((left, right) => left.id.localeCompare(right.id));
    const bestQuality = new Map<string, number>([[source.id, 1]]);
    const previous = new Map<string, string>();
    const unvisited = new Set(available.map((node) => node.id));

    while (unvisited.size > 0) {
      const currentId = [...unvisited].sort((left, right) => {
        const delta = (bestQuality.get(right) ?? 0) - (bestQuality.get(left) ?? 0);
        return delta !== 0 ? delta : left.localeCompare(right);
      })[0];
      if (!currentId || (bestQuality.get(currentId) ?? 0) <= 0) break;
      unvisited.delete(currentId);
      if (currentId === target.id) break;
      const current = this.nodes.get(currentId);
      if (!current) continue;
      for (const candidate of available) {
        if (!unvisited.has(candidate.id)) continue;
        const direct = this.directQuality(current, candidate);
        if (direct <= 0) continue;
        const routeQuality = Math.min(bestQuality.get(currentId) ?? 0, direct);
        const prior = bestQuality.get(candidate.id) ?? 0;
        if (routeQuality > prior) {
          bestQuality.set(candidate.id, routeQuality);
          previous.set(candidate.id, currentId);
        }
      }
    }

    const quality = roundQuality(bestQuality.get(target.id) ?? 0);
    const routeNodeIds = quality > 0 ? reconstructRoute(previous, source.id, target.id) : [];
    return {
      sourceNodeId,
      targetNodeId,
      quality,
      band: qualityToCommunicationBand(quality),
      routeNodeIds,
      localInstructionAllowed,
    };
  }

  private directQuality(left: CommunicationNode, right: CommunicationNode): number {
    if (left.id === right.id) return 1;
    if (left.kind === "agent-radio" && right.kind === "agent-radio" && left.agentId === right.agentId) return 1;
    const distance = Math.sqrt(distanceSquared(left.position, right.position));
    if (distance > MAX_RADIO_RANGE) return 0;
    const zonePenalty = Math.max(this.attenuationAt(left.position), this.attenuationAt(right.position));
    const relayBonus = left.kind === "portable-relay" || right.kind === "portable-relay" ? 0.42 : 0;
    const beaconBonus = left.kind === "extraction-beacon" || right.kind === "extraction-beacon" ? 0.08 : 0;
    return clamp(1 - distance / MAX_RADIO_RANGE - zonePenalty + relayBonus + beaconBonus, 0, 1);
  }

  private attenuationAt(position: Vec3): number {
    let attenuation = 0;
    for (const zone of this.signalZones) {
      if (
        Math.abs(position.x - zone.center.x) <= zone.halfExtents.x &&
        Math.abs(position.y - zone.center.y) <= zone.halfExtents.y &&
        Math.abs(position.z - zone.center.z) <= zone.halfExtents.z
      ) {
        attenuation = Math.max(attenuation, zone.attenuation);
      }
    }
    return attenuation;
  }

  private findAgentNode(agentId: string): CommunicationNode | null {
    return [...this.nodes.values()].find(
      (node) => node.kind === "agent-radio" && node.agentId === agentId && node.enabled,
    ) ?? null;
  }

  private findAgentPosition(agentId: string): Vec3 | null {
    const radio = [...this.nodes.values()].find((node) => node.kind === "agent-radio" && node.agentId === agentId);
    if (radio) return radio.position;
    const terminal = [...this.nodes.values()].find((node) => node.kind === "field-terminal" && node.agentId === agentId);
    return terminal?.position ?? null;
  }
}

export function qualityToCommunicationBand(quality: number): CommunicationBand {
  if (quality < 0.18) return "none";
  if (quality < 0.42) return "burst";
  if (quality < 0.72) return "voice";
  return "telemetry";
}

export function communicationBandRank(band: CommunicationBand): number {
  if (band === "none") return 0;
  if (band === "burst") return 1;
  if (band === "voice") return 2;
  return 3;
}

function cloneNode(node: CommunicationNode): CommunicationNode {
  return { ...node, position: { ...node.position } };
}

function reconstructRoute(previous: ReadonlyMap<string, string>, source: string, target: string): string[] {
  const route = [target];
  let current = target;
  while (current !== source) {
    const parent = previous.get(current);
    if (!parent) return [];
    route.unshift(parent);
    current = parent;
  }
  return route;
}

function roundQuality(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
