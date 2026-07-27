import { afterEach, describe, expect, it, vi } from "vitest";
import {
  auditSemanticCueWaveforms,
  MachineFeedbackAudio,
  SEMANTIC_CUE_INVENTORY,
  type SemanticCueId,
} from "./MachineFeedbackAudio";

class FakeAudioParam {
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
}

class FakeAudioNode {
  connect(): this {
    return this;
  }
}

class FakeOscillator extends FakeAudioNode {
  type: OscillatorType = "sine";
  readonly frequency = new FakeAudioParam();
  start(): void {}
  stop(): void {}
}

class FakeGain extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

class FakeAudioContext {
  state: AudioContextState = "suspended";
  currentTime = 0;
  readonly destination = new FakeAudioNode();
  readonly resume = vi.fn(() => Promise.resolve().then(() => {
    this.state = "running";
  }));
  readonly close = vi.fn(async () => undefined);
  createOscillator(): FakeOscillator {
    return new FakeOscillator();
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("semantic machine audio", () => {
  it("maps every required event to a distinct non-silent, unclipped waveform", () => {
    const audits = auditSemanticCueWaveforms();
    expect(audits).toHaveLength(17);
    expect(audits.every((entry) => entry.nonSilent && !entry.clipped)).toBe(true);
    expect(audits.every((entry) => entry.durationSeconds >= 0.08 && entry.durationSeconds <= 0.35)).toBe(true);
    expect(new Set(audits.map((entry) => entry.fingerprint)).size).toBe(audits.length);
    expect(new Set(SEMANTIC_CUE_INVENTORY.map((entry) => entry.id))).toEqual(new Set<SemanticCueId>([
      "watcher-contact",
      "share-transmit",
      "share-receive",
      "needle-reacquired",
      "lock-on-warning",
      "interference-pulse",
      "reinforcement-accepted",
      "cautious-transition",
      "outnumbered-transition",
      "cell-disengage",
      "relay-sabotage-start",
      "relay-disabled",
      "relay-restarted",
      "porter-authenticated",
      "porter-carry-accepted",
      "flare-deployed",
      "flare-observed",
    ]));
  });

  it("rate-limits duplicate cues and pairs each accepted cue with a caption", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const captions = vi.fn();
    const audio = new MachineFeedbackAudio(true, captions);
    expect(audio.playCue("watcher-contact", 10)).toBe(true);
    expect(audio.playCue("watcher-contact", 10.1)).toBe(false);
    expect(audio.playCue("watcher-contact", 10.3)).toBe(true);
    expect(captions).toHaveBeenCalledTimes(2);
    audio.dispose();
  });

  it("honors mute and resumes a suspended context after user action", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const muted = new MachineFeedbackAudio(false);
    expect(muted.getState()).toBe("muted");
    expect(muted.playCue("flare-deployed", 1)).toBe(false);

    const enabled = new MachineFeedbackAudio(true);
    expect(enabled.playCue("flare-deployed", 1)).toBe(true);
    expect(enabled.getState()).toBe("suspended");
    await expect(enabled.resume()).resolves.toBe("enabled");
    enabled.dispose();
  });

  it("announces an accepted Porter carry transition once instead of pulsing continuously", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const captions = vi.fn();
    const audio = new MachineFeedbackAudio(true, captions);

    audio.updatePorter("friendly-idle", 1);
    audio.updatePorter("moving-to-item", 2);
    audio.updatePorter("moving-to-item", 8);
    audio.updatePorter("carrying", 9);

    expect(captions.mock.calls.map((call) => call[0])).toEqual([
      "porter-carry-accepted",
      "porter-carry-accepted",
    ]);
    audio.dispose();
  });
});
