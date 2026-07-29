import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  attachPreparedCgaweRuntimeBundle,
  CgaweRuntimeBundleConsumer,
  CgaweRuntimeBundleConsumerError,
  computeCgaweSha256,
  disposePreparedCgaweRuntimeBundle,
} from "../src/render/loaders/cgaweRuntimeBundleConsumer.ts";

const TARGET_BASE = "c5ae3b9a168eb81c41886aab93699980be4c90df";
const PRODUCER_COMMIT = "831bdf587d26f74964f8d8a90f178f93e7213e54";
const CONTRACT_VERSION = "cgawe-runtime-bundle-1.0.0";
const MANIFEST_SCHEMA_VERSION = "1.0.0";

const ARTIFACTS = [
  {
    caseId: "starter",
    glbFile: "starter-atelier.runtime.glb",
    manifestFile: "starter-atelier.runtime.manifest.json",
    glbSha256:
      "sha256:5b39c86b7bb7999e8401a27c1dc34cb3172cc58e5cbdabc36fe071aff8d437ea",
    manifestSha256:
      "sha256:9378e8cb189cba95ec21cec337cf8c85aa1d0f88b93637d79a506eee9a81160c",
  },
  {
    caseId: "paper-glider-generic",
    glbFile: "paper-glider-archive-gate-v1.runtime.glb",
    manifestFile:
      "paper-glider-archive-gate-v1.runtime.manifest.json",
    glbSha256:
      "sha256:27e13b5ed5b9b6d521d39936127e73f75c8c7de5fc3724e2240b39d6e2cd12fe",
    manifestSha256:
      "sha256:b8cbaee3d1b8ff155ffc19a0a4285c0389b97aca98c10b317abd87d18643cc99",
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `Git verification failed for ${args.join(" ")}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout.trim();
}

function requireProducerRoot() {
  const configured = process.env.CGAWE_WORKBENCH_ROOT;
  if (configured === undefined || configured.length === 0) {
    throw new Error(
      "CGAWE_WORKBENCH_ROOT is required and must point to the exact CodexGameAssetWorkbench checkout.",
    );
  }
  const root = resolve(configured);
  const actualCommit = git(root, ["rev-parse", "HEAD"]);
  if (actualCommit !== PRODUCER_COMMIT) {
    throw new Error(
      `CGAWE_WORKBENCH_ROOT must resolve to exact producer commit ${PRODUCER_COMMIT}; received ${actualCommit}.`,
    );
  }
  return root;
}

function encodeManifest(manifest) {
  return new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
}

function cloneManifest(manifest) {
  return JSON.parse(JSON.stringify(manifest));
}

async function makeIdentity(manifestBytes, manifestFile, glbFile) {
  return {
    expectedManifestSha256: await computeCgaweSha256(manifestBytes),
    manifestFileName: manifestFile,
    glbFileName: glbFile,
  };
}

async function loadExternalArtifact(producerRoot, definition) {
  const directory = join(
    producerRoot,
    "artifacts",
    "runtime-bundle-v1",
  );
  const glbPath = join(directory, definition.glbFile);
  const manifestPath = join(directory, definition.manifestFile);
  const glb = Uint8Array.from(await readFile(glbPath));
  const manifestBytes = Uint8Array.from(await readFile(manifestPath));
  const glbSha256 = await computeCgaweSha256(glb);
  const manifestSha256 = await computeCgaweSha256(manifestBytes);
  assert(
    glbSha256 === definition.glbSha256,
    `${definition.caseId} protected GLB SHA-256 mismatch.`,
  );
  assert(
    manifestSha256 === definition.manifestSha256,
    `${definition.caseId} protected manifest SHA-256 mismatch.`,
  );
  return {
    ...definition,
    glb,
    manifestBytes,
    manifest: JSON.parse(new TextDecoder().decode(manifestBytes)),
  };
}

function createSentinel(destination) {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  let geometryDisposals = 0;
  let materialDisposals = 0;
  geometry.dispose = () => {
    geometryDisposals += 1;
  };
  material.dispose = () => {
    materialDisposals += 1;
  };
  const sentinel = new Mesh(geometry, material);
  sentinel.name = "unrelated-caller-sentinel";
  destination.add(sentinel);
  return {
    sentinel,
    geometryDisposals: () => geometryDisposals,
    materialDisposals: () => materialDisposals,
  };
}

async function positiveInput(artifact) {
  return {
    manifest: artifact.manifestBytes,
    glb: artifact.glb,
    identity: {
      expectedManifestSha256: artifact.manifestSha256,
      manifestFileName: artifact.manifestFile,
      glbFileName: artifact.glbFile,
    },
  };
}

async function mutatedInput(artifact, mutate, suppliedGlb = artifact.glb) {
  const manifest = cloneManifest(artifact.manifest);
  await mutate(manifest, suppliedGlb);
  const manifestBytes = encodeManifest(manifest);
  return {
    manifest: manifestBytes,
    glb: suppliedGlb,
    identity: await makeIdentity(
      manifestBytes,
      artifact.manifestFile,
      artifact.glbFile,
    ),
  };
}

async function runPositive(
  consumer,
  parserCount,
  artifact,
  caseId = artifact.caseId,
) {
  const beforeParser = parserCount();
  const prepared = await consumer.prepare(await positiveInput(artifact));
  const parserInvocations = parserCount() - beforeParser;
  const destination = new Scene();
  const sentinel = createSentinel(destination);
  assert(prepared.root.parent === null, `${caseId} was attached during prepare.`);
  attachPreparedCgaweRuntimeBundle(destination, prepared);
  const attachmentCount = destination.children.filter(
    (child) => child === prepared.root,
  ).length;
  let duplicateAttachmentCode = null;
  try {
    attachPreparedCgaweRuntimeBundle(destination, prepared);
  } catch (error) {
    if (error instanceof CgaweRuntimeBundleConsumerError) {
      duplicateAttachmentCode = error.code;
    } else {
      throw error;
    }
  }
  const disposal = disposePreparedCgaweRuntimeBundle(prepared);
  const repeatedDisposal = disposePreparedCgaweRuntimeBundle(prepared);
  const sentinelPreserved =
    destination.children.includes(sentinel.sentinel) &&
    sentinel.geometryDisposals() === 0 &&
    sentinel.materialDisposals() === 0;
  assert(parserInvocations === 1, `${caseId} must parse exactly once.`);
  assert(attachmentCount === 1, `${caseId} must attach exactly once.`);
  assert(
    duplicateAttachmentCode === "CGAWE_ATTACHMENT_STATE_INVALID",
    `${caseId} duplicate attachment was not blocked.`,
  );
  assert(sentinelPreserved, `${caseId} changed caller-owned sentinel resources.`);
  assert(
    repeatedDisposal.alreadyDisposed &&
      repeatedDisposal.geometries === 0 &&
      repeatedDisposal.materials === 0,
    `${caseId} repeated disposal was not idempotent.`,
  );
  return {
    producerCommit: PRODUCER_COMMIT,
    caseId,
    contractVersion: prepared.manifest.contractVersion,
    manifestSchemaVersion: prepared.manifest.manifestSchemaVersion,
    manifestSha256: prepared.manifestSha256,
    glbSha256: prepared.glbSha256,
    rightsStatus: prepared.rights.status,
    declaredCounts: {
      nodes: prepared.manifest.counts.nodes,
      meshes: prepared.manifest.counts.meshes,
      triangles: prepared.manifest.counts.triangles,
    },
    parsedCounts: {
      nodes: prepared.parsedNodeCount,
      meshes: prepared.parsedMeshCount,
      triangles: prepared.parsedTriangleCount,
    },
    resolvedStableIdCount: prepared.resolvedStableIds.size,
    parserInvocations,
    attachmentCount,
    duplicateAttachmentBlocked: true,
    sentinelPreserved,
    disposal,
    repeatedDisposal,
  };
}

async function runNegative(
  consumer,
  parserCount,
  caseId,
  input,
  expectedCode,
  expectedParserInvocations,
) {
  const destination = new Scene();
  const sentinel = createSentinel(destination);
  const beforeParser = parserCount();
  let actualError;
  try {
    const unexpected = await consumer.prepare(input);
    disposePreparedCgaweRuntimeBundle(unexpected);
    throw new Error(`${caseId} unexpectedly prepared successfully.`);
  } catch (error) {
    if (!(error instanceof CgaweRuntimeBundleConsumerError)) {
      throw error;
    }
    actualError = error;
  }
  const parserInvocations = parserCount() - beforeParser;
  const attachmentCount = destination.children.filter(
    (child) => child.name !== sentinel.sentinel.name,
  ).length;
  const sentinelPreserved =
    destination.children.length === 1 &&
    destination.children[0] === sentinel.sentinel &&
    sentinel.geometryDisposals() === 0 &&
    sentinel.materialDisposals() === 0;
  assert(
    actualError.code === expectedCode,
    `${caseId} returned ${actualError.code}, expected ${expectedCode}.`,
  );
  assert(
    parserInvocations === expectedParserInvocations,
    `${caseId} parser count ${parserInvocations}, expected ${expectedParserInvocations}.`,
  );
  assert(attachmentCount === 0, `${caseId} attached malformed content.`);
  assert(sentinelPreserved, `${caseId} changed the caller Scene sentinel.`);
  const disposal = actualError.disposal ?? {
    geometries: 0,
    materials: 0,
    detached: false,
    alreadyDisposed: false,
  };
  if (caseId === "missing-glb-node-reference") {
    assert(
      disposal.geometries > 0 && disposal.materials > 0,
      "Missing-node post-parse failure did not dispose parsed resources.",
    );
  }
  return {
    caseId,
    errorCode: actualError.code,
    errorStage: actualError.stage,
    parserInvocations,
    attachmentCount,
    sentinelPreserved,
    disposal,
  };
}

function scanDisclosure(serialized) {
  const forbidden = [
    ["drive-letter", /[A-Za-z]:[\\/]/u],
    ["absolute-user-path", /[\\/]Users[\\/]/iu],
    ["email", /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u],
    ["date", /\b20\d{2}-\d{2}-\d{2}\b/u],
  ];
  const matches = forbidden
    .filter(([, pattern]) => pattern.test(serialized))
    .map(([name]) => name);
  assert(matches.length === 0, `Readback disclosure scan failed: ${matches.join(", ")}`);
  return true;
}

async function main() {
  const producerRoot = requireProducerRoot();
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const targetRoot = resolve(scriptDirectory, "..");
  const baseIsAncestor = spawnSync(
    "git",
    ["-C", targetRoot, "merge-base", "--is-ancestor", TARGET_BASE, "HEAD"],
    { windowsHide: true },
  );
  assert(
    baseIsAncestor.status === 0,
    `Target branch must descend from exact base ${TARGET_BASE}.`,
  );
  const artifacts = [];
  for (const definition of ARTIFACTS) {
    artifacts.push(await loadExternalArtifact(producerRoot, definition));
  }

  let parserInvocations = 0;
  const loader = new GLTFLoader();
  const consumer = new CgaweRuntimeBundleConsumer(async (glb) => {
    parserInvocations += 1;
    return loader.parseAsync(glb, "");
  });
  const parserCount = () => parserInvocations;

  const positives = [];
  for (const artifact of artifacts) {
    positives.push(
      await runPositive(consumer, parserCount, artifact),
    );
  }

  const starter = artifacts[0];
  assert(starter !== undefined, "Starter external artifact is required.");
  const negativeDefinitions = [
    {
      caseId: "unknown-contract-version",
      expectedCode: "CGAWE_CONTRACT_VERSION_UNSUPPORTED",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.contractVersion = "cgawe-runtime-bundle-9.9.9";
      }),
    },
    {
      caseId: "unknown-manifest-schema-version",
      expectedCode: "CGAWE_MANIFEST_SCHEMA_VERSION_UNSUPPORTED",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.manifestSchemaVersion = "9.9.9";
      }),
    },
    {
      caseId: "manifest-sha-mismatch",
      expectedCode: "CGAWE_MANIFEST_SHA256_MISMATCH",
      expectedParserInvocations: 0,
      input: {
        ...(await positiveInput(starter)),
        identity: {
          expectedManifestSha256: `sha256:${"0".repeat(64)}`,
          manifestFileName: starter.manifestFile,
          glbFileName: starter.glbFile,
        },
      },
    },
    {
      caseId: "glb-byte-count-mismatch",
      expectedCode: "CGAWE_GLB_BYTE_COUNT_MISMATCH",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.files.glb.bytes += 1;
      }),
    },
    {
      caseId: "glb-sha-mismatch",
      expectedCode: "CGAWE_GLB_SHA256_MISMATCH",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.files.glb.sha256 = `sha256:${"0".repeat(64)}`;
      }),
    },
    {
      caseId: "unknown-rights-status",
      expectedCode: "CGAWE_RIGHTS_STATUS_INVALID",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.rights.status = "UNKNOWN";
      }),
    },
    {
      caseId: "blank-rights-notice",
      expectedCode: "CGAWE_RIGHTS_NOTICE_INVALID",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.rights.notice = " \t ";
      }),
    },
    {
      caseId: "declared-missing-license-id",
      expectedCode: "CGAWE_RIGHTS_LICENSE_ID_REQUIRED",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.rights.status = "DECLARED";
        delete manifest.rights.licenseId;
      }),
    },
    {
      caseId: "declared-blank-license-id",
      expectedCode: "CGAWE_RIGHTS_LICENSE_ID_INVALID",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.rights.status = "DECLARED";
        manifest.rights.licenseId = " \t ";
      }),
    },
    {
      caseId: "duplicate-stable-id",
      expectedCode: "CGAWE_STABLE_ID_DUPLICATE",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.nodeMap[1].stableId = manifest.nodeMap[0].stableId;
      }),
    },
    {
      caseId: "duplicate-glb-node-name",
      expectedCode: "CGAWE_GLB_NODE_NAME_DUPLICATE",
      expectedParserInvocations: 0,
      input: await mutatedInput(starter, (manifest) => {
        manifest.nodeMap[1].glbNodeName =
          manifest.nodeMap[0].glbNodeName;
      }),
    },
    {
      caseId: "missing-glb-node-reference",
      expectedCode: "CGAWE_GLB_NODE_REFERENCE_MISSING",
      expectedParserInvocations: 1,
      input: await mutatedInput(starter, (manifest) => {
        manifest.nodeMap[0].glbNodeName =
          "runtime-root--missing-external-reference";
      }),
    },
    {
      caseId: "malformed-glb",
      expectedCode: "CGAWE_GLTF_PARSE_FAILED",
      expectedParserInvocations: 1,
      input: await (async () => {
        const malformedGlb = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
        return mutatedInput(
          starter,
          async (manifest) => {
            manifest.files.glb.bytes = malformedGlb.byteLength;
            manifest.files.glb.sha256 =
              await computeCgaweSha256(malformedGlb);
          },
          malformedGlb,
        );
      })(),
    },
  ];

  const negatives = [];
  for (const definition of negativeDefinitions) {
    negatives.push(
      await runNegative(
        consumer,
        parserCount,
        definition.caseId,
        definition.input,
        definition.expectedCode,
        definition.expectedParserInvocations,
      ),
    );
  }

  const recovery = await runPositive(
    consumer,
    parserCount,
    starter,
    "starter-recovery-after-negatives",
  );
  const readback = {
    state: "CGAWE_RB_C1_LOWPASS_EXTERNAL_CONSUMER_LOCAL_GREEN",
    targetBase: TARGET_BASE,
    producerCommit: PRODUCER_COMMIT,
    contractVersion: CONTRACT_VERSION,
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    positiveResults: positives,
    negativeResults: negatives,
    parserBeforeFailureCounts: Object.fromEntries(
      negatives.map((result) => [result.caseId, result.parserInvocations]),
    ),
    recovery,
    checks: {
      protectedArtifactHashCount: 4,
      externalPositiveCount: positives.length,
      negativeCount: negatives.length,
      preParseFailuresWithoutParser: negatives
        .filter((result) => result.errorStage === "pre-parse")
        .every((result) => result.parserInvocations === 0),
      malformedAttachmentCount: negatives.reduce(
        (total, result) => total + result.attachmentCount,
        0,
      ),
      sentinelPreservedForAllNegatives: negatives.every(
        (result) => result.sentinelPreserved,
      ),
      validRecoveryAfterNegativeSequence:
        recovery.attachmentCount === 1 &&
        recovery.parserInvocations === 1 &&
        recovery.sentinelPreserved,
      producerArtifactsCopiedToTarget: 0,
      gameplayIntegrationPerformed: false,
      visualAcceptancePerformed: false,
    },
    claimBoundary: {
      proven:
        "Repository-external Three.js Runtime Bundle consumer conformance.",
      notProven: [
        "Cross-engine portability.",
        "Production asset adoption or shipping readiness.",
        "Gameplay or visual acceptance.",
        "Mainline integration in either repository.",
      ],
      rights:
        "NOASSERTION grants no license or distribution permission.",
      artifactShipping:
        "No CodexGameAssetWorkbench artifact ships from LOWPASS-SALVAGE-ATLAS.",
    },
  };
  const serialized = `${JSON.stringify(readback, null, 2)}\n`;
  scanDisclosure(serialized);
  const outputDirectory = join(
    targetRoot,
    "artifacts",
    "cgawe-runtime-bundle-consumer-v1",
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "consumer-readback.json"), serialized);
  process.stdout.write(
    `CGAWE consumer proof passed: ${positives.length} external positives, ${negatives.length} negatives, recovery ${recovery.attachmentCount}.\n`,
  );
}

await main();
