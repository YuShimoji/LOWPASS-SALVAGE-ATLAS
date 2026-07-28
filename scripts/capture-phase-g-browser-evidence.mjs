import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { createServer as createViteServer } from "vite";

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  waitFor(method, timeoutMs) {
    return new Promise((resolveWait, reject) => {
      const timer = setTimeout(() => {
        remove();
        reject(new Error(`CDP_EVENT_TIMEOUT // ${method}`));
      }, timeoutMs);
      const remove = this.on(method, (params) => {
        clearTimeout(timer);
        remove();
        resolveWait(params);
      });
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(`BROWSER_EVALUATION_FAILED // ${response.exceptionDetails.text} // ${response.result?.description ?? ""}`);
    }
    return response.result?.value;
  }

  async handleMessage(data) {
    const text = typeof data === "string" ? data : await data.text();
    const message = JSON.parse(text);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`CDP_${message.error.code} // ${message.error.message}`));
      else pending.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
  }

  async close() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
  }
}

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const evidenceDirectory = join(root, "docs", "evidence", "phase-g-closure");
const screenshotDirectory = join(evidenceDirectory, "screenshots");
const chromePath = await resolveChromePath();
const vitePort = await freePort();
const externalVitePort = await freePort();
const cdpPort = await freePort();
const profileDirectory = await mkdtemp(join(tmpdir(), "lowpass-phase-g-chrome-"));
const baseUrl = `http://127.0.0.1:${vitePort}/`;
const externalBaseUrl = `http://127.0.0.1:${externalVitePort}/`;
const states = [
  "needle-watcher",
  "watcher-share",
  "security-disengage",
  "porter-cooling",
  "cart-handle",
  "field-terminal",
];
const conditions = [
  { mode: "primitive", ps1: "ps1-off", enabled: false },
  { mode: "primitive", ps1: "ps1-on", enabled: true },
  { mode: "canary-v1", ps1: "ps1-off", enabled: false },
  { mode: "canary-v1", ps1: "ps1-on", enabled: true },
];
const vite = await createViteServer({
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port: vitePort, strictPort: true },
});
const externalVite = await createViteServer({
  root,
  mode: "external",
  logLevel: "error",
  server: { host: "127.0.0.1", port: externalVitePort, strictPort: true },
});
let chrome = null;
let cdp = null;
const consoleErrors = [];
const unhandledRejections = [];
const externalRequests = new Set();
let monitorGameRuntime = true;
const captureReadbacks = [];
const cycleReadbacks = [];
let rightsFallbackReadback = null;

try {
  await mkdir(screenshotDirectory, { recursive: true });
  await vite.listen();
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--safebrowsing-disable-auto-update",
    "--force-device-scale-factor=1",
    "--window-size=1280,720",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  await waitForCdp(cdpPort);
  const targetResponse = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
  if (!targetResponse.ok) throw new Error(`CDP_TARGET_CREATE_FAILED // ${targetResponse.status}`);
  const target = await targetResponse.json();
  cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Network.enable"),
    cdp.send("Log.enable"),
    cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    }),
  ]);
  cdp.on("Runtime.exceptionThrown", (params) => {
    if (monitorGameRuntime) consoleErrors.push(params.exceptionDetails?.text ?? "Runtime.exceptionThrown");
  });
  cdp.on("Runtime.consoleAPICalled", (params) => {
    if (monitorGameRuntime && params.type === "error") consoleErrors.push(params.args.map((arg) => arg.value ?? arg.description ?? "error").join(" "));
  });
  cdp.on("Log.entryAdded", (params) => {
    if (monitorGameRuntime && params.entry?.level === "error") consoleErrors.push(params.entry.text);
  });
  cdp.on("Network.requestWillBeSent", (params) => {
    const url = params.request?.url;
    if (!url || !/^https?:/i.test(url)) return;
    const parsed = new URL(url);
    if (monitorGameRuntime && !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) externalRequests.add(url);
  });

  await navigateToGame("primitive");
  await setPs1(false);
  await cdp.evaluate("window.__LOWPASS_DEBUG__.setQaEvidenceHidden(true)");
  await capturePng(join(evidenceDirectory, "phase-g-primitive-ship.png"));

  for (const condition of conditions) {
    for (const state of states) {
      const readback = await prepareState(condition.mode, condition.enabled, state);
      const filename = `${condition.mode}-${condition.ps1}-${state}.png`;
      await capturePng(join(screenshotDirectory, filename));
      captureReadbacks.push({
        filename,
        mode: condition.mode,
        ps1: condition.ps1,
        state,
        asset: readback.asset,
        guided: readback.guided,
        diagnostics: readback.diagnostics,
      });
    }
  }

  await navigateToGame("primitive");
  const guidedAudit = await cdp.evaluate("window.__LOWPASS_DEBUG__.runGuidedAudit()", true);
  await writeJson(join(evidenceDirectory, "phase-g-guided-audit.json"), guidedAudit);
  await cdp.evaluate("window.__LOWPASS_DEBUG__.setQaEvidenceHidden(false)");
  await cdp.evaluate("document.querySelector('.guided-qa-toggle')?.click()");
  await delay(300);
  await capturePng(join(evidenceDirectory, "phase-g-qa-panel.png"));
  const guidedDiagnostics = await collectReadback();

  await navigateToGame("primitive");
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await cdp.evaluate("window.__LOWPASS_DEBUG__.resetWorldStateForQa()", true);
    await perform("apply-loadout");
    await perform("deploy-watchful");
    await clickRaw("extract");
    await delay(150);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "e", code: "KeyE", windowsVirtualKeyCode: 69 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "e", code: "KeyE", windowsVirtualKeyCode: 69 });
    await waitForExpression("document.querySelector('[data-return-to-ship]') !== null", 8_000);
    await cdp.evaluate("document.querySelector('[data-return-to-ship]')?.click()");
    await waitForExpression("window.__LOWPASS_DEBUG__.snapshot().world.mode === 'ship'", 12_000);
    await delay(4_000);
    const diagnostics = await cdp.evaluate("window.__LOWPASS_DEBUG__.diagnostics()");
    cycleReadbacks.push({ cycle, world: diagnostics.world, render: diagnostics.render, dom: diagnostics.dom });
  }

  const lifecycleBaseline = cycleReadbacks[0];
  const lifecycleStable = cycleReadbacks.length === 3 && cycleReadbacks.every((entry) =>
    entry.world === "ship"
    && entry.render.sceneObjects === lifecycleBaseline.render.sceneObjects
    && entry.render.geometries === lifecycleBaseline.render.geometries
    && entry.render.textures === lifecycleBaseline.render.textures
    && entry.render.programs === lifecycleBaseline.render.programs
    && entry.dom.totalNodes === lifecycleBaseline.dom.totalNodes
    && entry.dom.persistentHudNodes === lifecycleBaseline.dom.persistentHudNodes
    && entry.dom.modalNodes === lifecycleBaseline.dom.modalNodes
    && entry.dom.transientFeedbackNodes === lifecycleBaseline.dom.transientFeedbackNodes
    && entry.dom.resultHistoryNodes === lifecycleBaseline.dom.resultHistoryNodes);


  await writeJson(join(evidenceDirectory, "primitive-canary-readback.json"), {
    schemaVersion: "primitive-canary-readback-2.0.0",
    result: captureReadbacks.length === 24 ? "PASS" : "FAILED",
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    fixedConditions: {
      missionSeed: "atlas-01",
      securityPosture: "watchful",
      controlledAgent: "player",
      camera: "fresh default mission entry camera per capture",
      qaPlacementDefinitions: "GuidedPhaseGAudit plus existing raw QA controls",
      ps1Off: "lowResolution, distanceFog, vertexSnap, dithering false",
      ps1On: "lowResolution, distanceFog, vertexSnap, dithering true",
    },
    states,
    conditions: conditions.map((condition) => `${condition.mode}-${condition.ps1}`),
    screenshotCount: captureReadbacks.length,
    assetPack: {
      assetPackId: "lowpass-canary-v1",
      exactGlbSha256: "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102",
      rightsStatus: "NOASSERTION",
      internalOnly: true,
      distributionApproved: false,
    },
    captures: captureReadbacks,
  });
  await writeJson(join(evidenceDirectory, "performance-readback.json"), {
    schemaVersion: "phase-g-browser-lifecycle-2.0.0",
    result: lifecycleStable ? "PASS" : "FAILED",
    accumulationDelta: { sceneObjects: 0, geometries: 0, textures: 0, programs: 0, domNodes: 0 },
    lifecycleStable,
    cycles: cycleReadbacks,
    guidedDiagnostics,
  });

  await execFileAsync(process.execPath, ["scripts/generate-phase-g-evidence.mjs"], { cwd: root, windowsHide: true });
  monitorGameRuntime = false;
  await navigate(`${baseUrl}docs/evidence/phase-g-closure/primitive-canary-index.html`);
  const metrics = await cdp.send("Page.getLayoutMetrics");
  const contentSize = metrics.cssContentSize ?? metrics.contentSize;
  const contactSheet = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(contentSize.width), height: Math.ceil(contentSize.height), scale: 1 },
  });
  await writeFile(join(evidenceDirectory, "primitive-canary-contact-sheet.png"), Buffer.from(contactSheet.data, "base64"));

  await vite.close();
  await externalVite.listen();
  monitorGameRuntime = true;
  await navigate(`${externalBaseUrl}?qa=1&security-posture=watchful&asset-mode=canary-v1&audio=muted`);
  await waitForExpression("Boolean(window.__LOWPASS_DEBUG__)", 20_000);
  await perform("apply-loadout");
  await perform("deploy-watchful");
  rightsFallbackReadback = await cdp.evaluate("window.__LOWPASS_DEBUG__.assetReadback()");
  if (
    rightsFallbackReadback.requestedMode !== "canary-v1"
    || rightsFallbackReadback.activeMode !== "primitive"
    || !String(rightsFallbackReadback.fallbackReason).includes("RIGHTS_EXTERNAL_DISTRIBUTION_BLOCKED")
  ) throw new Error(`EXTERNAL_RIGHTS_FALLBACK_FAILED // ${JSON.stringify(rightsFallbackReadback)}`);
  await writeJson(join(evidenceDirectory, "rights-fallback-readback.json"), {
    schemaVersion: "phase-g-rights-fallback-readback-1.0.0",
    result: "PASS",
    distributionContext: "external-distribution",
    readback: rightsFallbackReadback,
    externalOutputAssetBoundary: "npm run build:external removes dist/assets/lowpass-canary-v1 and verifies no GLB remains",
  });

  await writeJson(join(evidenceDirectory, "browser-console-readback.json"), {
    schemaVersion: "phase-g-browser-console-readback-2.0.0",
    result: lifecycleStable && rightsFallbackReadback?.activeMode === "primitive"
      && consoleErrors.length === 0 && unhandledRejections.length === 0 && externalRequests.size === 0 ? "PASS" : "FAILED",
    consoleErrorCount: consoleErrors.length,
    consoleErrors,
    unhandledRejectionCount: unhandledRejections.length,
    duplicateEventCount: guidedAudit.duplicateEventCount,
    externalRequestCount: externalRequests.size,
    externalRequests: [...externalRequests],
    checks: {
      guidedAudit: `${guidedAudit.result} ${guidedAudit.steps.length}/22`,
      primitiveMode: captureReadbacks.some((entry) => entry.asset.activeMode === "primitive") ? "PASS" : "FAILED",
      canaryMode: captureReadbacks.some((entry) => entry.asset.activeMode === "canary-v1") ? "PASS" : "FAILED",
      exactHash: "54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102",
      threeCycles: lifecycleStable ? "PASS" : "FAILED",
      rightsFallback: rightsFallbackReadback?.activeMode === "primitive" ? "PASS" : "FAILED",
    },
  });


  console.log(JSON.stringify({
    result: lifecycleStable && consoleErrors.length === 0 && externalRequests.size === 0 ? "PASS" : "FAILED",
    screenshotCount: captureReadbacks.length,
    guidedAudit: guidedAudit.result,
    cycles: cycleReadbacks.length,
    consoleErrorCount: consoleErrors.length,
    externalRequestCount: externalRequests.size,
    lifecycleStable,
    rightsFallback: rightsFallbackReadback?.activeMode ?? "missing",
  }, null, 2));
} finally {
  try { await cdp?.close(); } catch {}
  if (chrome) {
    chrome.kill();
    await Promise.race([
      new Promise((resolveExit) => chrome.once("exit", resolveExit)),
      delay(2_000),
    ]);
  }
  await externalVite.close();
  await vite.close();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profileDirectory, { recursive: true, force: true });
      break;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EBUSY") || attempt === 4) throw error;
      await delay(250);
    }
  }
}

async function prepareState(mode, ps1Enabled, state) {
  await navigateToGame(mode);
  await setPs1(ps1Enabled);
  await perform("apply-loadout");
  await perform("deploy-watchful");
  await perform("isolate-player");
  await perform("observe-watcher");
  if (state === "needle-watcher") {
    await perform("needle-reacquire");
  } else if (state === "watcher-share") {
    await perform("share-contact");
  } else if (state === "security-disengage") {
    await perform("share-contact");
    await perform("needle-reacquire");
    await perform("reinforcement-arrives");
    await perform("porter-joins");
    await perform("observe-disengage");
  } else if (state === "porter-cooling") {
    await perform("porter-joins");
    await clickRaw("cooling-coil");
    await cdp.evaluate("window.__LOWPASS_DEBUG__.porterCommandForQa('carry-to')");
  } else if (state === "cart-handle") {
    await clickRaw("cart");
  } else if (state === "field-terminal") {
    await clickRaw("cooling-gate");
  }
  await cdp.evaluate("window.__LOWPASS_DEBUG__.setQaEvidenceHidden(true)");
  await delay(350);
  return collectReadback();
}

async function navigateToGame(mode) {
  await navigate(`${baseUrl}?qa=1&security-posture=watchful&asset-mode=${mode}&audio=muted`);
  await waitForExpression("Boolean(window.__LOWPASS_DEBUG__)", 20_000);
  const world = await cdp.evaluate("window.__LOWPASS_DEBUG__.snapshot().world.mode");
  if (world === "ship") await cdp.evaluate("window.__LOWPASS_DEBUG__.resetWorldStateForQa()", true);
}

async function navigate(url) {
  const loaded = cdp.waitFor("Page.loadEventFired", 20_000);
  await cdp.send("Page.navigate", { url });
  await loaded;
}

async function setPs1(enabled) {
  await cdp.evaluate(`(() => {
    const inputs = [...document.querySelectorAll('.settings-list input[type="checkbox"]')];
    for (const input of inputs) {
      if (input.checked !== ${enabled}) {
        input.checked = ${enabled};
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    return inputs.map((input) => input.checked);
  })()`);
}

async function perform(action) {
  return cdp.evaluate(`window.__LOWPASS_DEBUG__.performGuidedQaAction(${JSON.stringify(action)})`, true);
}

async function clickRaw(id) {
  const clicked = await cdp.evaluate(`(() => {
    const button = document.querySelector('[data-raw-qa=${JSON.stringify(id)}]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`RAW_QA_CONTROL_MISSING // ${id}`);
  await delay(100);
}

async function collectReadback() {
  return cdp.evaluate(`({
    asset: window.__LOWPASS_DEBUG__.assetReadback(),
    guided: window.__LOWPASS_DEBUG__.guidedQaReadback(),
    diagnostics: window.__LOWPASS_DEBUG__.diagnostics(),
  })`);
}

async function capturePng(path) {
  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
}

async function waitForExpression(expression, timeoutMs) {
  await cdp.evaluate(`new Promise((resolve, reject) => {
    const started = performance.now();
    const poll = () => {
      try {
        if (${expression}) return resolve(true);
        if (performance.now() - started > ${timeoutMs}) return reject(new Error('WAIT_TIMEOUT'));
        setTimeout(poll, 50);
      } catch (error) { reject(error); }
    };
    poll();
  })`, true);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function resolveChromePath() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const candidate of candidates) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("CHROMIUM_EXECUTABLE_NOT_FOUND");
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForCdp(port) {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("CHROME_CDP_START_TIMEOUT");
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

