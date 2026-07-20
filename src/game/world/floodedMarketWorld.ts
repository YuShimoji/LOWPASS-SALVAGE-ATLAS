import type { WorldDefinition } from "./worldTypes";
import { deepFreeze } from "./worldTypes";

export const FLOODED_MARKET_WORLD_INSTANCE_ID = "flooded-market-atlas-01";

export const FLOODED_MARKET_WORLD = deepFreeze({
  id: "flooded-market-world-v1",
  label: "浸水した郊外型スーパーマーケット",
  anchors: [
    { id: "anchor-loading", navigationNodeId: "loading", position: { x: 3.45, y: 0.93, z: -4.65 } },
    { id: "anchor-extraction", navigationNodeId: "extract", position: { x: 0, y: 0.93, z: 4.8 } },
  ],
  traversal: [
    {
      id: "traversal-cooling-door",
      shortcutId: "cooling-gate",
      colliderId: "cooling-shortcut-gate",
      navigationEdgeId: "cooling-shortcut",
      initialState: "closed",
    },
    {
      id: "traversal-loading-chain",
      shortcutId: "loading-chain",
      colliderId: "loading-chain-gate",
      navigationEdgeId: "loading-chain-shortcut",
      initialState: "closed",
    },
  ],
  machines: [{ id: "porter-market-01", safeAnchorId: "anchor-loading" }],
  uniqueItems: [
    { id: "filter-01", sourceId: "filter-01", contractId: "contract-water-filters" },
    { id: "filter-02", sourceId: "filter-02", contractId: "contract-water-filters" },
    { id: "filter-03", sourceId: "filter-03", contractId: "contract-water-filters" },
    { id: "cooling-coil", sourceId: "cooling-coil", contractId: null },
    { id: "relay-core-01", sourceId: "relay-core-01", contractId: "contract-relay-cores" },
    { id: "relay-core-02", sourceId: "relay-core-02", contractId: "contract-relay-cores" },
    { id: "relay-core-03", sourceId: "relay-core-03", contractId: "contract-relay-cores" },
  ],
  evidence: [
    { id: "parking-manifest", sourceId: "parking-manifest", label: "濡れた搬入記録" },
    { id: "office-record", sourceId: "office-record", label: "非常電源ログ" },
    { id: "cooling-diagnostic", sourceId: "cooling-diagnostic", label: "冷却系診断票" },
    { id: "underground-signal", sourceId: "underground-signal", label: "旧式中継器の残響" },
  ],
  contracts: [
    {
      id: "contract-water-filters",
      label: "浄水フィルター回収",
      objectiveIds: ["filter-01", "filter-02", "filter-03"],
      unlockAfterContractId: null,
      rewardLabel: "居住区浄水備蓄",
    },
    {
      id: "contract-relay-cores",
      label: "旧式リレーコア回収",
      objectiveIds: ["relay-core-01", "relay-core-02", "relay-core-03"],
      unlockAfterContractId: "contract-water-filters",
      rewardLabel: "船内通信予備部品",
    },
  ],
} as const satisfies WorldDefinition);
