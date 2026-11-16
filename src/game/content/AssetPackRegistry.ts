import canaryRegistryJson from "./generated/lowpassCanaryRegistry.json";

export type AssetPackMode = "primitive" | "canary-v1";
export type AssetDistributionContext = "internal-review" | "external-distribution";
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
  readonly rightsStatus: "DECLARED";
  readonly licenseId: "LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1";
  readonly internalOnly: false;
  readonly distributionApproved: true;
  readonly reviewLabel: "LOWPASS PROJECT USE APPROVED";
  readonly manifestRights: CanaryManifestRights;
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

export interface CanaryManifestRights {
  readonly rightsStatus: "DECLARED";
  readonly licenseId: "LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1";
  readonly internalOnly: false;
  readonly distributionApproved: true;
  readonly reviewLabel: "LOWPASS PROJECT USE APPROVED";
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
  registry: unknown = LOWPASS_CANARY_ASSET_PACK,
  options: {
    readonly distributionContext?: AssetDistributionContext;
    readonly manifestRights?: unknown;
  } = {},
): readonly string[] {
  const failures: string[] = [];
  if (!isRecord(registry)) return ["REGISTRY_MISSING_OR_INVALID"];
  if (registry.schemaVersion !== "lowpass-asset-pack-registry-1.0.0") failures.push("REGISTRY_SCHEMA_UNSUPPORTED");
  if (registry.manifestVersion !== "lowpass-runtime-asset-pack-1.0.0") failures.push("MANIFEST_SCHEMA_UNSUPPORTED");
  if (registry.exactGlbSha256 !== "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102") {
    failures.push("GLB_SHA256_UNEXPECTED");
  }
  if (typeof registry.internalOnly !== "boolean") failures.push("RIGHTS_INTERNAL_ONLY_MISSING_OR_INVALID");
  if (typeof registry.distributionApproved !== "boolean") failures.push("RIGHTS_DISTRIBUTION_APPROVAL_MISSING_OR_INVALID");
  if (typeof registry.rightsStatus !== "string" || registry.rightsStatus.length === 0) {
    failures.push("RIGHTS_STATUS_MISSING_OR_INVALID");
  }
  if (typeof registry.licenseId !== "string" || registry.licenseId.length === 0) {
    failures.push("RIGHTS_LICENSE_ID_MISSING_OR_INVALID");
  }
  if (registry.rightsStatus === "NOASSERTION" && registry.distributionApproved !== false) {
    failures.push("RIGHTS_NOASSERTION_DISTRIBUTION_BLOCK_REQUIRED");
  }
  if (registry.distributionApproved === true && registry.rightsStatus !== "DECLARED") {
    failures.push("RIGHTS_DECLARED_DISTRIBUTION_REQUIRED");
  }
  const distributionContext = options.distributionContext ?? "internal-review";
  if (
    distributionContext === "external-distribution"
    && (registry.internalOnly === true || registry.distributionApproved !== true)
  ) {
    failures.push("RIGHTS_EXTERNAL_DISTRIBUTION_BLOCKED");
  }
  const manifestRights = options.manifestRights ?? registry.manifestRights;
  if (!hasRightsBoundary(manifestRights)) {
    failures.push("MANIFEST_RIGHTS_MISSING_OR_INVALID");
  } else if (
    registry.rightsStatus !== manifestRights.rightsStatus
    || registry.licenseId !== manifestRights.licenseId
    || registry.internalOnly !== manifestRights.internalOnly
    || registry.distributionApproved !== manifestRights.distributionApproved
    || registry.reviewLabel !== manifestRights.reviewLabel
  ) {
    failures.push("RIGHTS_REGISTRY_MANIFEST_MISMATCH");
  }
  if (
    registry.rightsStatus !== "DECLARED"
    || registry.licenseId !== "LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1"
    || registry.internalOnly !== false
    || registry.distributionApproved !== true
    || registry.reviewLabel !== "LOWPASS PROJECT USE APPROVED"
  ) failures.push("RIGHTS_BOUNDARY_INVALID");

  const assetDefinitions = isRecord(registry.assetDefinitions) ? registry.assetDefinitions : {};
  const stableNodeMap = isRecord(registry.stableNodeMap) ? registry.stableNodeMap : {};
  const collisionProxyMap = isRecord(registry.collisionProxyMap) ? registry.collisionProxyMap : {};
  const roles: readonly CanaryAssetRole[] = [
    "hostile-needle",
    "hostile-watcher",
    "allied-porter",
    "push-cart",
    "field-terminal",
  ];
  for (const role of roles) {
    const asset = assetDefinitions[role];
    if (!asset) failures.push(`ASSET_ROLE_MISSING:${role}`);
    else if (!isRecord(asset) || typeof asset.rootNodeId !== "string" || !stableNodeMap[asset.rootNodeId]) {
      failures.push(`ROOT_NODE_MISSING:${role}`);
    }
    if (!collisionProxyMap[role]) failures.push(`COLLISION_PROXY_MISSING:${role}`);
  }
  const anchorMap = isRecord(registry.anchorMap) ? registry.anchorMap : {};
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
    if (!anchorMap[required]) failures.push(`SEMANTIC_BINDING_MISSING:${required}`);
  }
  if (typeof registry.glbPath !== "string") failures.push("GLB_PATH_MISSING");
  else if (/^(?:[A-Za-z]:\\|file:\/\/|\/Users\/|\/home\/)/i.test(registry.glbPath)) failures.push("ABSOLUTE_GLB_PATH");
  return failures;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRightsBoundary(value: unknown): value is Record<keyof CanaryManifestRights, unknown> {
  return isRecord(value)
    && typeof value.rightsStatus === "string"
    && typeof value.licenseId === "string"
    && typeof value.internalOnly === "boolean"
    && typeof value.distributionApproved === "boolean"
    && typeof value.reviewLabel === "string";
}
