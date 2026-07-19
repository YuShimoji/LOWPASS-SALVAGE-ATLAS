import { describe, expect, it } from "vitest";
import {
  GATE_DEMONSTRATOR_ITEMS,
  ITEM_DEFINITIONS,
  SHIP_INVENTORY,
  type ItemDefinitionId,
  type ItemInstance,
} from "../items/itemDefinitions";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import type { ExpeditionDraft } from "./expeditionTypes";
import { createGateEvaluationContext } from "./ExpeditionPlanner";
import { evaluateExpeditionDraft, evaluateItemForGate } from "./gateEvaluator";

const context = createGateEvaluationContext(
  CREW_DEFINITIONS,
  ITEM_DEFINITIONS,
  [...SHIP_INVENTORY, ...GATE_DEMONSTRATOR_ITEMS],
);

describe("gate evaluator", () => {
  it("accepts an expedition at exactly 28U", () => {
    const evaluation = evaluateExpeditionDraft(
      draftWithItems(["terminal-01", "relay-01", "cutter-01", "radio-01", "flare-01"]),
      context,
    );
    expect(evaluation.capacity.usedUnits).toBe(28);
    expect(evaluation.accepted).toBe(true);
  });

  it("rejects an expedition at 29U", () => {
    const evaluation = evaluateExpeditionDraft(
      draftWithItems([
        "terminal-01",
        "relay-01",
        "cutter-01",
        "radio-01",
        "flare-01",
        "crowbar-01",
      ]),
      context,
    );
    expect(evaluation.capacity.usedUnits).toBe(29);
    expect(evaluation.violations.map((violation) => violation.code)).toContain("TOTAL_CAPACITY_EXCEEDED");
  });

  it("accepts the field terminal at both individual limits", () => {
    const evaluation = evaluateItemForGate("scan-field-terminal", context);
    expect(evaluation.accepted).toBe(true);
    expect(evaluation.definition?.logicLoad).toBe(3);
  });

  it("rejects the advanced terminal on logic even when total capacity would fit", () => {
    const evaluation = evaluateItemForGate("scan-advanced-terminal", context);
    expect(evaluation.violations.map((violation) => violation.code)).toEqual([
      "OBJECT_LOGIC_LIMIT_EXCEEDED",
    ]);
  });

  it("rejects the shopping cart on volume even when total capacity would fit", () => {
    const evaluation = evaluateItemForGate("scan-shopping-cart", context);
    expect(evaluation.violations.map((violation) => violation.code)).toEqual([
      "OBJECT_VOLUME_LIMIT_EXCEEDED",
    ]);
  });

  it("rejects a duplicate assignment of the same item instance", () => {
    const draft = draftWithItems(["radio-01"]);
    draft.assignments.push({ itemInstanceId: "radio-01", agentId: "mara" });
    const evaluation = evaluateExpeditionDraft(draft, context);
    expect(evaluation.violations.map((violation) => violation.code)).toContain(
      "ITEM_ASSIGNED_MULTIPLE_TIMES",
    );
  });

  it("rejects assignment to an unselected agent", () => {
    const draft = draftWithItems(["radio-01"]);
    draft.selectedAgentIds = ["player"];
    draft.assignments = [{ itemInstanceId: "radio-01", agentId: "mara" }];
    const evaluation = evaluateExpeditionDraft(draft, context);
    expect(evaluation.violations.map((violation) => violation.code)).toContain(
      "ITEM_ASSIGNED_TO_UNSELECTED_AGENT",
    );
  });

  it("rejects a missing field lead", () => {
    const draft = draftWithItems([]);
    draft.fieldLeadIds = [];
    expect(evaluateExpeditionDraft(draft, context).violations.map((violation) => violation.code)).toContain(
      "NO_FIELD_LEAD",
    );
  });

  it("rejects multiple field leads", () => {
    const draft = draftWithItems([]);
    draft.fieldLeadIds = ["player", "mara"];
    expect(evaluateExpeditionDraft(draft, context).violations.map((violation) => violation.code)).toContain(
      "MULTIPLE_FIELD_LEADS",
    );
  });

  it("returns structured unknown and unassigned violations", () => {
    const unknownDefinitionItem: ItemInstance = {
      id: "unknown-definition-01",
      definitionId: "missing-definition" as ItemDefinitionId,
      condition: "damaged",
      location: "ship-inventory",
    };
    const extendedContext = createGateEvaluationContext(
      CREW_DEFINITIONS,
      ITEM_DEFINITIONS,
      [...context.itemInstances, unknownDefinitionItem],
    );
    const draft: ExpeditionDraft = {
      revision: 0,
      selectedAgentIds: ["unknown-agent"],
      fieldLeadIds: [],
      itemInstanceIds: ["missing-instance", "unknown-definition-01"],
      assignments: [],
    };
    const codes = evaluateExpeditionDraft(draft, extendedContext).violations.map(
      (violation) => violation.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        "UNKNOWN_AGENT",
        "NO_FIELD_LEAD",
        "ITEM_UNASSIGNED",
        "UNKNOWN_ITEM_INSTANCE",
        "UNKNOWN_ITEM_DEFINITION",
      ]),
    );
  });
});

function draftWithItems(itemInstanceIds: string[]): ExpeditionDraft {
  return {
    revision: 0,
    selectedAgentIds: ["player", "mara", "ito"],
    fieldLeadIds: ["player"],
    itemInstanceIds: [...itemInstanceIds],
    assignments: itemInstanceIds.map((itemInstanceId, index) => ({
      itemInstanceId,
      agentId: CREW_DEFINITIONS[index % CREW_DEFINITIONS.length]?.id ?? "player",
    })),
  };
}
