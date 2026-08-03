// Node-runtime integration test; intentionally outside the browser-only TypeScript project.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const importedSource = resolve("public", "assets", "lowpass-canary-v1");
const script = resolve("scripts/import-lowpass-canary.mjs");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("LOWPASS Canary importer", () => {
  it("imports deterministic consumer files with exact hash and no absolute paths", () => {
    const source = portableSource();
    const first = temporary();
    const second = temporary();
    runImport(source, first);
    runImport(source, second);
    const files = [
      "public/assets/lowpass-canary-v1/lowpass-readability-canary-v1.runtime.glb",
      "public/assets/lowpass-canary-v1/lowpass-readability-canary-v1.manifest.json",
      "public/assets/lowpass-canary-v1/lowpass-readability-canary-v1.source-readback.json",
      "public/assets/lowpass-canary-v1/rights-provenance.json",
      "public/assets/lowpass-canary-v1/asset-consumer-readback.json",
      "src/game/content/generated/lowpassCanaryRegistry.json",
      "src/game/content/fixtures/lowpassCanaryConsumerFixture.json",
    ];
    for (const file of files) {
      const left = readFileSync(join(first, file));
      const right = readFileSync(join(second, file));
      expect(left.equals(right)).toBe(true);
      expect(left.toString("utf8")).not.toMatch(/[A-Za-z]:\\|file:\/\/|C:\\Users\\/);
      const tracked = readFileSync(resolve(file));
      if (file.endsWith(".json")) {
        expect(JSON.parse(left.toString("utf8"))).toEqual(JSON.parse(tracked.toString("utf8")));
      } else {
        expect(left.equals(tracked)).toBe(true);
      }
    }
    const glb = readFileSync(join(first, files[0]!));
    expect(createHash("sha256").update(glb).digest("hex")).toBe(
      "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102",
    );
  });

  it("rejects an invalid GLB hash before producing a consumer registry", () => {
    const source = portableSource();
    const mutatedSource = temporary();
    cpSync(source, mutatedSource, { recursive: true });
    const glbPath = join(mutatedSource, "lowpass-readability-canary-v1.runtime.glb");
    const bytes = readFileSync(glbPath);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    writeFileSync(glbPath, bytes);
    expect(() => runImport(mutatedSource, temporary())).toThrow(/GLB_SHA256_MISMATCH/);
  });

  it("rejects a source manifest whose project-scoped rights declaration changes", () => {
    const source = portableSource();
    const manifestPath = join(source, "lowpass-readability-canary-v1.manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.license.licenseId = "LicenseRef-Unexpected";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    expect(() => runImport(source, temporary())).toThrow(/MANIFEST_SHA256_MISMATCH/);
  });
});

function portableSource(): string {
  const directory = temporary();
  copyFileSync(
    join(importedSource, "lowpass-readability-canary-v1.runtime.glb"),
    join(directory, "lowpass-readability-canary-v1.runtime.glb"),
  );
  copyFileSync(
    join(importedSource, "lowpass-readability-canary-v1.manifest.json"),
    join(directory, "lowpass-readability-canary-v1.manifest.json"),
  );
  copyFileSync(
    join(importedSource, "lowpass-readability-canary-v1.source-readback.json"),
    join(directory, "lowpass-readability-canary-v1.readback.json"),
  );
  return directory;
}

function temporary(): string {
  const directory = mkdtempSync(join(tmpdir(), "lowpass-canary-import-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runImport(sourceDirectory: string, target: string): void {
  execFileSync(process.execPath, [script, "--source", sourceDirectory, "--target", target], {
    encoding: "utf8",
    stdio: "pipe",
  });
}
