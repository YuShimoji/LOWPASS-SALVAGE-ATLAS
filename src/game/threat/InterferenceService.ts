import { copyVec3, type Vec3 } from "../core/types";
import type { ItemLocationLedger } from "../items/itemLocation";
import type { CrewId } from "../squad/squadTypes";

export const INTERFERENCE_DURATION_SECONDS = 8;

export interface InterferencePulseResult {
  readonly targetAgentId: CrewId;
  readonly communicationLimitedUntilSeconds: number;
  readonly droppedItemId: string | null;
  readonly interruptedInteraction: boolean;
}

export function applyInterferencePulse(
  targetAgentId: CrewId,
  targetPosition: Vec3,
  elapsedSeconds: number,
  handResourceItemIds: readonly string[],
  itemLocations: ItemLocationLedger,
): InterferencePulseResult {
  const droppedItemId = [...handResourceItemIds]
    .sort()
    .find((itemId) => {
      const location = itemLocations[itemId];
      return location?.kind === "crew" && location.crewId === targetAgentId;
    }) ?? null;
  if (droppedItemId) {
    itemLocations[droppedItemId] = {
      kind: "mission-ground",
      position: { ...copyVec3(targetPosition), y: Math.max(0.32, targetPosition.y - 0.58) },
    };
  }
  return Object.freeze({
    targetAgentId,
    communicationLimitedUntilSeconds: elapsedSeconds + INTERFERENCE_DURATION_SECONDS,
    droppedItemId,
    interruptedInteraction: true,
  });
}
