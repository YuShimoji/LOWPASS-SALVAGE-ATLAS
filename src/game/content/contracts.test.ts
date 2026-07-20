import { describe, expect, it } from "vitest";
import { ITEM_DEFINITIONS } from "../items/itemDefinitions";
import { CREW_CAPACITY_UNITS, GATE_CAPACITY_UNITS } from "../mission/missionTypes";
import { CREW_DEFINITIONS } from "../squad/squadTypes";

describe("vertical-slice content contracts", () => {
  it("keeps gate and crew capacity values explicit", () => {
    expect(GATE_CAPACITY_UNITS).toBe(28);
    expect(CREW_CAPACITY_UNITS).toBe(5);
    expect(CREW_DEFINITIONS).toHaveLength(3);
    expect(CREW_DEFINITIONS.every((crew) => crew.gateCapacityUnits === 5)).toBe(true);
  });

  it("keeps individual gate loads explicit on the two demonstrator objects", () => {
    expect(ITEM_DEFINITIONS["advanced-terminal"].logicLoad).toBe(6);
    expect(ITEM_DEFINITIONS["shopping-cart"].volumeLoad).toBe(8);
  });

  it("keeps fixed mission definitions behind a lazy import boundary", () => {
    const fixedMissionModules = import.meta.glob("../mission/fixed/*.ts");
    expect(typeof fixedMissionModules["../mission/fixed/floodedMarket.ts"]).toBe("function");
  });
});
