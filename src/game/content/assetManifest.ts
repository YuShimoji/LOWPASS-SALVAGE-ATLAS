export type AssetFormat = "glb" | "gltf";

export interface ModelAssetDefinition {
  key: string;
  url: string;
  format: AssetFormat;
  role: "character" | "environment" | "prop";
  collisionProxy: "embedded" | "primitive" | "none";
}

// Phase A uses primitives. These stable keys reserve the GLB/glTF shipping boundary.
export const MODEL_ASSET_MANIFEST: readonly ModelAssetDefinition[] = [
  {
    key: "character.crew.base",
    url: "assets/models/crew-base.glb",
    format: "glb",
    role: "character",
    collisionProxy: "primitive",
  },
  {
    key: "environment.ship.interior",
    url: "assets/models/ship-interior.glb",
    format: "glb",
    role: "environment",
    collisionProxy: "embedded",
  },
  {
    key: "environment.market.flooded",
    url: "assets/models/flooded-market.glb",
    format: "glb",
    role: "environment",
    collisionProxy: "embedded",
  },
] as const;
