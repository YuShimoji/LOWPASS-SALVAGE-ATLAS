import {
  Material,
  Mesh,
  Object3D,
  type BufferGeometry,
  type Group,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeObjectTree } from "../objects/disposeObjectTree";

export type AssetMode = "primitive" | "canary-v1";

export const CANARY_PACK_ID = "lowpass-readability-canary-v1";
export const CANARY_SOURCE_COMMIT = "c893374ab0edd7329bd1482dbd6b99960acbbb68";
export const CANARY_GLB_SHA256 = "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102";

export type CanaryAssetKey =
  | "lowpass:security/needle-drone"
  | "lowpass:security/watcher-drone"
  | "lowpass:machines/porter-android"
  | "lowpass:props/shopping-cart"
  | "lowpass:equipment/field-terminal";

interface CanaryAnchorDefinition {
  readonly id: string;
  readonly kind: string;
  readonly nodeId: string;
}

interface CanaryAssetDefinition {
  readonly assetKey: CanaryAssetKey;
  readonly rootNodeId: string;
  readonly visualNodeIds: readonly string[];
  readonly collisionProxyIds: readonly string[];
  readonly anchors: readonly CanaryAnchorDefinition[];
}

interface CanaryManifest {
  readonly schemaVersion: string;
  readonly assetPackId: string;
  readonly assets: readonly CanaryAssetDefinition[];
  readonly stableNodeMap: readonly { readonly stableId: string }[];
}

export interface CanaryAssetInstance {
  readonly root: Group;
  readonly anchors: ReadonlyMap<string, Object3D>;
}

export interface AssetPackReadback {
  readonly requestedMode: string;
  readonly activeMode: AssetMode;
  readonly status: "PRIMITIVE_SELECTED" | "CANARY_LOADED" | "FALLBACK_TO_PRIMITIVE";
  readonly fallbackReason: string | null;
  readonly sourceCommit: string | null;
  readonly assetPackId: string | null;
  readonly glbSha256: string | null;
  readonly loadDurationMs: number;
}

export class LoadedCanaryAssetPack {
  constructor(
    private readonly scene: Group,
    private readonly definitions: ReadonlyMap<CanaryAssetKey, CanaryAssetDefinition>,
  ) {}

  instantiate(assetKey: CanaryAssetKey): CanaryAssetInstance {
    const definition = this.definitions.get(assetKey);
    if (!definition) throw new Error(`CANARY_ASSET_KEY_MISSING: ${assetKey}`);
    const source = this.scene.getObjectByName(definition.rootNodeId);
    if (!source) throw new Error(`CANARY_ROOT_NODE_MISSING: ${definition.rootNodeId}`);
    const root = cloneWithOwnedRenderResources(source) as Group;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);
    const visualNodes = new Set(definition.visualNodeIds);
    const semanticNodes = new Set([
      ...definition.collisionProxyIds,
      ...definition.anchors.map((anchor) => anchor.nodeId),
    ]);
    root.traverse((object) => {
      if (object instanceof Mesh && semanticNodes.has(object.name) && !visualNodes.has(object.name)) {
        object.visible = false;
      }
    });
    const anchors = new Map<string, Object3D>();
    for (const anchor of definition.anchors) {
      const node = root.getObjectByName(anchor.nodeId);
      if (!node) throw new Error(`CANARY_ANCHOR_NODE_MISSING: ${anchor.nodeId}`);
      anchors.set(anchor.kind, node);
    }
    return { root, anchors };
  }

  dispose(): void {
    disposeObjectTree(this.scene);
  }
}

export interface AssetPackSelection {
  readonly pack: LoadedCanaryAssetPack | null;
  readonly readback: AssetPackReadback;
}

export class AssetPackRegistry {
  private readback: AssetPackReadback;

  constructor(private readonly requestedMode: string | null) {
    this.readback = primitiveReadback(requestedMode ?? "primitive", "PRIMITIVE_SELECTED", null);
  }

  async loadMissionPack(): Promise<AssetPackSelection> {
    const requestedMode = this.requestedMode ?? "primitive";
    if (requestedMode !== "canary-v1") {
      const reason = requestedMode === "primitive" ? null : `UNKNOWN_ASSET_MODE:${requestedMode}`;
      this.readback = primitiveReadback(
        requestedMode,
        reason ? "FALLBACK_TO_PRIMITIVE" : "PRIMITIVE_SELECTED",
        reason,
      );
      return { pack: null, readback: this.readback };
    }

    const startedAt = performance.now();
    try {
      const baseUrl = "/assets/canary-v1";
      const [manifestResponse, glbResponse] = await Promise.all([
        fetch(`${baseUrl}/${CANARY_PACK_ID}.manifest.json`),
        fetch(`${baseUrl}/${CANARY_PACK_ID}.runtime.glb`),
      ]);
      if (!manifestResponse.ok) throw new Error(`MANIFEST_HTTP_${manifestResponse.status}`);
      if (!glbResponse.ok) throw new Error(`GLB_HTTP_${glbResponse.status}`);
      const manifest = await manifestResponse.json() as CanaryManifest;
      const glb = await glbResponse.arrayBuffer();
      const sha256 = await sha256Hex(glb);
      if (sha256 !== CANARY_GLB_SHA256) throw new Error(`GLB_SHA256_MISMATCH:${sha256}`);
      const loader = new GLTFLoader();
      const parsed = await loader.parseAsync(glb, `${baseUrl}/`);
      const validation = validateCanaryManifest(manifest, new Set(
        parsed.scene.children.flatMap((child) => collectNodeNames(child)),
      ));
      if (!validation.ok) throw new Error(validation.failures.join(","));
      const definitions = new Map(
        manifest.assets.map((asset) => [asset.assetKey, asset]),
      );
      const pack = new LoadedCanaryAssetPack(parsed.scene, definitions);
      this.readback = {
        requestedMode,
        activeMode: "canary-v1",
        status: "CANARY_LOADED",
        fallbackReason: null,
        sourceCommit: CANARY_SOURCE_COMMIT,
        assetPackId: CANARY_PACK_ID,
        glbSha256: `sha256:${sha256}`,
        loadDurationMs: performance.now() - startedAt,
      };
      return { pack, readback: this.readback };
    } catch (error) {
      this.readback = {
        ...primitiveReadback(
          requestedMode,
          "FALLBACK_TO_PRIMITIVE",
          error instanceof Error ? error.message : String(error),
        ),
        loadDurationMs: performance.now() - startedAt,
      };
      console.warn("CANARY_ASSET_FALLBACK", this.readback);
      return { pack: null, readback: this.readback };
    }
  }

  getReadback(): AssetPackReadback {
    return { ...this.readback };
  }
}

export function validateCanaryManifest(
  manifest: CanaryManifest,
  loadedNodeNames?: ReadonlySet<string>,
): { readonly ok: boolean; readonly failures: readonly string[] } {
  const failures: string[] = [];
  const requiredKeys: readonly CanaryAssetKey[] = [
    "lowpass:security/needle-drone",
    "lowpass:security/watcher-drone",
    "lowpass:machines/porter-android",
    "lowpass:props/shopping-cart",
    "lowpass:equipment/field-terminal",
  ];
  const stableNodes = new Set(manifest.stableNodeMap?.map((entry) => entry.stableId) ?? []);
  if (manifest.schemaVersion !== "lowpass-runtime-asset-pack-1.0.0") failures.push("SCHEMA_VERSION_MISMATCH");
  if (manifest.assetPackId !== CANARY_PACK_ID) failures.push("ASSET_PACK_ID_MISMATCH");
  if (manifest.assets?.length !== 5) failures.push("ASSET_COUNT_MISMATCH");
  if (!requiredKeys.every((key) => manifest.assets?.some((asset) => asset.assetKey === key))) {
    failures.push("REQUIRED_ASSET_KEY_MISSING");
  }
  for (const asset of manifest.assets ?? []) {
    const references = [
      asset.rootNodeId,
      ...asset.visualNodeIds,
      ...asset.collisionProxyIds,
      ...asset.anchors.map((anchor) => anchor.nodeId),
    ];
    if (!references.every((nodeId) => stableNodes.has(nodeId))) failures.push(`UNSTABLE_REFERENCE:${asset.assetKey}`);
    if (loadedNodeNames && !references.every((nodeId) => loadedNodeNames.has(nodeId))) {
      failures.push(`GLB_NODE_MISSING:${asset.assetKey}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

async function sha256Hex(contents: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", contents);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function primitiveReadback(
  requestedMode: string,
  status: AssetPackReadback["status"],
  fallbackReason: string | null,
): AssetPackReadback {
  return {
    requestedMode,
    activeMode: "primitive",
    status,
    fallbackReason,
    sourceCommit: null,
    assetPackId: null,
    glbSha256: null,
    loadDurationMs: 0,
  };
}

function collectNodeNames(root: Object3D): string[] {
  const names: string[] = [];
  root.traverse((object) => {
    if (object.name) names.push(object.name);
  });
  return names;
}

function cloneWithOwnedRenderResources(source: Object3D): Object3D {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry = (object.geometry as BufferGeometry).clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : (object.material as Material).clone();
  });
  return clone;
}
