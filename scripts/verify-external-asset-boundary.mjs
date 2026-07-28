import { access, readdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";

const projectRoot = resolve(process.cwd());
const distRoot = resolve(projectRoot, "dist");
const internalAssetDirectory = resolve(distRoot, "assets", "lowpass-canary-v1");

if (!internalAssetDirectory.startsWith(`${distRoot}${sep}`)) {
  throw new Error(`EXTERNAL_ASSET_BOUNDARY_INVALID // ${internalAssetDirectory}`);
}

await rm(internalAssetDirectory, { recursive: true, force: true });

const remaining = await walk(distRoot);
const forbidden = remaining.filter((path) =>
  path.endsWith(".glb")
  || path.includes("lowpass-readability-canary-v1.runtime")
  || path.includes("rights-provenance.json"));
if (forbidden.length > 0) {
  throw new Error(`EXTERNAL_ASSET_BOUNDARY_FAILED // ${forbidden.join(",")}`);
}

try {
  await access(internalAssetDirectory);
  throw new Error(`EXTERNAL_ASSET_DIRECTORY_REMAINS // ${internalAssetDirectory}`);
} catch (error) {
  if (error instanceof Error && !("code" in error && error.code === "ENOENT")) throw error;
}

console.log(JSON.stringify({
  state: "EXTERNAL_ASSET_BOUNDARY_PASS",
  removed: "dist/assets/lowpass-canary-v1",
  forbiddenAssetCount: 0,
}, null, 2));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}
