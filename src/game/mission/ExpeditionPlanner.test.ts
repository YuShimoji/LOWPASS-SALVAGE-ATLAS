import { describe, expect, it } from "vitest";
import { ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import { createInitialExpeditionDraft } from "./expeditionTypes";
import {
  createExpeditionManifest,
  createGateEvaluationContext,
  ExpeditionAlreadyConfirmedError,
  ExpeditionPlanner,
} from "./ExpeditionPlanner";

const context = createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY);
const metadata = {
  manifestId: "manifest-test-001",
  createdAtIso: "2026-07-20T00:00:00.000Z",
};

describe("ExpeditionPlanner", () => {
  it("returns an agent's assigned equipment to ship inventory when that agent is removed", () => {
    const planner = new ExpeditionPlanner(createInitialExpeditionDraft(), context);
    expect(planner.getAvailableInventory().some((item) => item.id === "flare-01")).toBe(false);

    planner.setAgentSelected("mara", false);

    expect(planner.getDraftSnapshot().itemInstanceIds).not.toContain("flare-01");
    expect(planner.getAvailableInventory().some((item) => item.id === "flare-01")).toBe(true);
  });

  it("creates a deeply immutable manifest independent from later draft changes", () => {
    const draft = createInitialExpeditionDraft();
    const manifest = createExpeditionManifest(draft, context, metadata);

    draft.selectedAgentIds.splice(0, draft.selectedAgentIds.length, "ito");
    draft.assignments[0]!.agentId = "ito";

    expect(manifest.selectedAgentIds).toEqual(["player", "mara", "ito"]);
    expect(manifest.loadouts.find((loadout) => loadout.agentId === "player")?.itemInstanceIds).toEqual([
      "radio-01",
    ]);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.loadouts)).toBe(true);
    expect(Object.isFrozen(manifest.loadouts[0]?.itemInstanceIds)).toBe(true);
  });

  it("preserves major manifest information through a JSON round trip", () => {
    const manifest = createExpeditionManifest(createInitialExpeditionDraft(), context, metadata);
    const restored = JSON.parse(JSON.stringify(manifest)) as typeof manifest;

    expect(restored.manifestId).toBe(metadata.manifestId);
    expect(restored.fieldLeadId).toBe("player");
    expect(restored.selectedAgentIds).toEqual(["player", "mara", "ito"]);
    expect(restored.totalCapacityUnits).toBe(18);
    expect(restored.items.map((item) => item.instanceId)).toEqual(["radio-01", "flare-01"]);
  });

  it("prevents a second confirmation", () => {
    const planner = new ExpeditionPlanner(createInitialExpeditionDraft(), context);
    const first = planner.confirm(metadata);

    expect(first.manifestId).toBe(metadata.manifestId);
    expect(() => planner.confirm({ ...metadata, manifestId: "manifest-test-002" })).toThrow(
      ExpeditionAlreadyConfirmedError,
    );
  });
});
