import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { ModelAssetDefinition } from "../../game/content/assetManifest";

const loader = new GLTFLoader();

export function loadGltfAsset(asset: ModelAssetDefinition): Promise<GLTF> {
  if (asset.format !== "glb" && asset.format !== "gltf") {
    return Promise.reject(new Error(`Unsupported model format for ${asset.key}`));
  }
  return loader.loadAsync(asset.url);
}
