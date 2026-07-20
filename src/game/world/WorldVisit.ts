import type { Vec3 } from "../core/types";
import type { ItemLocationLedger } from "../items/itemLocation";
import type { PorterAndroidState } from "../machines/machineTypes";
import type { ExpeditionManifest } from "../mission/expeditionTypes";
import type { FixedMissionDefinition } from "../mission/fixedMissionTypes";
import type { FixedMissionResult } from "../mission/MissionSession";
import type { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import type { DistributedSquadState } from "../squad/squadTypes";
import { getActiveContract, getVisitSalvageSourceIds } from "./WorldState";
import type {
  PersistedLeftBehindEquipment,
  PersistedWorldStateV1,
  WorldDefinition,
  WorldDelta,
  WorldDeltaEvent,
  WorldVisitSettlement,
} from "./worldTypes";
import { deepFreeze } from "./worldTypes";

export interface WorldVisitProjection {
  readonly definition: FixedMissionDefinition;
  readonly activeContractId: string | null;
  readonly activeObjectiveSourceIds: readonly string[];
  readonly restoredTraversalIds: readonly string[];
  readonly restoredEquipment: readonly RestoredEquipmentPlacement[];
  readonly friendlyPorter: {
    readonly machineId: string;
    readonly safeAnchorId: string;
    readonly position: Vec3;
  } | null;
  readonly diagnostics: readonly string[];
}

export interface RestoredEquipmentPlacement extends PersistedLeftBehindEquipment {
  readonly repairedPosition: boolean;
  readonly repairReason: string | null;
}

export function createWorldVisitProjection(
  persisted: PersistedWorldStateV1,
  world: WorldDefinition,
  mission: FixedMissionDefinition,
  navigation: Pick<WaypointNavigationService, "projectToNavigablePoint">,
): WorldVisitProjection {
  const salvageSourceIds = new Set(getVisitSalvageSourceIds(persisted, world));
  const active = getActiveContract(persisted, world);
  const activeObjectiveSourceIds = active
    ? world.uniqueItems
        .filter((item) => item.contractId === active.definition.id && !active.progress.recoveredObjectiveIds.includes(item.id))
        .map((item) => item.sourceId)
    : [];
  const required = new Set(activeObjectiveSourceIds);
  const restoredTraversalIds = persisted.traversalStates
    .filter((entry) => entry.state === "opened")
    .map((entry) => entry.entityId);
  const diagnostics: string[] = [];
  const restoredEquipment = persisted.leftBehindEquipment.map((entry) => {
    const placement = repairEquipmentPlacement(entry, world, navigation);
    if (placement.repairedPosition && placement.repairReason) diagnostics.push(placement.repairReason);
    return placement;
  });
  const porterRelation = persisted.machineRelations.find((entry) => entry.relation === "friendly");
  const porterAnchor = porterRelation
    ? world.anchors.find((entry) => entry.id === porterRelation.safeAnchorId)
    : null;

  return deepFreeze({
    definition: {
      ...mission,
      salvage: mission.salvage
        .filter((item) => salvageSourceIds.has(item.sourceId))
        .map((item) => ({ ...item, required: required.has(item.sourceId) })),
      searchZones: mission.searchZones.map((zone) => ({
        ...zone,
        discoveries: zone.discoveries.filter((discovery) => {
          if (discovery.kind !== "evidence") return true;
          return !persisted.evidenceStates.some((entry) => entry.entityId === discovery.id && entry.discovered);
        }),
      })),
    },
    activeContractId: active?.definition.id ?? null,
    activeObjectiveSourceIds,
    restoredTraversalIds,
    restoredEquipment,
    friendlyPorter: porterRelation && porterAnchor
      ? {
          machineId: porterRelation.machineId,
          safeAnchorId: porterRelation.safeAnchorId,
          position: { ...porterAnchor.position },
        }
      : null,
    diagnostics,
  });
}

export interface VisitDeltaInput {
  readonly visitId: string;
  readonly baseState: PersistedWorldStateV1;
  readonly world: WorldDefinition;
  readonly result: FixedMissionResult;
  readonly manifest: ExpeditionManifest;
  readonly itemLocations: Readonly<ItemLocationLedger>;
  readonly squad: DistributedSquadState;
  readonly porter: PorterAndroidState;
}

export function buildWorldVisitSettlement(input: VisitDeltaInput): WorldVisitSettlement {
  const events: WorldDeltaEvent[] = [];
  const active = getActiveContract(input.baseState, input.world);

  for (const recoveredId of input.result.recoveredResourceIds) {
    const sourceId = sourceIdFromMissionItemId(recoveredId);
    const uniqueItem = input.world.uniqueItems.find((item) => item.sourceId === sourceId);
    if (!uniqueItem) continue;
    events.push({ type: "unique-item-extracted", itemId: uniqueItem.id, visitId: input.visitId });
    if (active?.definition.id === uniqueItem.contractId) {
      events.push({
        type: "contract-objective-recovered",
        contractId: active.definition.id,
        objectiveId: uniqueItem.id,
        visitId: input.visitId,
      });
    }
  }

  for (const traversal of input.world.traversal) {
    if (input.squad.shortcutOpenById[traversal.shortcutId]) {
      events.push({ type: "traversal-opened", traversalId: traversal.id });
    }
  }

  const manifestDefinitionByItem = new Map(input.manifest.items.map((item) => [item.instanceId, item.definitionId]));
  const currentLeftIds = new Set<string>();
  for (const [itemInstanceId, definitionId] of manifestDefinitionByItem) {
    const location = input.itemLocations[itemInstanceId];
    if (location?.kind !== "mission-ground") continue;
    currentLeftIds.add(itemInstanceId);
    events.push({
      type: "equipment-left-behind",
      itemInstanceId,
      definitionId,
      position: { ...location.position },
      rotationY: 0,
      operationalState: input.squad.disabledRelayItemIds.includes(itemInstanceId) ? "disabled" : "active",
    });
  }
  for (const previous of input.baseState.leftBehindEquipment) {
    if (!currentLeftIds.has(previous.itemInstanceId) && input.itemLocations[previous.itemInstanceId]?.kind === "crew") {
      events.push({ type: "equipment-recovered", itemInstanceId: previous.itemInstanceId });
    }
  }

  const machineDefinition = input.world.machines.find((entry) => entry.id === input.porter.id);
  if (input.porter.authenticated && machineDefinition) {
    events.push({
      type: "porter-befriended",
      machineId: machineDefinition.id,
      safeAnchorId: machineDefinition.safeAnchorId,
      assistedVisit: input.result.alliedMachineOutcomes.some((outcome) => outcome.machineId === input.porter.id),
      visitId: input.visitId,
    });
  }

  const evidenceIds = new Set<string>();
  for (const agentKnowledge of Object.values(input.squad.knowledge.byAgent)) {
    for (const entry of Object.values(agentKnowledge.entries)) {
      if (entry.kind === "evidence") evidenceIds.add(entry.sourceId);
    }
  }
  for (const sourceId of evidenceIds) {
    const evidence = input.world.evidence.find((entry) => entry.sourceId === sourceId);
    if (evidence) events.push({ type: "evidence-discovered", evidenceId: evidence.id, visitId: input.visitId });
  }

  const delta: WorldDelta = deepFreeze({ events });
  return deepFreeze({
    id: `settlement:${input.baseState.worldInstanceId}:${input.result.sessionId}`,
    worldInstanceId: input.baseState.worldInstanceId,
    expectedRevision: input.baseState.revision,
    missionOutcomeId: `${input.result.sessionId}:${input.result.outcome}`,
    outcome: input.result.outcome,
    delta,
  });
}

export function repairEquipmentPlacement(
  entry: PersistedLeftBehindEquipment,
  world: WorldDefinition,
  navigation: Pick<WaypointNavigationService, "projectToNavigablePoint">,
): RestoredEquipmentPlacement {
  if (isFinitePosition(entry.position)) {
    const projection = navigation.projectToNavigablePoint(entry.position, 3);
    if (projection) return deepFreeze({ ...entry, position: { ...entry.position }, repairedPosition: false, repairReason: null });
  }
  const projection = isFinitePosition(entry.position)
    ? navigation.projectToNavigablePoint(entry.position)
    : null;
  if (projection) {
    return deepFreeze({
      ...entry,
      position: { ...projection.point },
      repairedPosition: true,
      repairReason: `WORLD_RESTORE_POSITION_PROJECTED // ${entry.itemInstanceId} -> ${projection.nodeId}`,
    });
  }
  const fallback = world.anchors.find((anchor) => anchor.id === "anchor-extraction") ?? world.anchors[0];
  if (!fallback) throw new Error("World definition has no equipment restore anchor");
  return deepFreeze({
    ...entry,
    position: { ...fallback.position },
    repairedPosition: true,
    repairReason: `WORLD_RESTORE_POSITION_FALLBACK // ${entry.itemInstanceId} -> ${fallback.id}`,
  });
}

export function sourceIdFromMissionItemId(itemId: string): string {
  const separator = itemId.lastIndexOf(":");
  return separator >= 0 ? itemId.slice(separator + 1) : itemId;
}

function isFinitePosition(position: Vec3): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}
