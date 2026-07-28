import { describe, expect, it } from "vitest";
import {
  AssetPackRegistry,
  CANARY_PACK_ID,
  validateCanaryManifest,
} from "./AssetPackRegistry";

const requiredAssets = [
  ["lowpass:security/needle-drone", "scan-node"],
  ["lowpass:security/watcher-drone", "watcher-node"],
  ["lowpass:machines/porter-android", "carry-node"],
  ["lowpass:props/shopping-cart", "handle-node"],
  ["lowpass:equipment/field-terminal", "terminal-node"],
] as const;

function manifest() {
  const stableIds = requiredAssets.flatMap(([, rootNodeId]) => [
    rootNodeId,
    `${rootNodeId}-visual`,
    `${rootNodeId}-collision`,
    `${rootNodeId}-anchor`,
  ]);
  return {
    schemaVersion: "lowpass-runtime-asset-pack-1.0.0",
    assetPackId: CANARY_PACK_ID,
    stableNodeMap: stableIds.map((stableId) => ({ stableId })),
    assets: requiredAssets.map(([assetKey, rootNodeId]) => ({
      assetKey,
      rootNodeId,
      visualNodeIds: [`${rootNodeId}-visual`],
      collisionProxyIds: [`${rootNodeId}-collision`],
      anchors: [{ id: `${rootNodeId}-socket`, kind: "interaction", nodeId: `${rootNodeId}-anchor` }],
    })),
  };
}

describe("AssetPackRegistry", () => {
  it("accepts the exact five-role semantic manifest when every GLB node resolves", () => {
    const candidate = manifest();
    const loadedNodes = new Set(candidate.stableNodeMap.map((entry) => entry.stableId));
    expect(validateCanaryManifest(candidate, loadedNodes)).toEqual({ ok: true, failures: [] });
  });

  it("fails closed when a semantic reference is absent from the loaded GLB", () => {
    const candidate = manifest();
    const loadedNodes = new Set(candidate.stableNodeMap.map((entry) => entry.stableId));
    loadedNodes.delete("handle-node-anchor");
    expect(validateCanaryManifest(candidate, loadedNodes)).toMatchObject({
      ok: false,
      failures: expect.arrayContaining(["GLB_NODE_MISSING:lowpass:props/shopping-cart"]),
    });
  });

  it("uses a structured primitive fallback for an unknown query mode", async () => {
    const registry = new AssetPackRegistry("future-pack");
    const selection = await registry.loadMissionPack();
    expect(selection.pack).toBeNull();
    expect(selection.readback).toMatchObject({
      requestedMode: "future-pack",
      activeMode: "primitive",
      status: "FALLBACK_TO_PRIMITIVE",
      fallbackReason: "UNKNOWN_ASSET_MODE:future-pack",
    });
  });
});
