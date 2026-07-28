import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_COMMIT = "c893374ab0edd7329bd1482dbd6b99960acbbb68";
const EXPECTED_GLB_SHA256 = "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102";
const EXPECTED_GLB_BYTES = 70_892;
const SOURCE_ROOT = "artifacts/lowpass-canary-v1";
const PACK_ID = "lowpass-readability-canary-v1";
const REQUIRED_ASSET_KEYS = [
  "lowpass:security/needle-drone",
  "lowpass:security/watcher-drone",
  "lowpass:machines/porter-android",
  "lowpass:props/shopping-cart",
  "lowpass:equipment/field-terminal",
];
const REQUIRED_ANCHOR_KINDS = [
  "scan",
  "lock-on",
  "carry",
  "handle",
  "load",
  "interaction",
];

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRepository = getArgument("--source-repo");
if (!sourceRepository) {
  throw new Error("Usage: npm run canary:import -- --source-repo <CodexGameAssetWorkbench checkout>");
}

const resolvedSourceRepository = resolve(sourceRepository);
const resolvedCommit = git(["rev-parse", `${SOURCE_COMMIT}^{commit}`]).toString("utf8").trim();
if (resolvedCommit !== SOURCE_COMMIT) {
  throw new Error(`CGAW_SOURCE_COMMIT_MISMATCH: expected ${SOURCE_COMMIT}, received ${resolvedCommit}`);
}

const files = {
  glb: `${PACK_ID}.runtime.glb`,
  manifest: `${PACK_ID}.manifest.json`,
  sourceReadback: `${PACK_ID}.readback.json`,
};
const glb = git(["show", `${SOURCE_COMMIT}:${SOURCE_ROOT}/${files.glb}`]);
const manifestBytes = git(["show", `${SOURCE_COMMIT}:${SOURCE_ROOT}/${files.manifest}`]);
const sourceReadbackBytes = git(["show", `${SOURCE_COMMIT}:${SOURCE_ROOT}/${files.sourceReadback}`]);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const sourceReadback = JSON.parse(sourceReadbackBytes.toString("utf8"));

const validation = validatePack(glb, manifest, sourceReadback);
const targetRoot = resolve(workspace, "public", "assets", "canary-v1");
mkdirSync(targetRoot, { recursive: true });
writeIfChanged(resolve(targetRoot, files.glb), glb);
writeIfChanged(resolve(targetRoot, files.manifest), manifestBytes);
writeIfChanged(resolve(targetRoot, files.sourceReadback), sourceReadbackBytes);

const importReadback = {
  schemaVersion: "lowpass-canary-consumer-import-1.0.0",
  state: "CANARY_SOURCE_IDENTITY_VALIDATED",
  source: {
    repository: "YuShimoji/CodexGameAssetWorkbench",
    commit: SOURCE_COMMIT,
    assetPackId: PACK_ID,
    rightsStatus: manifest.license?.status
      ?? manifest.sourceProvenance?.rightsStatus
      ?? sourceReadback.rights?.status,
    distributionStatus: "INTERNAL_REVIEW_ONLY",
  },
  outputs: {
    glb: `public/assets/canary-v1/${files.glb}`,
    manifest: `public/assets/canary-v1/${files.manifest}`,
    sourceReadback: `public/assets/canary-v1/${files.sourceReadback}`,
  },
  validation,
};
const readbackPath = resolve(workspace, "artifacts", "canary-v1", "import-readback.json");
mkdirSync(dirname(readbackPath), { recursive: true });
writeIfChanged(readbackPath, Buffer.from(`${JSON.stringify(importReadback, null, 2)}\n`));
process.stdout.write(`${JSON.stringify(importReadback, null, 2)}\n`);

function git(args) {
  return execFileSync("git", ["-C", resolvedSourceRepository, ...args], {
    encoding: "buffer",
    maxBuffer: 4 * 1024 * 1024,
  });
}

function validatePack(glbBytes, parsedManifest, parsedReadback) {
  const sha256 = createHash("sha256").update(glbBytes).digest("hex");
  const nodeIds = new Set(parsedManifest.stableNodeMap?.map((node) => node.stableId) ?? []);
  const assetKeys = parsedManifest.assets?.map((asset) => asset.assetKey) ?? [];
  const anchors = parsedManifest.assets?.flatMap((asset) => asset.anchors ?? []) ?? [];
  const collisionProxyIds = parsedManifest.assets?.flatMap((asset) => asset.collisionProxyIds ?? []) ?? [];
  const anchorKinds = new Set(anchors.map((anchor) => anchor.kind));
  const failures = [];
  if (glbBytes.subarray(0, 4).toString("utf8") !== "glTF") failures.push("INVALID_GLB_MAGIC");
  if (glbBytes.length !== EXPECTED_GLB_BYTES) failures.push("GLB_BYTE_COUNT_MISMATCH");
  if (sha256 !== EXPECTED_GLB_SHA256) failures.push("GLB_SHA256_MISMATCH");
  if (parsedManifest.schemaVersion !== "lowpass-runtime-asset-pack-1.0.0") failures.push("SCHEMA_VERSION_MISMATCH");
  if (parsedManifest.assetPackId !== PACK_ID) failures.push("ASSET_PACK_ID_MISMATCH");
  if (parsedManifest.assets?.length !== 5) failures.push("ASSET_COUNT_MISMATCH");
  const rightsStatus = parsedManifest.license?.status
    ?? parsedManifest.sourceProvenance?.rightsStatus
    ?? parsedReadback.rights?.status;
  if (rightsStatus !== "NOASSERTION") failures.push("RIGHTS_STATUS_MISMATCH");
  if (!REQUIRED_ASSET_KEYS.every((assetKey) => assetKeys.includes(assetKey))) failures.push("ASSET_KEY_MISSING");
  if (!REQUIRED_ANCHOR_KINDS.every((kind) => anchorKinds.has(kind))) failures.push("ANCHOR_KIND_MISSING");
  if (!anchors.every((anchor) => nodeIds.has(anchor.nodeId))) failures.push("ANCHOR_NODE_MISSING");
  if (!collisionProxyIds.every((nodeId) => nodeIds.has(nodeId))) failures.push("COLLISION_PROXY_NODE_MISSING");
  if (parsedReadback.files?.glb?.sha256 !== `sha256:${EXPECTED_GLB_SHA256}`) failures.push("SOURCE_READBACK_HASH_MISMATCH");
  const disclosureText = JSON.stringify({ parsedManifest, parsedReadback });
  if (/(?:[A-Za-z]:\\|file:\/\/|Users[\\/])/i.test(disclosureText)) failures.push("LOCAL_PATH_DISCLOSURE");
  if (failures.length > 0) throw new Error(`CGAW_CANARY_VALIDATION_FAILED: ${failures.join(", ")}`);
  return {
    glbSha256: `sha256:${sha256}`,
    glbBytes: glbBytes.length,
    assetCount: parsedManifest.assets.length,
    stableNodeCount: nodeIds.size,
    anchorCount: anchors.length,
    collisionProxyCount: collisionProxyIds.length,
    requiredAssetKeys: true,
    requiredAnchorKinds: true,
    referencedNodesResolved: true,
    localPathFree: true,
  };
}

function writeIfChanged(path, contents) {
  let current = null;
  try {
    current = readFileSync(path);
  } catch {
    // Missing targets are expected on the first import.
  }
  if (!current?.equals(contents)) writeFileSync(path, contents);
}

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
