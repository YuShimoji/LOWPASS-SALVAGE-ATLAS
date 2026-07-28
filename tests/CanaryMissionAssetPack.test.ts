// Node-runtime GLB parse test; intentionally outside the browser-only TypeScript project.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCanaryMissionAssetPack,
  resolveCanaryRoleBindings,
} from "../src/render/assets/CanaryMissionAssetPack";
import { LOWPASS_CANARY_ASSET_PACK } from "../src/game/content/AssetPackRegistry";
import { Group } from "three";

describe("Canary mission asset pack", () => {
  it("parses the imported GLB, resolves five roles and required semantic anchors, then disposes", async () => {
    viProgressEvent();
    const file = readFileSync(resolve("public/assets/lowpass-canary-v1/lowpass-readability-canary-v1.runtime.glb"));
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const pack = await parseCanaryMissionAssetPack(bytes, 12);
    const roles = [
      "hostile-needle",
      "hostile-watcher",
      "allied-porter",
      "push-cart",
      "field-terminal",
    ] as const;
    for (const role of roles) {
      const instance = pack.createInstance(role);
      expect(instance.root.name).toBe(`lowpass-canary-${role}`);
      expect(Object.keys(instance.bindings).length).toBeGreaterThan(0);
    }
    expect(pack.resolvedBindingIds).toEqual(expect.arrayContaining([
      "socket-needle-scan-origin",
      "socket-needle-lock-origin",
      "socket-watcher-scan-origin",
      "feature-watcher-visual-center",
      "socket-porter-interaction",
      "socket-porter-carry",
      "socket-porter-communication",
      "socket-cart-handle",
      "socket-cart-load",
      "socket-terminal-interaction",
      "feature-terminal-screen",
    ]));
    expect(pack.glbBytes).toBe(70_892);
    pack.dispose();
    expect(() => pack.createInstance("hostile-needle")).toThrow("CANARY_ASSET_PACK_DISPOSED");
  });

  it("fails binding resolution when a stable root is absent", () => {
    const result = resolveCanaryRoleBindings(new Group(), LOWPASS_CANARY_ASSET_PACK);
    expect(result.missing).toContain("scene-instance--instance-needle-drone");
    expect(result.missing.length).toBeGreaterThan(5);
  });

  it("loads and disposes the same mission-only pack for three stable lifecycle cycles", async () => {
    viProgressEvent();
    const file = readFileSync(resolve("public/assets/lowpass-canary-v1/lowpass-readability-canary-v1.runtime.glb"));
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const cycleReadbacks: { bytes: number; bindings: number }[] = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const pack = await parseCanaryMissionAssetPack(bytes, cycle + 1);
      for (const role of [
        "hostile-needle",
        "hostile-watcher",
        "allied-porter",
        "push-cart",
        "field-terminal",
      ] as const) {
        expect(pack.createInstance(role).root.parent).toBeNull();
      }
      cycleReadbacks.push({
        bytes: pack.glbBytes,
        bindings: pack.resolvedBindingIds.length,
      });
      pack.dispose();
      expect(() => pack.createInstance("hostile-needle")).toThrow("CANARY_ASSET_PACK_DISPOSED");
    }
    expect(cycleReadbacks).toEqual([
      { bytes: 70_892, bindings: 15 },
      { bytes: 70_892, bindings: 15 },
      { bytes: 70_892, bindings: 15 },
    ]);
  });
});

function viProgressEvent(): void {
  if ("ProgressEvent" in globalThis) return;
  Object.defineProperty(globalThis, "ProgressEvent", {
    configurable: true,
    value: class ProgressEvent extends Event {
      readonly lengthComputable = false;
      readonly loaded = 0;
      readonly total = 0;
    },
  });
}
