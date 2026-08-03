import { describe, expect, it } from "vitest";
import {
  LOWPASS_CANARY_ASSET_PACK,
  primitiveAssetPackSelection,
  resolveAssetPackMode,
  validateCanaryRegistry,
} from "./AssetPackRegistry";

describe("AssetPackRegistry", () => {
  it("keeps primitive as default and selects canary only by explicit query", () => {
    expect(resolveAssetPackMode("")).toBe("primitive");
    expect(resolveAssetPackMode("?asset-mode=primitive")).toBe("primitive");
    expect(resolveAssetPackMode("?qa=1&asset-mode=canary-v1")).toBe("canary-v1");
  });

  it("pins five semantic roles, the exact hash, project-scoped production rights, and relative paths", () => {
    expect(validateCanaryRegistry()).toEqual([]);
    expect(Object.keys(LOWPASS_CANARY_ASSET_PACK.assetDefinitions).sort()).toEqual([
      "allied-porter",
      "field-terminal",
      "hostile-needle",
      "hostile-watcher",
      "push-cart",
    ]);
    expect(LOWPASS_CANARY_ASSET_PACK.exactGlbSha256).toBe(
      "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102",
    );
    expect(LOWPASS_CANARY_ASSET_PACK).toMatchObject({
      rightsStatus: "DECLARED",
      licenseId: "LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1",
      internalOnly: false,
      distributionApproved: true,
      reviewLabel: "LOWPASS PROJECT USE APPROVED",
      manifestRights: {
        rightsStatus: "DECLARED",
        licenseId: "LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1",
        internalOnly: false,
        distributionApproved: true,
        reviewLabel: "LOWPASS PROJECT USE APPROVED",
      },
    });
    expect(LOWPASS_CANARY_ASSET_PACK.glbPath).not.toMatch(/^[A-Za-z]:|file:\/\//);
  });

  it("falls back to primitive with a structured reason", () => {
    expect(primitiveAssetPackSelection("canary-v1", "GLB_LOAD_FAILED")).toEqual({
      requestedMode: "canary-v1",
      activeMode: "primitive",
      fallbackReason: "GLB_LOAD_FAILED",
      canary: null,
    });
  });

  it("fails closed for missing, contradictory, or mismatched rights and permits LOWPASS distribution", () => {
    const registry = structuredClone(LOWPASS_CANARY_ASSET_PACK) as unknown as Record<string, unknown>;

    const missingInternalOnly = { ...registry };
    delete missingInternalOnly.internalOnly;
    expect(validateCanaryRegistry(missingInternalOnly)).toContain("RIGHTS_INTERNAL_ONLY_MISSING_OR_INVALID");

    expect(validateCanaryRegistry({
      ...registry,
      rightsStatus: "NOASSERTION",
    })).toContain("RIGHTS_DECLARED_DISTRIBUTION_REQUIRED");

    expect(validateCanaryRegistry(registry, {
      manifestRights: {
        rightsStatus: "DECLARED",
        licenseId: "LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1",
        internalOnly: false,
        distributionApproved: false,
        reviewLabel: "LOWPASS PROJECT USE APPROVED",
      },
    })).toContain("RIGHTS_REGISTRY_MANIFEST_MISMATCH");

    expect(validateCanaryRegistry(registry, {
      distributionContext: "external-distribution",
    })).toEqual([]);

    expect(validateCanaryRegistry({
      ...registry,
      internalOnly: true,
    }, {
      distributionContext: "external-distribution",
    })).toContain("RIGHTS_EXTERNAL_DISTRIBUTION_BLOCKED");
  });
});
