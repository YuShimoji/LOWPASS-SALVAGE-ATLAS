import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const EXPECTED_GLB_SHA256 = "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102";
export const EXPECTED_SCHEMA_VERSION = "lowpass-runtime-asset-pack-1.0.0";
export const EXPECTED_SOURCE_COMMIT = "c893374ab0edd7329bd1482dbd6b99960acbbb68";
const EXPECTED_ROLES = [
  "allied-porter",
  "field-terminal",
  "hostile-needle",
  "hostile-watcher",
  "push-cart",
];
const FILES = {
  glb: "lowpass-readability-canary-v1.runtime.glb",
  manifest: "lowpass-readability-canary-v1.manifest.json",
  readback: "lowpass-readability-canary-v1.readback.json",
};

export class LowpassCanaryImportError extends Error {
  constructor(code, message) {
    super(`${code} // ${message}`);
    this.name = "LowpassCanaryImportError";
    this.code = code;
  }
}

export async function importLowpassCanary({ sourceDirectory, projectRoot }) {
  const source = resolve(sourceDirectory);
  const targetRoot = resolve(projectRoot);
  const glb = await readFile(join(source, FILES.glb));
  const manifestText = await readFile(join(source, FILES.manifest), "utf8");
  const sourceReadbackText = await readFile(join(source, FILES.readback), "utf8");
  const manifest = parseJson(manifestText, "MANIFEST_JSON_INVALID");
  const sourceReadback = parseJson(sourceReadbackText, "READBACK_JSON_INVALID");
  const exactGlbSha256 = sha256(glb);
  validateSourceContract(manifest, sourceReadback, exactGlbSha256);

  const publicDirectory = join(targetRoot, "public", "assets", "lowpass-canary-v1");
  const generatedDirectory = join(targetRoot, "src", "game", "content", "generated");
  const fixtureDirectory = join(targetRoot, "src", "game", "content", "fixtures");
  await Promise.all([
    mkdir(publicDirectory, { recursive: true }),
    mkdir(generatedDirectory, { recursive: true }),
    mkdir(fixtureDirectory, { recursive: true }),
  ]);

  const stableNodeMap = Object.fromEntries(
    [...manifest.stableNodeMap]
      .sort((left, right) => left.stableId.localeCompare(right.stableId))
      .map((entry) => [entry.stableId, entry.glbNodeName]),
  );
  const materialMap = Object.fromEntries(
    [...manifest.materialIds].sort().map((id) => [id, id]),
  );
  const anchorEntries = manifest.assets.flatMap((asset) => [
    ...asset.anchors.map((anchor) => [anchor.id, anchor.nodeId]),
    ...asset.features.map((feature) => [feature.id, feature.nodeId]),
  ]);
  const anchorMap = Object.fromEntries(anchorEntries.sort(([left], [right]) => left.localeCompare(right)));
  const anchorCount = manifest.assets.reduce((count, asset) => count + asset.anchors.length, 0);
  const collisionProxyMap = Object.fromEntries(
    manifest.assets
      .flatMap((asset) => asset.collisionProxyIds.map((nodeId) => [asset.role, nodeId]))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const assetDefinitions = Object.fromEntries(
    [...manifest.assets]
      .sort((left, right) => left.role.localeCompare(right.role))
      .map((asset) => [asset.role, {
        assetId: asset.assetId,
        assetKey: asset.assetKey,
        role: asset.role,
        rootNodeId: asset.rootNodeId,
        forwardAxis: asset.forwardAxis,
        visualNodeIds: [...asset.visualNodeIds].sort(),
        anchorIds: asset.anchors.map((entry) => entry.id).sort(),
        featureIds: asset.features.map((entry) => entry.id).sort(),
        collisionProxyIds: [...asset.collisionProxyIds].sort(),
        bounds: asset.bounds,
      }]),
  );
  const registry = {
    schemaVersion: "lowpass-asset-pack-registry-1.0.0",
    assetPackId: "lowpass-canary-v1",
    displayName: "LOWPASS Semantic Canary v1",
    manifestVersion: manifest.schemaVersion,
    exactGlbSha256,
    rightsStatus: "NOASSERTION",
    internalOnly: true,
    distributionApproved: false,
    reviewLabel: "INTERNAL REVIEW ONLY",
    glbPath: "assets/lowpass-canary-v1/lowpass-readability-canary-v1.runtime.glb",
    manifestPath: "assets/lowpass-canary-v1/lowpass-readability-canary-v1.manifest.json",
    sourceReadbackPath: "assets/lowpass-canary-v1/lowpass-readability-canary-v1.source-readback.json",
    source: {
      repository: "CodexGameAssetWorkbench",
      branch: "feat/lowpass-asset-canary-v1",
      commit: EXPECTED_SOURCE_COMMIT,
      artifactGlbSha256: exactGlbSha256,
    },
    counts: {
      assets: manifest.assets.length,
      stableNodes: manifest.stableNodeMap.length,
      meshes: sourceReadback.counts.parsedMeshes,
      triangles: manifest.triangleCount,
      materials: manifest.materialCount,
      anchors: anchorCount,
      collisionProxies: manifest.collisionProxyIds.length,
    },
    stableNodeMap,
    materialMap,
    anchorMap,
    collisionProxyMap,
    assetDefinitions,
  };
  const fixture = {
    schemaVersion: "lowpass-canary-consumer-fixture-1.0.0",
    assetPackId: registry.assetPackId,
    requiredRoles: EXPECTED_ROLES,
    requiredSemanticBindings: {
      "hostile-needle": ["socket-needle-scan-origin", "socket-needle-lock-origin"],
      "hostile-watcher": ["socket-watcher-scan-origin", "feature-watcher-visual-center"],
      "allied-porter": ["socket-porter-interaction", "socket-porter-carry", "socket-porter-communication"],
      "push-cart": ["socket-cart-handle", "socket-cart-load"],
      "field-terminal": ["socket-terminal-interaction", "feature-terminal-screen"],
    },
    primitiveFallbackRequired: true,
  };
  const provenance = {
    schemaVersion: "lowpass-asset-provenance-1.0.0",
    assetPackId: registry.assetPackId,
    source: registry.source,
    rightsStatus: registry.rightsStatus,
    internalOnly: true,
    distributionApproved: false,
    reviewLabel: registry.reviewLabel,
    generatedFromPrimitives: true,
    uvPresent: false,
    textureCount: 0,
    productionTexturingComplete: false,
    blenderHeadless: "NOT_TESTED_BLENDER_UNAVAILABLE",
  };
  const consumerReadback = {
    schemaVersion: "lowpass-asset-consumer-readback-1.0.0",
    state: "LOWPASS_CANARY_IMPORTED_INTERNAL_ONLY",
    assetPackId: registry.assetPackId,
    exactGlbSha256,
    sourceCommit: EXPECTED_SOURCE_COMMIT,
    sourceContract: manifest.schemaVersion,
    checks: {
      exactHash: true,
      schemaVersion: true,
      fiveAssets: true,
      stableNodes: manifest.stableNodeMap.length === 50,
      materialIds: manifest.materialCount === 10,
      nineAnchors: anchorCount === 9,
      fiveCollisionProxies: manifest.collisionProxyIds.length === 5,
      finiteBounds: true,
      absolutePathsAbsent: true,
      primitiveFallbackRequired: true,
    },
    rights: {
      status: "NOASSERTION",
      internalOnly: true,
      distributionApproved: false,
      reviewLabel: "INTERNAL REVIEW ONLY",
    },
    counts: registry.counts,
  };

  const outputs = [
    [join(publicDirectory, FILES.glb), glb],
    [join(publicDirectory, FILES.manifest), canonicalJson(manifest)],
    [join(publicDirectory, "lowpass-readability-canary-v1.source-readback.json"), canonicalJson(sourceReadback)],
    [join(publicDirectory, "rights-provenance.json"), canonicalJson(provenance)],
    [join(publicDirectory, "asset-consumer-readback.json"), canonicalJson(consumerReadback)],
    [join(generatedDirectory, "lowpassCanaryRegistry.json"), canonicalJson(registry)],
    [join(fixtureDirectory, "lowpassCanaryConsumerFixture.json"), canonicalJson(fixture)],
  ];
  for (const [path, content] of outputs) {
    await writeFile(path, content);
  }
  for (const [path, content] of outputs) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    if (containsLocalDisclosure(buffer.toString("utf8"))) {
      throw new LowpassCanaryImportError("ABSOLUTE_PATH_DISCLOSURE", relative(targetRoot, path));
    }
  }
  return { registry, consumerReadback, outputs: outputs.map(([path]) => relative(targetRoot, path).replaceAll("\\", "/")) };
}

export function validateSourceContract(manifest, readback, exactGlbSha256) {
  if (exactGlbSha256 !== EXPECTED_GLB_SHA256) {
    throw new LowpassCanaryImportError("GLB_SHA256_MISMATCH", `expected ${EXPECTED_GLB_SHA256}, actual ${exactGlbSha256}`);
  }
  if (manifest.schemaVersion !== EXPECTED_SCHEMA_VERSION || readback.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new LowpassCanaryImportError("SCHEMA_VERSION_MISMATCH", String(manifest.schemaVersion));
  }
  const roles = manifest.assets.map((asset) => asset.role).sort();
  if (JSON.stringify(roles) !== JSON.stringify(EXPECTED_ROLES)) {
    throw new LowpassCanaryImportError("ASSET_ROLE_MISMATCH", roles.join(","));
  }
  if (manifest.stableNodeMap.length !== 50) throw new LowpassCanaryImportError("STABLE_NODE_COUNT", String(manifest.stableNodeMap.length));
  if (manifest.materialCount !== 10) throw new LowpassCanaryImportError("MATERIAL_COUNT", String(manifest.materialCount));
  const anchorCount = manifest.assets.reduce((count, asset) => count + asset.anchors.length, 0);
  if (anchorCount !== 9) throw new LowpassCanaryImportError("ANCHOR_COUNT", String(anchorCount));
  if (manifest.collisionProxyIds.length !== 5) throw new LowpassCanaryImportError("COLLISION_PROXY_COUNT", String(manifest.collisionProxyIds.length));
  const stableIds = new Set(manifest.stableNodeMap.map((entry) => entry.stableId));
  const materials = new Set(manifest.materialIds);
  for (const asset of manifest.assets) {
    if (!stableIds.has(asset.rootNodeId)) throw new LowpassCanaryImportError("ROOT_NODE_MISSING", asset.rootNodeId);
    for (const nodeId of [...asset.stableNodeIds, ...asset.collisionProxyIds]) {
      if (!stableIds.has(nodeId)) throw new LowpassCanaryImportError("STABLE_NODE_MISSING", nodeId);
    }
    for (const id of asset.materialIds) {
      if (!materials.has(id)) throw new LowpassCanaryImportError("MATERIAL_ID_MISSING", id);
    }
    for (const anchor of [...asset.anchors, ...asset.features]) {
      if (!stableIds.has(anchor.nodeId)) throw new LowpassCanaryImportError("ANCHOR_NODE_MISSING", anchor.nodeId);
    }
    const bounds = [...asset.bounds.min, ...asset.bounds.max];
    if (!bounds.every(Number.isFinite)) throw new LowpassCanaryImportError("NON_FINITE_BOUNDS", asset.assetId);
  }
  if (containsLocalDisclosure(JSON.stringify(manifest)) || containsLocalDisclosure(JSON.stringify(readback))) {
    throw new LowpassCanaryImportError("SOURCE_LOCAL_DISCLOSURE", "source artifact contains an absolute local path");
  }
}

function parseJson(text, code) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new LowpassCanaryImportError(code, error instanceof Error ? error.message : String(error));
  }
}

function containsLocalDisclosure(text) {
  return /(?:[A-Za-z]:\\|file:\/\/|C:\\Users\\|\/Users\/|\/home\/)/i.test(text);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function canonicalJson(value) {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

async function main() {
  const sourceIndex = process.argv.indexOf("--source");
  const targetIndex = process.argv.indexOf("--target");
  if (sourceIndex < 0 || !process.argv[sourceIndex + 1]) {
    throw new LowpassCanaryImportError("SOURCE_REQUIRED", "use --source <artifact-directory>");
  }
  const projectRoot = targetIndex >= 0 && process.argv[targetIndex + 1]
    ? process.argv[targetIndex + 1]
    : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = await importLowpassCanary({
    sourceDirectory: process.argv[sourceIndex + 1],
    projectRoot,
  });
  console.log(JSON.stringify({
    state: "LOWPASS_CANARY_IMPORT_PASS",
    exactGlbSha256: result.registry.exactGlbSha256,
    outputs: result.outputs,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
