import { describe, expect, it } from "vitest";
import { SHIP_INTERACTIONS } from "../content/shipLayout";
import { findNearestInteraction } from "./GameSimulation";

describe("findNearestInteraction", () => {
  it("selects a nearby game-defined interaction without scene dependencies", () => {
    const target = findNearestInteraction({ x: 2.1, y: 0.9, z: -7.8 }, SHIP_INTERACTIONS);
    expect(target?.id).toBe("scan-shopping-cart");
  });

  it("returns null outside interaction range", () => {
    expect(findNearestInteraction({ x: 0, y: 1, z: 2 }, SHIP_INTERACTIONS)).toBeNull();
  });
});
