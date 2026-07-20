import type { ItemDefinition, ItemInstance } from "../items/itemDefinitions";
import type { CrewDefinition, CrewId } from "../squad/squadTypes";
import type {
  ExpeditionDraft,
  ExpeditionManifest,
  ManifestItemSnapshot,
  ManifestLoadout,
} from "./expeditionTypes";
import {
  evaluateExpeditionDraft,
  type ExpeditionGateEvaluation,
  type GateEvaluationContext,
} from "./gateEvaluator";

export interface ManifestMetadata {
  readonly manifestId: string;
  readonly createdAtIso: string;
}

export class InvalidExpeditionDraftError extends Error {
  constructor(readonly evaluation: ExpeditionGateEvaluation) {
    super("Expedition draft does not satisfy the gate contract");
    this.name = "InvalidExpeditionDraftError";
  }
}

export class ExpeditionAlreadyConfirmedError extends Error {
  constructor() {
    super("Expedition manifest has already been confirmed");
    this.name = "ExpeditionAlreadyConfirmedError";
  }
}

export class ExpeditionPlanner {
  private readonly draft: ExpeditionDraft;
  private confirmedManifest: ExpeditionManifest | null = null;

  constructor(
    initialDraft: ExpeditionDraft,
    private readonly context: GateEvaluationContext,
  ) {
    this.draft = cloneDraft(initialDraft);
  }

  getDraftSnapshot(): ExpeditionDraft {
    return cloneDraft(this.draft);
  }

  getEvaluation(): ExpeditionGateEvaluation {
    return evaluateExpeditionDraft(this.draft, this.context);
  }

  getConfirmedManifest(): ExpeditionManifest | null {
    return this.confirmedManifest;
  }

  getAvailableInventory(): readonly ItemInstance[] {
    const assigned = new Set(this.draft.itemInstanceIds);
    const shipInventory = new Set(this.context.shipInventoryItemIds);
    return this.context.itemInstances.filter(
      (instance) => shipInventory.has(instance.id) && !assigned.has(instance.id),
    );
  }

  setAgentSelected(agentId: CrewId, selected: boolean): void {
    this.assertEditable();
    const currentlySelected = this.draft.selectedAgentIds.includes(agentId);
    if (currentlySelected === selected) return;

    if (selected) {
      this.draft.selectedAgentIds.push(agentId);
    } else {
      this.draft.selectedAgentIds = this.draft.selectedAgentIds.filter((id) => id !== agentId);
      this.draft.fieldLeadIds = this.draft.fieldLeadIds.filter((id) => id !== agentId);
      const returnedItems = new Set(
        this.draft.assignments
          .filter((assignment) => assignment.agentId === agentId)
          .map((assignment) => assignment.itemInstanceId),
      );
      this.draft.assignments = this.draft.assignments.filter((assignment) => assignment.agentId !== agentId);
      this.draft.itemInstanceIds = this.draft.itemInstanceIds.filter((id) => !returnedItems.has(id));
    }
    this.bumpRevision();
  }

  setFieldLead(agentId: CrewId | null): void {
    this.assertEditable();
    const next = agentId ? [agentId] : [];
    if (this.draft.fieldLeadIds.length === next.length && this.draft.fieldLeadIds[0] === next[0]) return;
    this.draft.fieldLeadIds = next;
    this.bumpRevision();
  }

  assignItem(itemInstanceId: string, agentId: CrewId): void {
    this.assertEditable();
    if (!this.draft.selectedAgentIds.includes(agentId)) {
      throw new Error(`Cannot assign an item to unselected agent ${agentId}`);
    }
    const knownItem = this.context.itemInstances.some(
      (instance) =>
        instance.id === itemInstanceId && this.context.shipInventoryItemIds.includes(instance.id),
    );
    if (!knownItem) throw new Error(`Unknown ship inventory item ${itemInstanceId}`);

    this.draft.assignments = this.draft.assignments.filter(
      (assignment) => assignment.itemInstanceId !== itemInstanceId,
    );
    this.draft.assignments.push({ itemInstanceId, agentId });
    if (!this.draft.itemInstanceIds.includes(itemInstanceId)) {
      this.draft.itemInstanceIds.push(itemInstanceId);
    }
    this.bumpRevision();
  }

  unassignItem(itemInstanceId: string): void {
    this.assertEditable();
    const previousLength = this.draft.itemInstanceIds.length;
    this.draft.itemInstanceIds = this.draft.itemInstanceIds.filter((id) => id !== itemInstanceId);
    this.draft.assignments = this.draft.assignments.filter(
      (assignment) => assignment.itemInstanceId !== itemInstanceId,
    );
    if (this.draft.itemInstanceIds.length !== previousLength) this.bumpRevision();
  }

  confirm(metadata: ManifestMetadata): ExpeditionManifest {
    if (this.confirmedManifest) throw new ExpeditionAlreadyConfirmedError();
    this.confirmedManifest = createExpeditionManifest(this.draft, this.context, metadata);
    return this.confirmedManifest;
  }

  private assertEditable(): void {
    if (this.confirmedManifest) throw new ExpeditionAlreadyConfirmedError();
  }

  private bumpRevision(): void {
    this.draft.revision += 1;
  }
}

export function createExpeditionManifest(
  draft: ExpeditionDraft,
  context: GateEvaluationContext,
  metadata: ManifestMetadata,
): ExpeditionManifest {
  const evaluation = evaluateExpeditionDraft(draft, context);
  if (!evaluation.accepted) throw new InvalidExpeditionDraftError(evaluation);

  const instanceById = new Map(context.itemInstances.map((instance) => [instance.id, instance]));
  const selectedAgentIds = [...draft.selectedAgentIds] as CrewId[];
  const fieldLeadId = draft.fieldLeadIds[0] as CrewId;
  const loadouts: ManifestLoadout[] = selectedAgentIds.map((agentId) => ({
    agentId,
    itemInstanceIds: draft.assignments
      .filter((assignment) => assignment.agentId === agentId)
      .map((assignment) => assignment.itemInstanceId),
  }));
  const items: ManifestItemSnapshot[] = draft.assignments.map((assignment) => {
    const instance = instanceById.get(assignment.itemInstanceId);
    if (!instance) throw new Error(`Validated item disappeared: ${assignment.itemInstanceId}`);
    return {
      instanceId: instance.id,
      definitionId: instance.definitionId,
      assignedAgentId: assignment.agentId as CrewId,
    };
  });

  return deepFreeze({
    schemaVersion: 1 as const,
    manifestId: metadata.manifestId,
    createdAtIso: metadata.createdAtIso,
    sourceDraftRevision: draft.revision,
    fieldLeadId,
    selectedAgentIds,
    loadouts,
    items,
    totalCapacityUnits: evaluation.capacity.usedUnits,
    capacityLimitUnits: evaluation.capacity.limitUnits,
  });
}

export function createGateEvaluationContext(
  agents: readonly CrewDefinition[],
  itemDefinitions: Readonly<Record<string, ItemDefinition>>,
  itemInstances: readonly ItemInstance[],
  shipInventoryItemIds: readonly string[] = itemInstances.map((item) => item.id),
): GateEvaluationContext {
  return { agents, itemDefinitions, itemInstances, shipInventoryItemIds };
}

function cloneDraft(draft: ExpeditionDraft): ExpeditionDraft {
  return {
    revision: draft.revision,
    selectedAgentIds: [...draft.selectedAgentIds],
    fieldLeadIds: [...draft.fieldLeadIds],
    itemInstanceIds: [...draft.itemInstanceIds],
    assignments: draft.assignments.map((assignment) => ({ ...assignment })),
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
