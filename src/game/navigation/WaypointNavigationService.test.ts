import { describe, expect, it } from "vitest";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { WaypointNavigationService } from "./WaypointNavigationService";

describe("WaypointNavigationService", () => {
  it("finds deterministic A* paths and projects positions", () => {
    const service = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
    const first = service.findPath(FLOODED_MARKET_MISSION.extractionPoint, { x: 0, y: 0.93, z: -6.15 });
    const second = service.findPath(FLOODED_MARKET_MISSION.extractionPoint, { x: 0, y: 0.93, z: -6.15 });
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(service.projectToNavigablePoint({ x: 0.2, y: 0.93, z: 4.7 })?.nodeId).toBe("extract");
  });

  it("enables the authored tool shortcut without changing unrelated edges", () => {
    const service = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
    expect(service.isEdgeEnabled("cooling-shortcut")).toBe(false);
    expect(service.setEdgeEnabled("cooling-shortcut", true)).toBeNull();
    expect(service.isEdgeEnabled("cooling-shortcut")).toBe(true);
    expect(service.setEdgeEnabled("unknown", true)?.code).toBe("UNKNOWN_EDGE");
  });

  it("returns a structured failure when the goal cannot be projected", () => {
    const service = new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation);
    expect(service.findPath({ x: 0, y: 0.93, z: 4.8 }, { x: 100, y: 0.93, z: 100 })).toMatchObject({
      ok: false,
      code: "NO_NAVIGABLE_GOAL",
    });
  });
});
