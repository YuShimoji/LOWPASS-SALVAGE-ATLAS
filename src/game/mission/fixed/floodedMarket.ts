import type { FixedMissionDefinition } from "../fixedMissionTypes";

export const FLOODED_MARKET_MISSION = Object.freeze({
  id: "flooded-market-01",
  label: "濁流の生活圏",
  destinationLabel: "浸水した郊外型スーパーマーケット",
  playerSpawn: { x: 0, y: 0.93, z: 4.8 },
  extractionPoint: { x: 0, y: 0.7, z: 4.8 },
  extractionRadius: 2.1,
  cart: {
    sourceId: "shopping-cart",
    label: "現地ショッピングカート",
    initialPosition: { x: 2.2, y: 0.48, z: -1.4 },
  },
  salvage: [
    {
      sourceId: "filter-01",
      label: "未開封の浄水フィルター 01",
      resourceType: "water-filter",
      carryMode: "hand",
      required: true,
      position: { x: -2.4, y: 0.32, z: 1.7 },
    },
    {
      sourceId: "filter-02",
      label: "未開封の浄水フィルター 02",
      resourceType: "water-filter",
      carryMode: "hand",
      required: true,
      position: { x: 0, y: 0.32, z: 0.6 },
    },
    {
      sourceId: "filter-03",
      label: "未開封の浄水フィルター 03",
      resourceType: "water-filter",
      carryMode: "hand",
      required: true,
      position: { x: 2.4, y: 0.32, z: 1.7 },
    },
    {
      sourceId: "cooling-coil",
      label: "密閉型冷却コイル",
      resourceType: "cooling-coil",
      carryMode: "cart-only",
      required: true,
      position: { x: 0, y: 0.38, z: -1.7 },
    },
  ],
  colliders: [
    { id: "market-floor", center: { x: 0, y: -0.25, z: 0 }, halfExtents: { x: 7, y: 0.25, z: 7 }, surface: "floor", visible: true },
    { id: "market-north-wall", center: { x: 0, y: 1.8, z: -7 }, halfExtents: { x: 7, y: 1.8, z: 0.25 }, surface: "wall", visible: true },
    { id: "market-south-port", center: { x: -4.5, y: 1.8, z: 7 }, halfExtents: { x: 2.5, y: 1.8, z: 0.25 }, surface: "wall", visible: true },
    { id: "market-south-starboard", center: { x: 4.5, y: 1.8, z: 7 }, halfExtents: { x: 2.5, y: 1.8, z: 0.25 }, surface: "wall", visible: true },
    { id: "market-west-wall", center: { x: -7, y: 1.8, z: 0 }, halfExtents: { x: 0.25, y: 1.8, z: 7 }, surface: "wall", visible: true },
    { id: "market-east-wall", center: { x: 7, y: 1.8, z: 0 }, halfExtents: { x: 0.25, y: 1.8, z: 7 }, surface: "wall", visible: true },
    { id: "shelf-west", center: { x: -4.6, y: 0.8, z: -1.2 }, halfExtents: { x: 0.55, y: 0.8, z: 2.8 }, surface: "fixture", visible: true },
    { id: "shelf-east", center: { x: 4.6, y: 0.8, z: -1.2 }, halfExtents: { x: 0.55, y: 0.8, z: 2.8 }, surface: "fixture", visible: true },
  ],
} satisfies FixedMissionDefinition);
