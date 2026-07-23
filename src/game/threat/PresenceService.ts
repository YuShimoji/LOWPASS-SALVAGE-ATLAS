import { copyVec3, distanceSquared, type Vec3 } from "../core/types";

export type PresenceBand = "predatory" | "cautious" | "outnumbered";

export interface PresenceEntity {
  readonly id: string;
  readonly side: "allied" | "hostile";
  readonly kind: "crew" | "friendly-machine" | "hostile-drone" | "hostile-observer";
  readonly position: Vec3;
  readonly operational: boolean;
  readonly perceptible: boolean;
}

export interface PresenceAssessment {
  readonly targetAgentId: string;
  readonly alliedPresence: number;
  readonly hostilePresence: number;
  readonly margin: number;
  readonly band: PresenceBand;
  readonly contributingEntityIds: readonly string[];
  readonly evaluatedAtSeconds: number;
}

export interface PresenceSettings {
  readonly radius: number;
  readonly crewWeight: number;
  readonly friendlyMachineWeight: number;
  readonly hostileDroneWeight: number;
  readonly hostileObserverWeight: number;
  readonly outnumberedMargin: number;
  readonly hysteresisSeconds: number;
  readonly sameTargetCooldownSeconds: number;
}

export const DEFAULT_PRESENCE_SETTINGS: PresenceSettings = Object.freeze({
  radius: 11,
  crewWeight: 1,
  friendlyMachineWeight: 0.75,
  hostileDroneWeight: 1,
  hostileObserverWeight: 0.5,
  outnumberedMargin: 0.75,
  hysteresisSeconds: 0.8,
  sameTargetCooldownSeconds: 4,
});

export type PresenceLineOfSight = (from: Vec3, to: Vec3) => boolean;

export function assessPresence(
  targetAgentId: string,
  targetPosition: Vec3,
  entities: readonly PresenceEntity[],
  evaluatedAtSeconds: number,
  hasLineOfSight: PresenceLineOfSight,
  settings: PresenceSettings = DEFAULT_PRESENCE_SETTINGS,
): PresenceAssessment {
  let alliedPresence = 0;
  let hostilePresence = 0;
  const contributingEntityIds: string[] = [];
  const radiusSquared = settings.radius ** 2;
  for (const entity of [...entities].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!entity.operational || !entity.perceptible) continue;
    if (distanceSquared(targetPosition, entity.position) > radiusSquared) continue;
    if (!hasLineOfSight(targetPosition, entity.position)) continue;
    const weight = entity.kind === "crew"
      ? settings.crewWeight
      : entity.kind === "friendly-machine"
        ? settings.friendlyMachineWeight
        : entity.kind === "hostile-observer"
          ? settings.hostileObserverWeight
          : settings.hostileDroneWeight;
    if (entity.side === "allied") alliedPresence += weight;
    else hostilePresence += weight;
    contributingEntityIds.push(entity.id);
  }
  const margin = round(alliedPresence - hostilePresence);
  const band: PresenceBand = hostilePresence >= alliedPresence
    ? "predatory"
    : margin < settings.outnumberedMargin
      ? "cautious"
      : "outnumbered";
  return Object.freeze({
    targetAgentId,
    alliedPresence: round(alliedPresence),
    hostilePresence: round(hostilePresence),
    margin,
    band,
    contributingEntityIds: Object.freeze(contributingEntityIds),
    evaluatedAtSeconds,
  });
}

export interface PresenceHysteresisState {
  current: PresenceAssessment;
  pending: PresenceAssessment | null;
  pendingSinceSeconds: number | null;
}

export class PresenceHysteresis {
  readonly state: PresenceHysteresisState;

  constructor(initial: PresenceAssessment, private readonly settings: PresenceSettings = DEFAULT_PRESENCE_SETTINGS) {
    this.state = { current: cloneAssessment(initial), pending: null, pendingSinceSeconds: null };
  }

  update(next: PresenceAssessment, elapsedSeconds: number, immediateOutnumbered = false): PresenceAssessment {
    if (next.band === this.state.current.band) {
      this.state.current = cloneAssessment(next);
      this.state.pending = null;
      this.state.pendingSinceSeconds = null;
      return this.state.current;
    }
    if (immediateOutnumbered && next.band === "outnumbered") {
      this.state.current = cloneAssessment(next);
      this.state.pending = null;
      this.state.pendingSinceSeconds = null;
      return this.state.current;
    }
    if (this.state.pending?.band !== next.band) {
      this.state.pending = cloneAssessment(next);
      this.state.pendingSinceSeconds = elapsedSeconds;
      return this.state.current;
    }
    this.state.pending = cloneAssessment(next);
    if (elapsedSeconds - (this.state.pendingSinceSeconds ?? elapsedSeconds) >= this.settings.hysteresisSeconds) {
      this.state.current = cloneAssessment(next);
      this.state.pending = null;
      this.state.pendingSinceSeconds = null;
    }
    return this.state.current;
  }
}

function cloneAssessment(value: PresenceAssessment): PresenceAssessment {
  return {
    ...value,
    contributingEntityIds: [...value.contributingEntityIds],
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function presenceTarget(position: Vec3): Vec3 {
  return copyVec3(position);
}
