import { distanceSquared, type Vec3 } from "../core/types";
import type { HostileMachineId, HostileMachineLinkState } from "./securityTypes";
import type { SignalZoneDefinition } from "../communication/communicationTypes";

interface HostileLinkNode {
  readonly id: HostileMachineId;
  readonly position: Vec3;
  readonly enabled: boolean;
}

export type HostileLinkLineOfSight = (from: Vec3, to: Vec3) => boolean;

export class HostileMachineLinkGraph {
  private readonly nodes = new Map<HostileMachineId, HostileLinkNode>();

  constructor(
    private readonly signalZones: readonly SignalZoneDefinition[],
    private readonly maximumRange = 32,
  ) {}

  setNode(node: HostileLinkNode): void {
    this.nodes.set(node.id, { ...node, position: { ...node.position } });
  }

  removeNode(machineId: HostileMachineId): void {
    this.nodes.delete(machineId);
  }

  evaluate(
    sourceMachineId: HostileMachineId,
    targetMachineId: HostileMachineId,
    elapsedSeconds: number,
    hasLineOfSight: HostileLinkLineOfSight,
  ): HostileMachineLinkState {
    const source = this.nodes.get(sourceMachineId);
    const target = this.nodes.get(targetMachineId);
    if (!source?.enabled || !target?.enabled) return disconnected(sourceMachineId, targetMachineId, elapsedSeconds);
    const distance = Math.sqrt(distanceSquared(source.position, target.position));
    if (distance > this.maximumRange) return disconnected(sourceMachineId, targetMachineId, elapsedSeconds);
    const zonePenalty = Math.max(this.attenuationAt(source.position), this.attenuationAt(target.position));
    const partitionPenalty = hasLineOfSight(source.position, target.position) ? 0 : 0.34;
    const quality = round(clamp(1 - distance / this.maximumRange - zonePenalty - partitionPenalty, 0, 1));
    const connected = quality >= 0.12;
    return {
      sourceMachineId,
      targetMachineId,
      quality: connected ? quality : 0,
      delaySeconds: connected ? round(0.25 + (1 - quality) * 1.5) : Number.POSITIVE_INFINITY,
      connected,
      evaluatedAtSeconds: elapsedSeconds,
    };
  }

  private attenuationAt(position: Vec3): number {
    let attenuation = 0;
    for (const zone of this.signalZones) {
      if (
        Math.abs(position.x - zone.center.x) <= zone.halfExtents.x
        && Math.abs(position.y - zone.center.y) <= zone.halfExtents.y
        && Math.abs(position.z - zone.center.z) <= zone.halfExtents.z
      ) attenuation = Math.max(attenuation, zone.attenuation);
    }
    return attenuation;
  }
}

function disconnected(
  sourceMachineId: HostileMachineId,
  targetMachineId: HostileMachineId,
  elapsedSeconds: number,
): HostileMachineLinkState {
  return {
    sourceMachineId,
    targetMachineId,
    quality: 0,
    delaySeconds: Number.POSITIVE_INFINITY,
    connected: false,
    evaluatedAtSeconds: elapsedSeconds,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
