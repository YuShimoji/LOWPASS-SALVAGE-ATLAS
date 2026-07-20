import { describe, expect, it } from "vitest";
import { ITEM_DEFINITIONS, SHIP_INVENTORY } from "../items/itemDefinitions";
import { createExpeditionManifest, createGateEvaluationContext } from "../mission/ExpeditionPlanner";
import { createInitialExpeditionDraft } from "../mission/expeditionTypes";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import { CREW_DEFINITIONS } from "../squad/squadTypes";
import { createInsertionPlan, InvalidInsertionPlanError } from "./InsertionPlanner";

const manifest = createExpeditionManifest(
  createInitialExpeditionDraft(),
  createGateEvaluationContext(CREW_DEFINITIONS, ITEM_DEFINITIONS, SHIP_INVENTORY),
  { manifestId: "insertion-manifest", createdAtIso: "2026-07-20T00:00:00.000Z" },
);

function context(navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation)) {
  return {
    missionId: FLOODED_MARKET_MISSION.id,
    extractionPoint: FLOODED_MARKET_MISSION.extractionPoint,
    anchors: FLOODED_MARKET_MISSION.insertionAnchors,
    presets: FLOODED_MARKET_MISSION.insertionPresets,
    colliders: FLOODED_MARKET_MISSION.colliders,
    navigation,
  };
}

describe("InsertionPlanner", () => {
  it("produces the same immutable plan from the same mission, manifest, mode, and seed", () => {
    const first = createInsertionPlan(manifest, "scattered", "atlas-seed", context());
    const second = createInsertionPlan(manifest, "scattered", "atlas-seed", context());
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("enforces stable, paired, and scattered placement distances", () => {
    const stable = createInsertionPlan(manifest, "stable", "s", context());
    const paired = createInsertionPlan(manifest, "paired", "p", context());
    const scattered = createInsertionPlan(manifest, "scattered", "x", context());
    expect(maximumPairDistance(stable.placements.map((placement) => placement.position))).toBeLessThanOrEqual(2.6);
    expect(minimumPairDistance(paired.placements.map((placement) => placement.position))).toBeLessThanOrEqual(2.6);
    expect(maximumPairDistance(paired.placements.map((placement) => placement.position))).toBeGreaterThanOrEqual(4);
    expect(minimumPairDistance(scattered.placements.map((placement) => placement.position))).toBeGreaterThanOrEqual(5);
  });

  it("rejects an anchor inside a blocking collider", () => {
    const anchors = FLOODED_MARKET_MISSION.insertionAnchors.map((anchor) =>
      anchor.id === "south-center" ? { ...anchor, position: { x: 4.6, y: 0.93, z: -1.2 } } : anchor,
    );
    expect(() => createInsertionPlan(manifest, "stable", "bad", { ...context(), anchors })).toThrow(InvalidInsertionPlanError);
    try {
      createInsertionPlan(manifest, "stable", "bad", { ...context(), anchors });
    } catch (error) {
      expect((error as InvalidInsertionPlanError).violations.map((violation) => violation.code)).toContain("ANCHOR_INSIDE_COLLIDER");
    }
  });

  it("rejects authored anchors that cannot reach extraction", () => {
    const navigation = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
    for (const edge of ["west-office", "office-cooling", "east-loading", "loading-cooling"]) {
      navigation.setEdgeEnabled(edge, false);
    }
    try {
      createInsertionPlan(manifest, "scattered", "cut-off", context(navigation));
      throw new Error("Expected unreachable insertion to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidInsertionPlanError);
      expect((error as InvalidInsertionPlanError).violations.map((violation) => violation.code)).toContain("ANCHOR_UNREACHABLE");
    }
  });
});

function pairDistances(points: readonly { x: number; y: number; z: number }[]): number[] {
  const result: number[] = [];
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const a = points[left];
      const b = points[right];
      if (a && b) result.push(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
  }
  return result;
}

function minimumPairDistance(points: readonly { x: number; y: number; z: number }[]): number {
  return Math.min(...pairDistances(points));
}

function maximumPairDistance(points: readonly { x: number; y: number; z: number }[]): number {
  return Math.max(...pairDistances(points));
}
