import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const projectRoot = resolve(process.cwd());
const distRoot = resolve(projectRoot, "dist");
const assetRoot = resolve(distRoot, "assets", "lowpass-canary-v1");
const expectedHash = "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102";
const expectedLicense = "LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1";

if (!assetRoot.startsWith(`${distRoot}${sep}`)) {
  throw new Error(`EXTERNAL_ASSET_BOUNDARY_INVALID // ${assetRoot}`);
}

const [glb, manifestText, provenanceText] = await Promise.all([
  readFile(resolve(assetRoot, "lowpass-readability-canary-v1.runtime.glb")),
  readFile(resolve(assetRoot, "lowpass-readability-canary-v1.manifest.json"), "utf8"),
  readFile(resolve(assetRoot, "rights-provenance.json"), "utf8"),
]);
const manifest = JSON.parse(manifestText);
const provenance = JSON.parse(provenanceText);
const actualHash = createHash("sha256").update(glb).digest("hex");

if (actualHash !== expectedHash) {
  throw new Error(`EXTERNAL_ASSET_HASH_MISMATCH // expected ${expectedHash}, actual ${actualHash}`);
}
const manifestRights = {
  rightsStatus: manifest.license?.status,
  licenseId: manifest.license?.licenseId,
  internalOnly: false,
  distributionApproved: true,
};
for (const [label, rights] of [["manifest", manifestRights], ["provenance", provenance]]) {
  if (
    rights?.rightsStatus !== "DECLARED"
    || rights?.licenseId !== expectedLicense
    || rights?.internalOnly !== false
    || rights?.distributionApproved !== true
  ) {
    throw new Error(`EXTERNAL_ASSET_RIGHTS_INVALID // ${label}`);
  }
}

console.log(JSON.stringify({
  state: "EXTERNAL_ASSET_BOUNDARY_PASS",
  included: "dist/assets/lowpass-canary-v1",
  exactGlbSha256: actualHash,
  licenseId: expectedLicense,
  distributionScope: "LOWPASS game builds",
}, null, 2));
