import {
  Material,
  Mesh,
  Object3D,
  Texture,
  type Group,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  LOWPASS_CANARY_ASSET_PACK,
  validateCanaryRegistry,
  type AssetDistributionContext,
  type CanaryAssetPackRegistryEntry,
  type CanaryAssetRole,
} from "../../game/content/AssetPackRegistry";

export interface CanaryRoleInstance {
  readonly role: CanaryAssetRole;
  readonly root: Object3D;
  readonly bindings: Readonly<Record<string, Object3D>>;
}

export interface LoadedCanaryMissionAssetPack {
  readonly mode: "canary-v1";
  readonly registry: CanaryAssetPackRegistryEntry;
  readonly loadDurationMs: number;
  readonly glbBytes: number;
  readonly resolvedBindingIds: readonly string[];
  createInstance(role: CanaryAssetRole): CanaryRoleInstance;
  dispose(): void;
}

export async function loadCanaryMissionAssetPack(
  registry: CanaryAssetPackRegistryEntry = LOWPASS_CANARY_ASSET_PACK,
  options: { readonly distributionContext?: AssetDistributionContext } = {},
): Promise<LoadedCanaryMissionAssetPack> {
  const startedAt = performance.now();
  const failures = validateCanaryRegistry(registry, options);
  if (failures.length > 0) throw new Error(`CANARY_REGISTRY_INVALID // ${failures.join(",")}`);
  const manifestUrl = new URL(registry.manifestPath, document.baseURI).href;
  const manifestResponse = await fetch(manifestUrl, { credentials: "same-origin" });
  if (!manifestResponse.ok) throw new Error(`CANARY_MANIFEST_HTTP_${manifestResponse.status}`);
  const manifest = await manifestResponse.json() as { readonly rights?: unknown };
  const manifestFailures = validateCanaryRegistry(registry, {
    ...options,
    manifestRights: manifest.rights,
  });
  if (manifestFailures.length > 0) {
    throw new Error(`CANARY_MANIFEST_RIGHTS_INVALID // ${manifestFailures.join(",")}`);
  }
  const url = new URL(registry.glbPath, document.baseURI).href;
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`CANARY_GLB_HTTP_${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = await sha256Hex(bytes);
  if (hash !== registry.exactGlbSha256) {
    throw new Error(`CANARY_GLB_SHA256_MISMATCH // expected ${registry.exactGlbSha256}, actual ${hash}`);
  }
  return parseCanaryMissionAssetPack(bytes, performance.now() - startedAt, registry);
}

export async function parseCanaryMissionAssetPack(
  bytes: ArrayBuffer,
  loadDurationMs = 0,
  registry: CanaryAssetPackRegistryEntry = LOWPASS_CANARY_ASSET_PACK,
): Promise<LoadedCanaryMissionAssetPack> {
  const failures = validateCanaryRegistry(registry);
  if (failures.length > 0) throw new Error(`CANARY_REGISTRY_INVALID // ${failures.join(",")}`);
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  return createLoadedPack(gltf.scene, bytes.byteLength, loadDurationMs, registry);
}

export function resolveCanaryRoleBindings(
  scene: Object3D,
  registry: CanaryAssetPackRegistryEntry = LOWPASS_CANARY_ASSET_PACK,
): {
  readonly roots: Readonly<Record<CanaryAssetRole, Object3D>>;
  readonly bindings: Readonly<Record<string, Object3D>>;
  readonly missing: readonly string[];
} {
  const roots = {} as Record<CanaryAssetRole, Object3D>;
  const bindings: Record<string, Object3D> = {};
  const missing: string[] = [];
  for (const [role, definition] of Object.entries(registry.assetDefinitions) as [CanaryAssetRole, CanaryAssetPackRegistryEntry["assetDefinitions"][CanaryAssetRole]][]) {
    const root = scene.getObjectByName(definition.rootNodeId);
    if (root) roots[role] = root;
    else missing.push(definition.rootNodeId);
  }
  for (const [semanticId, nodeId] of Object.entries(registry.anchorMap)) {
    const node = scene.getObjectByName(nodeId);
    if (node) bindings[semanticId] = node;
    else missing.push(nodeId);
  }
  return { roots, bindings, missing: [...new Set(missing)].sort() };
}

function createLoadedPack(
  sourceScene: Group,
  glbBytes: number,
  loadDurationMs: number,
  registry: CanaryAssetPackRegistryEntry,
): LoadedCanaryMissionAssetPack {
  const resolved = resolveCanaryRoleBindings(sourceScene, registry);
  if (resolved.missing.length > 0) throw new Error(`CANARY_NODE_BINDING_MISSING // ${resolved.missing.join(",")}`);
  const instances = new Set<Object3D>();
  const clonedMaterials = new Set<Material>();
  let disposed = false;
  return {
    mode: "canary-v1",
    registry,
    loadDurationMs,
    glbBytes,
    resolvedBindingIds: Object.keys(resolved.bindings).sort(),
    createInstance(role): CanaryRoleInstance {
      if (disposed) throw new Error("CANARY_ASSET_PACK_DISPOSED");
      const sourceRoot = resolved.roots[role];
      if (!sourceRoot) throw new Error(`CANARY_ROLE_ROOT_MISSING:${role}`);
      const root = sourceRoot.clone(true);
      root.name = `lowpass-canary-${role}`;
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        if (Array.isArray(object.material)) {
          object.material = object.material.map((material) => {
            const clone = material.clone();
            clonedMaterials.add(clone);
            return clone;
          });
        } else {
          object.material = object.material.clone();
          clonedMaterials.add(object.material);
        }
        object.castShadow = true;
        object.receiveShadow = true;
      });
      const bindings: Record<string, Object3D> = {};
      for (const [semanticId, nodeId] of Object.entries(registry.anchorMap)) {
        const node = root.getObjectByName(nodeId);
        if (node) bindings[semanticId] = node;
      }
      instances.add(root);
      return { role, root, bindings };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const instance of instances) instance.removeFromParent();
      instances.clear();
      for (const material of clonedMaterials) {
        disposeMaterialTextures(material);
        material.dispose();
      }
      clonedMaterials.clear();
      const sourceGeometries = new Set<NonNullable<Mesh["geometry"]>>();
      const sourceMaterials = new Set<Material>();
      sourceScene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        sourceGeometries.add(object.geometry);
        if (Array.isArray(object.material)) object.material.forEach((material) => sourceMaterials.add(material));
        else sourceMaterials.add(object.material);
      });
      sourceGeometries.forEach((geometry) => geometry.dispose());
      sourceMaterials.forEach((material) => {
        disposeMaterialTextures(material);
        material.dispose();
      });
      sourceScene.clear();
    },
  };
}

function disposeMaterialTextures(material: Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) value.dispose();
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
