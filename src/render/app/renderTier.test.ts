import { describe, expect, it } from "vitest";
import { chooseRenderTier } from "./renderTier";

describe("render tier", () => {
  it("reduces presentation cost on software rasterizers", () => {
    expect(chooseRenderTier("ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11)", null)).toBe("reduced");
    expect(chooseRenderTier("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))", null)).toBe("reduced");
    expect(chooseRenderTier("llvmpipe (LLVM 15.0.7, 256 bits)", null)).toBe("reduced");
  });

  it("keeps the full tier on hardware GPUs", () => {
    expect(chooseRenderTier("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)", null)).toBe("full");
  });

  it("honors an explicit ?render= request", () => {
    expect(chooseRenderTier("Microsoft Basic Render Driver", "full")).toBe("full");
    expect(chooseRenderTier("NVIDIA GeForce", "reduced")).toBe("reduced");
    expect(chooseRenderTier("NVIDIA GeForce", "bogus")).toBe("full");
  });
});
