export type RenderTier = "full" | "reduced";

/**
 * Software rasterizers (SwiftShader, llvmpipe, Microsoft Basic Render) run the lit market at a few
 * frames per second, which also slows the fixed-step simulation. They get the reduced tier unless
 * the page asks for `?render=full` (fixed-framing screenshots) or `?render=reduced`.
 */
export function chooseRenderTier(rendererName: string, requested: string | null): RenderTier {
  if (requested === "full" || requested === "reduced") return requested;
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rendererName) ? "reduced" : "full";
}
