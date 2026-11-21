import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const options = parseOptions(process.argv.slice(2));
const localRef = options.local ?? "HEAD";
const remoteRef = options.remote ?? "origin/project/frontier";
const outputDirectory = resolve(
  options.output ?? "artifacts/reconciliation/phase-g-canonical-v2",
);

const localSha = git("rev-parse", localRef);
const remoteSha = git("rev-parse", remoteRef);
const mergeBase = git("merge-base", localSha, remoteSha);
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const localTree = git("rev-parse", `${localSha}^{tree}`);
const remoteTree = git("rev-parse", `${remoteSha}^{tree}`);
const [localUnique, remoteUnique] = git(
  "rev-list",
  "--left-right",
  "--count",
  `${localSha}...${remoteSha}`,
).split(/\s+/).map(Number);

const localOnlyCommits = commitList(`${remoteSha}..${localSha}`);
const remoteOnlyCommits = commitList(`${localSha}..${remoteSha}`);
const changedFiles = parseNameStatus(
  git("diff", "--name-status", localSha, remoteSha),
);
const categories = classifyFiles(changedFiles);

mkdirSync(outputDirectory, { recursive: true });

writeJson("ancestry-readback.json", {
  schemaVersion: "lowpass-phase-g-reconciliation-ancestry-1.0.0",
  generatedAtIso: new Date().toISOString(),
  branch,
  local: {
    ref: localRef,
    sha: localSha,
    tree: localTree,
    uniqueCommits: localUnique,
    commits: localOnlyCommits,
  },
  remote: {
    ref: remoteRef,
    sha: remoteSha,
    tree: remoteTree,
    uniqueCommits: remoteUnique,
    commits: remoteOnlyCommits,
  },
  mergeBase,
  requiredAncestors: {
    localImplementation: "d2683eeec43dc1befad406508f7d8b52f2a43a27",
    remoteGreenBaseline: "f3ea10949a908236adad1d2106ff0634804fc4bd",
  },
  noForcePolicy: true,
});

writeFileSync(
  resolve(outputDirectory, "range-diff.txt"),
  [
    `local: ${localSha}`,
    `remote: ${remoteSha}`,
    `merge-base: ${mergeBase}`,
    "",
    git(
      "range-diff",
      `${mergeBase}..${localSha}`,
      `${mergeBase}..${remoteSha}`,
    ),
    "",
  ].join("\n"),
  "utf8",
);

writeJson("file-classification.json", {
  schemaVersion: "lowpass-phase-g-reconciliation-files-1.0.0",
  generatedAtIso: new Date().toISOString(),
  localSha,
  remoteSha,
  changedFileCount: changedFiles.length,
  changedFiles,
  categories,
  counts: Object.fromEntries(
    Object.entries(categories).map(([key, paths]) => [key, paths.length]),
  ),
});

writeJson("acceptance-gap-matrix.json", {
  schemaVersion: "lowpass-phase-g-acceptance-gap-matrix-1.0.0",
  generatedAtIso: new Date().toISOString(),
  canonicalSelection: "LOCAL_D2683EE_LINEAGE",
  remoteClassification: "GREEN_BUT_NOT_ACCEPTANCE_EQUIVALENT",
  gaps: [
    {
      id: "porter-periodic-pulse",
      localState:
        "Meaning-event cues only; no ambient or movement-periodic Porter pulse.",
      remoteState:
        "MachineFeedbackAudio emits porter.operational-pulse every 1.6 seconds while operational.",
      selectedState:
        "Keep local meaning-event-only semantics and explicit auth, carry, failure, rejection, mute, rate-limit, and caption coverage.",
      supportingFiles: [
        "src/render/audio/MachineFeedbackAudio.ts",
        "src/render/audio/SemanticCueCatalog.ts",
      ],
      supportingTests: [
        "src/render/audio/MachineFeedbackAudio.test.ts",
      ],
      supportingArtifacts: [
        "docs/evidence/phase-g-closure/phase-g-audio-audit.json",
      ],
    },
    {
      id: "guided-audit-event-granularity",
      localState:
        "22-step event-granular Security Cell audit with timeout, duplicate, tick, duration, revision, expected, actual, result, and failure readback.",
      remoteState:
        "18-step controller-oriented flow; Security Cell share, reacquisition, lock, Presence, posture, sabotage, and flare expiry are not independent gates.",
      selectedState:
        "Keep and extend the local 22-step causal audit contract.",
      supportingFiles: [
        "src/qa/GuidedPhaseGAudit.ts",
        "src/ui/GuidedQaPanel.ts",
      ],
      supportingTests: [
        "src/qa/GuidedPhaseGAudit.test.ts",
        "src/ui/GuidedQaPanel.test.ts",
      ],
      supportingArtifacts: [
        "docs/evidence/phase-g-closure/phase-g-guided-audit.json",
        "docs/evidence/phase-g-closure/phase-g-guided-audit.html",
      ],
    },
    {
      id: "rights-fail-closed",
      localState:
        "Registry requires NOASSERTION, internalOnly=true, and distributionApproved=false.",
      remoteState:
        "Manifest and readback preserve NOASSERTION, but runtime consumer lacks explicit internalOnly/distributionApproved fail-closed validation.",
      selectedState:
        "Keep local explicit rights flags, add distribution-context rejection, structured fallback warning, registry/manifest parity, and session continuation tests.",
      supportingFiles: [
        "src/game/content/AssetPackRegistry.ts",
        "src/game/content/generated/lowpassCanaryRegistry.json",
        "public/assets/lowpass-canary-v1/rights-provenance.json",
      ],
      supportingTests: [
        "src/game/content/AssetPackRegistry.test.ts",
        "tests/lowpassCanaryImporter.test.ts",
      ],
      supportingArtifacts: [
        "public/assets/lowpass-canary-v1/asset-consumer-readback.json",
        "docs/evidence/phase-g-closure/primitive-canary-readback.json",
      ],
    },
    {
      id: "six-state-four-condition-ab-evidence",
      localState:
        "Six named states across primitive/canary and PS1 OFF/ON: 24 screenshots plus contact sheet, index, and visual readback.",
      remoteState:
        "Four aggregate A/B screenshots plus contact sheet.",
      selectedState:
        "Regenerate all 24 local conditions from the reconciled canonical runtime with fixed seed, camera, posture, and viewport.",
      supportingFiles: [
        "scripts/generate-phase-g-evidence.mjs",
      ],
      supportingTests: [
        "tests/CanaryMissionAssetPack.test.ts",
      ],
      supportingArtifacts: [
        "docs/evidence/phase-g-closure/primitive-canary-contact-sheet.png",
        "docs/evidence/phase-g-closure/primitive-canary-index.html",
        "docs/evidence/phase-g-closure/primitive-canary-readback.json",
        "docs/evidence/phase-g-closure/screenshots",
      ],
    },
  ],
});

console.log(
  JSON.stringify(
    {
      outputDirectory,
      localSha,
      remoteSha,
      mergeBase,
      localUnique,
      remoteUnique,
      changedFileCount: changedFiles.length,
    },
    null,
    2,
  ),
);

function parseOptions(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function commitList(range) {
  const output = git("log", "--reverse", "--format=%H%x09%s", range);
  if (!output) return [];
  return output.split(/\r?\n/).map((line) => {
    const [sha, ...subjectParts] = line.split("\t");
    return { sha, subject: subjectParts.join("\t") };
  });
}

function parseNameStatus(output) {
  if (!output) return [];
  return output.split(/\r?\n/).map((line) => {
    const [status, ...paths] = line.split("\t");
    return { status, paths };
  });
}

function classifyFiles(entries) {
  const paths = entries.flatMap((entry) => entry.paths);
  const unique = (values) => [...new Set(values)].sort();
  const tests = unique(
    paths.filter(
      (path) => path.includes(".test.") || path.startsWith("tests/"),
    ),
  );
  const artifacts = unique(
    paths.filter(
      (path) =>
        path.startsWith("artifacts/") ||
        path.startsWith("output/") ||
        path.startsWith("docs/evidence/"),
    ),
  );
  const contracts = unique(
    paths.filter(
      (path) =>
        path.startsWith("src/game/") ||
        path.includes("AssetPackRegistry") ||
        path.includes("Guided") ||
        path.includes("Semantic") ||
        path.includes("MachineFeedbackAudio") ||
        path.includes("CanaryMissionAssetPack"),
    ),
  );
  const documentation = unique(
    paths.filter(
      (path) =>
        path.endsWith(".md") ||
        path === "README.md" ||
        path.startsWith("docs/"),
    ),
  );
  const product = unique(
    paths.filter(
      (path) =>
        path.startsWith("src/") ||
        path.startsWith("public/") ||
        path.startsWith("scripts/") ||
        path === "package.json" ||
        path === "package-lock.json",
    ),
  );
  const classified = new Set([
    ...tests,
    ...artifacts,
    ...contracts,
    ...documentation,
    ...product,
  ]);
  return {
    product,
    contracts,
    tests,
    artifacts,
    documentation,
    other: unique(paths.filter((path) => !classified.has(path))),
  };
}

function writeJson(fileName, value) {
  writeFileSync(
    resolve(outputDirectory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}
