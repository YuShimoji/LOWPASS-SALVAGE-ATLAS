import { ITEM_DEFINITIONS } from "../items/itemDefinitions";
import type { MissionDefinition } from "./missionTypes";

export const VERTICAL_SLICE_MISSION = {
  id: "flooded-market-01",
  label: "濁流の生活圏",
  destinationId: "flooded-suburban-supermarket",
  spawnMode: "distributed-three-person",
  objectives: [
    {
      resourceId: "sealed-water-filter",
      label: "未開封の浄水フィルター",
      requiredQuantity: 3,
      unitMass: 12,
      recoveredQuantity: 0,
    },
  ],
  availableEquipment: [
    ITEM_DEFINITIONS.radio.id,
    ITEM_DEFINITIONS["flare-pack"].id,
    ITEM_DEFINITIONS.crowbar.id,
    ITEM_DEFINITIONS["medical-kit"].id,
    ITEM_DEFINITIONS["bolt-cutter"].id,
    ITEM_DEFINITIONS["portable-relay"].id,
    ITEM_DEFINITIONS["field-terminal"].id,
  ],
} as const satisfies MissionDefinition;
