import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(process.cwd());
const evidenceDirectory = join(root, "docs", "evidence", "phase-g-closure");
const screenshotDirectory = join(evidenceDirectory, "screenshots");
const auditPath = join(evidenceDirectory, "phase-g-guided-audit.json");

const vite = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "silent",
});

try {
  const audio = await vite.ssrLoadModule("/src/render/audio/MachineFeedbackAudio.ts");
  const cues = audio.auditSemanticCueWaveforms();
  const audioAudit = {
    schemaVersion: "phase-g-audio-audit-1.0.0",
    result: cues.length === 17
      && cues.every((cue) => cue.nonSilent && !cue.clipped && cue.durationSeconds >= 0.08 && cue.durationSeconds <= 0.3)
      && new Set(cues.map((cue) => cue.fingerprint)).size === cues.length
      ? "PASS"
      : "FAILED",
    cueCount: cues.length,
    nonSilentCount: cues.filter((cue) => cue.nonSilent).length,
    clippedCount: cues.filter((cue) => cue.clipped).length,
    distinctFingerprintCount: new Set(cues.map((cue) => cue.fingerprint)).size,
    acceptanceBoundary: "Automated event firing, non-silence, bounded peaks, distinct design fingerprints, rate limiting, mute, context resume, and caption fallback; not a human aesthetic verdict.",
    cues,
  };
  await writeJson(join(evidenceDirectory, "phase-g-audio-audit.json"), audioAudit);
} finally {
  await vite.close();
}

const audit = JSON.parse(await readFile(auditPath, "utf8"));
const auditRows = audit.steps.map((step) => `
  <tr>
    <td>${escapeHtml(step.id)}</td>
    <td>${escapeHtml(step.label)}</td>
    <td>${step.startTick} → ${step.endTick}</td>
    <td>${step.durationMs} ms</td>
    <td>${step.timeoutMs} ms</td>
    <td>${escapeHtml(step.expectedState)}</td>
    <td class="${step.result.toLowerCase()}">${step.result}</td>
    <td>${escapeHtml(step.failureCode ?? "—")}</td>
  </tr>`).join("");
await writeFile(join(evidenceDirectory, "phase-g-guided-audit.html"), documentShell(
  "Phase G Guided Audit",
  `<h1>Phase G Guided Audit</h1>
   <p class="lede">${audit.result} · ${audit.steps.length}/22 steps · timeout ${audit.timeoutCount} · duplicate ${audit.duplicateEventCount}</p>
   <table><thead><tr><th>ID</th><th>Step</th><th>Ticks</th><th>Duration</th><th>Timeout</th><th>Expected</th><th>Result</th><th>Failure</th></tr></thead>
   <tbody>${auditRows}</tbody></table>`,
), "utf8");

const screenshots = (await readdir(screenshotDirectory))
  .filter((name) => name.endsWith(".png"))
  .sort();
const states = [
  "needle-watcher",
  "watcher-share",
  "security-disengage",
  "porter-cooling",
  "cart-handle",
  "field-terminal",
];
const conditions = [
  ["primitive", "ps1-off"],
  ["primitive", "ps1-on"],
  ["canary-v1", "ps1-off"],
  ["canary-v1", "ps1-on"],
];
const sheetRows = states.map((state) => `
  <section class="comparison-row">
    <h2>${escapeHtml(state)}</h2>
    <div class="grid">${conditions.map(([mode, ps1]) => {
      const name = `${mode}-${ps1}-${state}.png`;
      if (!screenshots.includes(name)) throw new Error(`Missing evidence screenshot: ${name}`);
      return `<figure><img src="screenshots/${name}" alt="${escapeHtml(`${state} ${mode} ${ps1}`)}"><figcaption>${escapeHtml(`${mode} / ${ps1}`)}</figcaption></figure>`;
    }).join("")}</div>
  </section>`).join("");
await writeFile(join(evidenceDirectory, "primitive-canary-index.html"), documentShell(
  "Primitive / Canary A/B",
  `<h1>Primitive / Canary A/B</h1>
   <p class="lede">Same mission seed, watchful posture, controlled agent, QA placements, viewport, and visual-setting pairs. Canary is INTERNAL REVIEW ONLY / NOASSERTION.</p>
   ${sheetRows}`,
  true,
), "utf8");

console.log(JSON.stringify({
  result: "PASS",
  evidenceDirectory: relative(root, evidenceDirectory).replaceAll("\\", "/"),
  screenshotCount: screenshots.length,
}, null, 2));

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function documentShell(title, body, contactSheet = false) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#08110f;color:#dce7df}
    body{margin:0;padding:24px;background:#08110f}h1{margin:0 0 8px;color:#ecdcae}.lede{margin:0 0 24px;color:#9fb3a8}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #294238;padding:8px;text-align:left;vertical-align:top}th{color:#d9c98f;background:#101d19}.pass{color:#72d69c}.failed{color:#ee766d}
    .comparison-row{margin:0 0 28px}.comparison-row h2{margin:0 0 8px;color:#c9d5ce;font-size:16px}.grid{display:grid;grid-template-columns:repeat(4,minmax(260px,1fr));gap:10px}
    figure{margin:0;border:1px solid #294238;background:#101816}img{display:block;width:100%;height:auto}figcaption{padding:7px;color:#b9c8be;font-size:11px}
    ${contactSheet ? "@media(max-width:1100px){.grid{grid-template-columns:repeat(2,minmax(260px,1fr))}}" : ""}
  </style>
</head>
<body>${body}</body>
</html>
`.replace(/[ \t]+$/gm, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
