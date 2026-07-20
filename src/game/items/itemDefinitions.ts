export type ItemDefinitionId =
  | "flare-pack"
  | "crowbar"
  | "radio"
  | "medical-kit"
  | "bolt-cutter"
  | "portable-relay"
  | "field-terminal"
  | "advanced-terminal"
  | "shopping-cart";

export type ItemInstanceId = string;

export interface ItemDefinition {
  readonly id: ItemDefinitionId;
  readonly label: string;
  readonly capacityUnits: number;
  readonly volumeLoad: number;
  readonly logicLoad: number;
  readonly category: "consumable" | "tool" | "communications" | "medical" | "computing" | "transport";
  readonly expeditionEligible: boolean;
}

export interface ItemInstance {
  readonly id: ItemInstanceId;
  readonly definitionId: ItemDefinitionId;
  readonly condition: "serviceable" | "worn" | "damaged";
}

export const ITEM_DEFINITIONS = {
  "flare-pack": {
    id: "flare-pack",
    label: "フレアパック",
    capacityUnits: 1,
    volumeLoad: 1,
    logicLoad: 0,
    category: "consumable",
    expeditionEligible: true,
  },
  crowbar: {
    id: "crowbar",
    label: "バール",
    capacityUnits: 1,
    volumeLoad: 2,
    logicLoad: 0,
    category: "tool",
    expeditionEligible: true,
  },
  radio: {
    id: "radio",
    label: "無線機",
    capacityUnits: 2,
    volumeLoad: 1,
    logicLoad: 2,
    category: "communications",
    expeditionEligible: true,
  },
  "medical-kit": {
    id: "medical-kit",
    label: "医療キット",
    capacityUnits: 2,
    volumeLoad: 2,
    logicLoad: 0,
    category: "medical",
    expeditionEligible: true,
  },
  "bolt-cutter": {
    id: "bolt-cutter",
    label: "ボルトカッター",
    capacityUnits: 3,
    volumeLoad: 3,
    logicLoad: 0,
    category: "tool",
    expeditionEligible: true,
  },
  "portable-relay": {
    id: "portable-relay",
    label: "携帯リレー",
    capacityUnits: 3,
    volumeLoad: 2,
    logicLoad: 3,
    category: "communications",
    expeditionEligible: true,
  },
  "field-terminal": {
    id: "field-terminal",
    label: "簡易フィールド端末",
    capacityUnits: 4,
    volumeLoad: 2,
    logicLoad: 3,
    category: "computing",
    expeditionEligible: true,
  },
  "advanced-terminal": {
    id: "advanced-terminal",
    label: "高性能端末",
    capacityUnits: 6,
    volumeLoad: 2,
    logicLoad: 6,
    category: "computing",
    expeditionEligible: false,
  },
  "shopping-cart": {
    id: "shopping-cart",
    label: "ショッピングカート",
    capacityUnits: 8,
    volumeLoad: 8,
    logicLoad: 0,
    category: "transport",
    expeditionEligible: false,
  },
} as const satisfies Record<ItemDefinitionId, ItemDefinition>;

export const SHIP_INVENTORY: readonly ItemInstance[] = [
  { id: "flare-01", definitionId: "flare-pack", condition: "serviceable" },
  { id: "flare-02", definitionId: "flare-pack", condition: "serviceable" },
  { id: "crowbar-01", definitionId: "crowbar", condition: "worn" },
  { id: "radio-01", definitionId: "radio", condition: "serviceable" },
  { id: "radio-02", definitionId: "radio", condition: "serviceable" },
  { id: "medkit-01", definitionId: "medical-kit", condition: "serviceable" },
  { id: "medkit-02", definitionId: "medical-kit", condition: "serviceable" },
  { id: "cutter-01", definitionId: "bolt-cutter", condition: "worn" },
  { id: "relay-01", definitionId: "portable-relay", condition: "serviceable" },
  { id: "terminal-01", definitionId: "field-terminal", condition: "serviceable" },
] as const;

export const GATE_DEMONSTRATOR_ITEMS: readonly ItemInstance[] = [
  {
    id: "scan-field-terminal",
    definitionId: "field-terminal",
    condition: "serviceable",
  },
  {
    id: "scan-advanced-terminal",
    definitionId: "advanced-terminal",
    condition: "serviceable",
  },
  {
    id: "scan-shopping-cart",
    definitionId: "shopping-cart",
    condition: "worn",
  },
] as const;

export function createInitialItemLocations(): import("./itemLocation").ItemLocationLedger {
  return Object.fromEntries([
    ...SHIP_INVENTORY.map((item) => [item.id, { kind: "ship-inventory" } as const]),
    ...GATE_DEMONSTRATOR_ITEMS.map((item) => [item.id, { kind: "gate-demonstrator" } as const]),
  ]);
}
