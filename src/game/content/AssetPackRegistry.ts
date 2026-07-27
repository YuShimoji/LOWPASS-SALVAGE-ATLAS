import canaryRegistryJson from "./generated/lowpassCanaryRegistry.json";

export type AssetPackMode = "primitive" | "canary-v1";
export type CanaryAssetRole =
  | "hostile-needle"
  | "hostile-watcher"
  | "allied-porter"
  | "push-cart"
  | "field-terminal";

export interface AssetDefinitionRegistryEntry {
  readonly assetId: string;
  readonly assetKey: string;
  readonly role: CanaryAssetRole;
  readonly rootNodeId: string;
  readonly forwardAxis: "-Z";
  readonly visualNodeIds: readonly string[];
  readonly anchorIds: readonly string[];
  readonly featureIds: readonly string[];
  readonly collisionProxyIds: readonly string[];
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export interface CanaryAssetPackRegistryEntry {
  readonly schemaVersion: "lowpass-asset-pack-registry-1.0.0";
  readonly assetPackId: "lowpass-canary-v1";
  readonly displayName: string;
  readonly manifestVersion: "lowpass-runtime-asset-pack-1.0.0";
  readonly exactGlbSha256: string;
  readonly rightsStatus: "NOASSERTION";
  readonly internalOnly: true;
  readonly distributionApproved: false;
  readonly reviewLabel: "INTERNAL REVIEW ONLY";
  readonly glbPath: string;
  readonly manifestPath: string;
  readonly stableNodeMap: Readonly<Record<string, string>>;
  readonly materialMap: Readonly<Record<string, string>>;
  readonly anchorMap: Readonly<Record<string, string>>;
  readonly collisionProxyMap: Readonly<Record<CanaryAssetRole, string>>;
  readonly assetDefinitions: Readonly<Record<CanaryAssetRole, AssetDefinitionRegistryEntry>>;
  readonly counts: {
    readonly assets: number;
    readonly stableNodes: number;
    readonly meshes: number;
    readonly triangles: number;
    readonly materials: number;
    readonly anchors: number;
    readonly collisionProxies: number;
  };
}

export interface AssetPackSelection {
  readonly requestedMode: AssetPackMode;
  readonly activeMode: AssetPackMode;
  readonly fallbackReason: string | null;
  readonly canary: CanaryAssetPackRegistryEntry | null;
}

export const LOWPASS_CANARY_ASSET_PACK = canaryRegistryJson as unknown as CanaryAssetPackRegistryEntry;

export function resolveAssetPackMode(search: string): AssetPackMode {
  const value = new URLSearchParams(search).get("asset-mode");
  return value === "canary-v1" ? "canary-v1" : "primitive";
}

export function primitiveAssetPackSelection(requestedMode: AssetPackMode, fallbackReason: string | null = null): AssetPackSelection {
  return {
    requestedMode,
    activeMode: "primitive",
    fallbackReason,
    canary: null,
  };
}

export function validateCanaryRegistry(
  registry: CanaryAssetPackRegistryEntry = LOWPASS_CANARY_ASSET_PACK,
): readonly string[] {
  const failures: string[] = [];
  if (registry.schemaVersion !== "lowpass-asset-pack-registry-1.0.0") failures.push("REGISTRY_SCHEMA_UNSUPPORTED");
  if (registry.manifestVersion !== "lowpass-runtime-asset-pack-1.0.0") failures.push("MANIFEST_SCHEMA_UNSUPPORTED");
  if (registry.exactGlbSha256 !== "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102") {
    failures.push("GLB_SHA256_UNEXPECTED");
  }
  if (!registry.internalOnly || registry.distributionApproved || registry.rightsStatus !== "NOASSERTION") {
    failures.push("RIGHTS_BOUNDARY_INVALID");
  }
  const roles: readonly CanaryAssetRole[] = [
    "hostile-needle",
    "hostile-watcher",
    "allied-porter",
    "push-cart",
    "field-terminal",
  ];
  for (const role of roles) {
    const asset = registry.assetDefinitions[role];
    if (!asset) failures.push(`ASSET_ROLE_MISSING:${role}`);
    else if (!registry.stableNodeMap[asset.rootNodeId]) failures.push(`ROOT_NODE_MISSING:${role}`);
    if (!registry.collisionProxyMap[role]) failures.push(`COLLISION_PROXY_MISSING:${role}`);
  }
  for (const required of [
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
  ]) {
    if (!registry.anchorMap[required]) failures.push(`SEMANTIC_BINDING_MISSING:${required}`);
  }
  if (/^(?:[A-Za-z]:\\|file:\/\/|\/Users\/|\/home\/)/i.test(registry.glbPath)) failures.push("ABSOLUTE_GLB_PATH");
  return failures;
}
