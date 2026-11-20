// Fixed-framing screenshots for the control/visual quality slice.
// Usage: node scripts/capture-feel-visual-evidence.mjs <outDir> <label>
// Captures the same camera poses every run so before/after images can be compared 1:1.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer as createViteServer } from "vite";

const root = resolve(process.cwd());
const outDirectory = resolve(root, process.argv[2] ?? "docs/evidence/feel-visual-capture");
const label = process.argv[3] ?? "capture";

// Framings chosen to match docs/concept-art/visual-overhaul-v1 01 (market) and 02 (deck).
// yaw/pitch/distance are ThirdPersonCamera parameters; player is placed with teleportForQa.
// Squad staged ahead of the player like keyframe 01 (QA placement only; no rule change).
const MARKET_AGENTS = [{ id: "mara", x: -1.7, z: 0.3 }, { id: "ito", x: 0.9, z: -1.3 }];
const SHOTS = [
  { id: "ship-deck", mode: "primitive", world: "ship", player: { x: -0.7, z: 0.6 }, facing: 0, camera: { yaw: -0.22, pitch: 0.3, distance: 4.4 }, hud: false },
  { id: "ship-start-hud", mode: "primitive", world: "ship", player: null, facing: null, camera: null, hud: true },
  { id: "market-keyframe-primitive", mode: "primitive", world: "mission", player: { x: 0.4, z: 2.5 }, agents: MARKET_AGENTS, facing: 0, camera: { yaw: 0.1, pitch: 0.06, distance: 3.0 }, hud: false },
  { id: "market-keyframe-canary", mode: "canary-v1", world: "mission", player: { x: 0.4, z: 2.5 }, agents: MARKET_AGENTS, facing: 0, camera: { yaw: 0.1, pitch: 0.06, distance: 3.0 }, hud: false },
  { id: "market-start-hud-canary", mode: "canary-v1", world: "mission", player: null, facing: null, camera: null, hud: true },
];

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message}`));
        else done(message.result);
      } else if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((done, reject) => {
      socket.addEventListener("open", done, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((done, reject) => {
      this.pending.set(id, { resolve: done, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const set = this.listeners.get(method) ?? new Set();
    set.add(listener);
    this.listeners.set(method, set);
    return () => set.delete(listener);
  }

  waitFor(method, timeoutMs) {
    return new Promise((done, reject) => {
      const timer = setTimeout(() => {
        remove();
        reject(new Error(`CDP_EVENT_TIMEOUT // ${method}`));
      }, timeoutMs);
      const remove = this.on(method, (params) => {
        clearTimeout(timer);
        remove();
        done(params);
      });
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const response = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result.value;
  }
}

const chromePath = await resolveChromePath();
const vitePort = await freePort();
const cdpPort = await freePort();
const profileDirectory = await mkdtemp(join(tmpdir(), "lowpass-feel-visual-chrome-"));
const baseUrl = `http://127.0.0.1:${vitePort}/`;
const vite = await createViteServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: vitePort, strictPort: true } });
let chrome = null;
let cdp = null;
const consoleErrors = [];
const readbacks = [];

try {
  await mkdir(outDirectory, { recursive: true });
  await vite.listen();
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--force-device-scale-factor=1",
    "--window-size=1280,720",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  await waitForCdp(cdpPort);
  const targetResponse = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
  const target = await targetResponse.json();
  cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }),
  ]);
  cdp.on("Runtime.exceptionThrown", (params) => consoleErrors.push(params.exceptionDetails?.text ?? "exception"));

  for (const shot of SHOTS) {
    await navigate(`${baseUrl}?qa=1&security-posture=watchful&asset-mode=${shot.mode}&audio=muted&render=full`);
    await waitForExpression("Boolean(window.__LOWPASS_DEBUG__)", 20_000);
    if (await cdp.evaluate("window.__LOWPASS_DEBUG__.snapshot().world.mode") === "ship") {
      await cdp.evaluate("window.__LOWPASS_DEBUG__.resetWorldStateForQa()", true);
    }
    await cdp.evaluate("window.__LOWPASS_DEBUG__.setQaEvidenceHidden(true)");
    if (shot.world === "mission") {
      await cdp.evaluate("window.__LOWPASS_DEBUG__.performGuidedQaAction('apply-loadout')", true);
      await cdp.evaluate("window.__LOWPASS_DEBUG__.performGuidedQaAction('deploy-watchful')", true);
      await cdp.evaluate("window.__LOWPASS_DEBUG__.setQaEvidenceHidden(true)");
    }
    for (const agent of shot.agents ?? []) await cdp.evaluate(`window.__LOWPASS_DEBUG__.setAgentPositionForQa(${JSON.stringify(agent.id)}, ${agent.x}, ${agent.z})`);
    if (shot.player) await cdp.evaluate(`window.__LOWPASS_DEBUG__.teleportForQa(${shot.player.x}, ${shot.player.z})`);
    if (shot.camera) {
      await cdp.evaluate(`window.__LOWPASS_DEBUG__.setCameraPoseForQa(${shot.camera.yaw}, ${shot.camera.pitch}, ${shot.camera.distance}, ${shot.facing ?? "undefined"})`);
    }
    await cdp.evaluate(`(() => {
      let style = document.getElementById('capture-hud-visibility');
      if (!style) { style = document.createElement('style'); style.id = 'capture-hud-visibility'; document.head.append(style); }
      style.textContent = ${shot.hud ? "''" : "'#app > :not(canvas) { visibility: hidden !important; }'"};
    })()`);
    await delay(2_500);
    const path = join(outDirectory, `${shot.id}-${label}.png`);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await writeFile(path, Buffer.from(screenshot.data, "base64"));
    const diagnostics = await cdp.evaluate("window.__LOWPASS_DEBUG__.diagnostics()");
    readbacks.push({ shot: shot.id, label, world: diagnostics.world, render: diagnostics.render, camera: diagnostics.camera });
  }
  await writeFile(join(outDirectory, `capture-readback-${label}.json`), `${JSON.stringify({ label, consoleErrors, readbacks }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ label, shots: readbacks.length, consoleErrors: consoleErrors.length }));
} finally {
  cdp?.socket.close();
  if (chrome) {
    chrome.kill();
    await Promise.race([new Promise((done) => chrome.once("exit", done)), delay(3_000)]);
  }
  await vite.close();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profileDirectory, { recursive: true, force: true });
      break;
    } catch {
      await delay(250);
    }
  }
}

async function navigate(url) {
  const loaded = cdp.waitFor("Page.loadEventFired", 20_000);
  await cdp.send("Page.navigate", { url });
  await loaded;
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

async function resolveChromePath() {
  for (const candidate of [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ]) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("CHROMIUM_EXECUTABLE_NOT_FOUND");
}

async function freePort() {
  return new Promise((done, reject) => {
    const server = createNetServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => done(port));
    });
  });
}

async function waitForCdp(port) {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("CHROME_CDP_START_TIMEOUT");
}

function delay(ms) {
  return new Promise((done) => setTimeout(done, ms));
}
