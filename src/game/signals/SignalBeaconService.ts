import { distanceSquared, type Vec3 } from "../core/types";
import type { ItemLocationLedger } from "../items/itemLocation";
import type { CrewId } from "../squad/squadTypes";

export interface SignalBeacon {
  readonly id: string;
  readonly sourceItemInstanceId: string;
  readonly deployedByAgentId: CrewId;
  readonly position: Vec3;
  readonly deployedAtSeconds: number;
  readonly expiresAtSeconds: number;
  readonly detectionRadius: number;
  readonly recognizedByAgentIds: CrewId[];
}

export interface SignalBeaconState {
  readonly beacons: Record<string, SignalBeacon>;
  revision: number;
}

export type FlareDeploymentCode = "DEPLOYED" | "NO_FLARE_AVAILABLE";

export interface FlareDeploymentResult {
  readonly accepted: boolean;
  readonly code: FlareDeploymentCode;
  readonly reason: string;
  readonly beacon: SignalBeacon | null;
}

export class SignalBeaconService {
  readonly state: SignalBeaconState = { beacons: {}, revision: 0 };

  deployFlare(
    agentId: CrewId,
    position: Vec3,
    elapsedSeconds: number,
    flareItemIds: readonly string[],
    locations: ItemLocationLedger,
  ): FlareDeploymentResult {
    const itemId = [...flareItemIds].sort().find((candidate) => {
      const location = locations[candidate];
      return location?.kind === "crew" && location.crewId === agentId;
    });
    if (!itemId) {
      return { accepted: false, code: "NO_FLARE_AVAILABLE", reason: "使用可能なフレアパックがありません", beacon: null };
    }
    locations[itemId] = { kind: "consumed", missionId: "active-mission" };
    const beacon: SignalBeacon = {
      id: `flare-beacon:${itemId}`,
      sourceItemInstanceId: itemId,
      deployedByAgentId: agentId,
      position: { ...position },
      deployedAtSeconds: elapsedSeconds,
      expiresAtSeconds: elapsedSeconds + 45,
      detectionRadius: 18,
      recognizedByAgentIds: [agentId],
    };
    this.state.beacons[beacon.id] = beacon;
    this.state.revision += 1;
    return { accepted: true, code: "DEPLOYED", reason: "フレア信号を展開しました", beacon };
  }

  update(elapsedSeconds: number, agentPositions: Readonly<Record<string, Vec3>>): void {
    for (const [beaconId, beacon] of Object.entries(this.state.beacons)) {
      if (elapsedSeconds >= beacon.expiresAtSeconds) {
        delete this.state.beacons[beaconId];
        this.state.revision += 1;
        continue;
      }
      for (const [agentId, position] of Object.entries(agentPositions)) {
        if (distanceSquared(position, beacon.position) > beacon.detectionRadius ** 2) continue;
        if (!beacon.recognizedByAgentIds.includes(agentId as CrewId)) {
          beacon.recognizedByAgentIds.push(agentId as CrewId);
          beacon.recognizedByAgentIds.sort();
          this.state.revision += 1;
        }
      }
    }
  }

  getActiveBeacon(beaconId?: string): SignalBeacon | null {
    if (beaconId) return this.state.beacons[beaconId] ?? null;
    return Object.values(this.state.beacons).sort((left, right) => right.deployedAtSeconds - left.deployedAtSeconds)[0] ?? null;
  }
}
