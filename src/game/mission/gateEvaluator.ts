import type { ItemDefinition, ItemInstance } from "../items/itemDefinitions";
import { GATE_CAPACITY_UNITS } from "./missionTypes";
import type { ExpeditionDraft } from "./expeditionTypes";
import type { CrewDefinition } from "../squad/squadTypes";

export const GATE_MAX_VOLUME_LOAD = 4;
export const GATE_MAX_LOGIC_LOAD = 3;

export type GateViolationCode =
  | "NO_CREW_SELECTED"
  | "NO_FIELD_LEAD"
  | "MULTIPLE_FIELD_LEADS"
  | "ITEM_UNASSIGNED"
  | "ITEM_ASSIGNED_TO_UNSELECTED_AGENT"
  | "ITEM_ASSIGNED_MULTIPLE_TIMES"
  | "TOTAL_CAPACITY_EXCEEDED"
  | "OBJECT_VOLUME_LIMIT_EXCEEDED"
  | "OBJECT_LOGIC_LIMIT_EXCEEDED"
  | "UNKNOWN_ITEM_INSTANCE"
  | "UNKNOWN_ITEM_DEFINITION"
  | "UNKNOWN_AGENT";

export interface GateViolation {
  readonly code: GateViolationCode;
  readonly message: string;
  readonly subjectId: string | null;
  readonly actual: number | null;
  readonly limit: number | null;
}

export interface GateCapacitySummary {
  readonly usedUnits: number;
  readonly limitUnits: typeof GATE_CAPACITY_UNITS;
  readonly crewUnits: number;
  readonly itemUnits: number;
}

export interface GateEvaluationContext {
  readonly agents: readonly CrewDefinition[];
  readonly itemDefinitions: Readonly<Record<string, ItemDefinition>>;
  readonly itemInstances: readonly ItemInstance[];
}

export interface ItemGateEvaluation {
  readonly accepted: boolean;
  readonly itemInstanceId: string;
  readonly definition: ItemDefinition | null;
  readonly violations: readonly GateViolation[];
}

export interface ExpeditionGateEvaluation {
  readonly accepted: boolean;
  readonly capacity: GateCapacitySummary;
  readonly violations: readonly GateViolation[];
  readonly configurationViolations: readonly GateViolation[];
  readonly objectLimitViolations: readonly GateViolation[];
  readonly totalCapacityViolation: GateViolation | null;
}

export function evaluateItemForGate(
  itemInstanceId: string,
  context: GateEvaluationContext,
): ItemGateEvaluation {
  const instance = context.itemInstances.find((candidate) => candidate.id === itemInstanceId);
  if (!instance) {
    const violation = makeViolation(
      "UNKNOWN_ITEM_INSTANCE",
      `不明な装備実体です: ${itemInstanceId}`,
      itemInstanceId,
    );
    return { accepted: false, itemInstanceId, definition: null, violations: [violation] };
  }

  const definition = context.itemDefinitions[instance.definitionId];
  if (!definition) {
    const violation = makeViolation(
      "UNKNOWN_ITEM_DEFINITION",
      `装備定義が見つかりません: ${instance.definitionId}`,
      instance.definitionId,
    );
    return { accepted: false, itemInstanceId, definition: null, violations: [violation] };
  }

  const violations: GateViolation[] = [];
  if (definition.volumeLoad > GATE_MAX_VOLUME_LOAD) {
    violations.push(
      makeViolation(
        "OBJECT_VOLUME_LIMIT_EXCEEDED",
        `${definition.label}の容積負荷 ${definition.volumeLoad} は単体上限 ${GATE_MAX_VOLUME_LOAD} を超過しています`,
        itemInstanceId,
        definition.volumeLoad,
        GATE_MAX_VOLUME_LOAD,
      ),
    );
  }
  if (definition.logicLoad > GATE_MAX_LOGIC_LOAD) {
    violations.push(
      makeViolation(
        "OBJECT_LOGIC_LIMIT_EXCEEDED",
        `${definition.label}の論理負荷 ${definition.logicLoad} は単体上限 ${GATE_MAX_LOGIC_LOAD} を超過しています`,
        itemInstanceId,
        definition.logicLoad,
        GATE_MAX_LOGIC_LOAD,
      ),
    );
  }

  return {
    accepted: violations.length === 0,
    itemInstanceId,
    definition,
    violations,
  };
}

export function evaluateExpeditionDraft(
  draft: ExpeditionDraft,
  context: GateEvaluationContext,
): ExpeditionGateEvaluation {
  const violations: GateViolation[] = [];
  const agentById = new Map<string, CrewDefinition>(context.agents.map((agent) => [agent.id, agent]));
  const uniqueSelectedAgentIds = [...new Set(draft.selectedAgentIds)];
  const uniqueItemIds = [...new Set(draft.itemInstanceIds)];

  for (const agentId of new Set([
    ...draft.selectedAgentIds,
    ...draft.fieldLeadIds,
    ...draft.assignments.map((assignment) => assignment.agentId),
  ])) {
    if (!agentById.has(agentId)) {
      violations.push(makeViolation("UNKNOWN_AGENT", `不明な隊員です: ${agentId}`, agentId));
    }
  }

  if (uniqueSelectedAgentIds.length === 0) {
    violations.push(makeViolation("NO_CREW_SELECTED", "遠征隊員を1名以上選択してください"));
  }

  if (draft.fieldLeadIds.length === 0) {
    violations.push(makeViolation("NO_FIELD_LEAD", "フィールドリーダーを1名指定してください"));
  } else if (draft.fieldLeadIds.length > 1) {
    violations.push(
      makeViolation(
        "MULTIPLE_FIELD_LEADS",
        "フィールドリーダーは1名だけ指定できます",
        null,
        draft.fieldLeadIds.length,
        1,
      ),
    );
  } else if (!uniqueSelectedAgentIds.includes(draft.fieldLeadIds[0] ?? "")) {
    violations.push(
      makeViolation("NO_FIELD_LEAD", "選択中の隊員からフィールドリーダーを指定してください", draft.fieldLeadIds[0] ?? null),
    );
  }

  const assignmentCounts = new Map<string, number>();
  for (const assignment of draft.assignments) {
    assignmentCounts.set(assignment.itemInstanceId, (assignmentCounts.get(assignment.itemInstanceId) ?? 0) + 1);
    if (!uniqueSelectedAgentIds.includes(assignment.agentId)) {
      violations.push(
        makeViolation(
          "ITEM_ASSIGNED_TO_UNSELECTED_AGENT",
          `${assignment.itemInstanceId} は未選択の隊員 ${assignment.agentId} に割り当てられています`,
          assignment.itemInstanceId,
        ),
      );
    }
  }

  for (const itemInstanceId of uniqueItemIds) {
    const count = assignmentCounts.get(itemInstanceId) ?? 0;
    if (count === 0) {
      violations.push(
        makeViolation("ITEM_UNASSIGNED", `${itemInstanceId} が隊員へ割り当てられていません`, itemInstanceId),
      );
    }
    if (count > 1) {
      violations.push(
        makeViolation(
          "ITEM_ASSIGNED_MULTIPLE_TIMES",
          `${itemInstanceId} が複数回割り当てられています`,
          itemInstanceId,
          count,
          1,
        ),
      );
    }
  }

  let itemUnits = 0;
  const objectLimitViolations: GateViolation[] = [];
  for (const itemInstanceId of uniqueItemIds) {
    const itemEvaluation = evaluateItemForGate(itemInstanceId, context);
    violations.push(...itemEvaluation.violations);
    objectLimitViolations.push(
      ...itemEvaluation.violations.filter(
        (violation) =>
          violation.code === "OBJECT_VOLUME_LIMIT_EXCEEDED" ||
          violation.code === "OBJECT_LOGIC_LIMIT_EXCEEDED",
      ),
    );
    itemUnits += itemEvaluation.definition?.capacityUnits ?? 0;
  }

  for (const assignment of draft.assignments) {
    if (!uniqueItemIds.includes(assignment.itemInstanceId)) {
      const assignmentEvaluation = evaluateItemForGate(assignment.itemInstanceId, context);
      if (!assignmentEvaluation.accepted) violations.push(...assignmentEvaluation.violations);
    }
  }

  const crewUnits = uniqueSelectedAgentIds.reduce(
    (total, agentId) => total + (agentById.get(agentId)?.gateCapacityUnits ?? 0),
    0,
  );
  const usedUnits = crewUnits + itemUnits;
  const totalCapacityViolation =
    usedUnits > GATE_CAPACITY_UNITS
      ? makeViolation(
          "TOTAL_CAPACITY_EXCEEDED",
          `総容量 ${usedUnits}U はゲート上限 ${GATE_CAPACITY_UNITS}U を超過しています`,
          null,
          usedUnits,
          GATE_CAPACITY_UNITS,
        )
      : null;
  if (totalCapacityViolation) violations.push(totalCapacityViolation);

  const objectCodes = new Set<GateViolationCode>([
    "OBJECT_VOLUME_LIMIT_EXCEEDED",
    "OBJECT_LOGIC_LIMIT_EXCEEDED",
  ]);
  const configurationViolations = violations.filter(
    (violation) => !objectCodes.has(violation.code) && violation.code !== "TOTAL_CAPACITY_EXCEEDED",
  );

  return {
    accepted: violations.length === 0,
    capacity: {
      usedUnits,
      limitUnits: GATE_CAPACITY_UNITS,
      crewUnits,
      itemUnits,
    },
    violations,
    configurationViolations,
    objectLimitViolations,
    totalCapacityViolation,
  };
}

function makeViolation(
  code: GateViolationCode,
  message: string,
  subjectId: string | null = null,
  actual: number | null = null,
  limit: number | null = null,
): GateViolation {
  return { code, message, subjectId, actual, limit };
}
