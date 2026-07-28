import { describe, expect, it } from "vitest";
import { SEMANTIC_AUDIO_CUES, SemanticAudio } from "./SemanticAudio";

describe("SemanticAudio", () => {
  it("keeps the Phase G semantic cue vocabulary complete and stable", () => {
    expect(SEMANTIC_AUDIO_CUES).toHaveLength(17);
    expect(new Set(SEMANTIC_AUDIO_CUES.map((cue) => cue.id)).size).toBe(17);
    expect(SEMANTIC_AUDIO_CUES.every((cue) => cue.caption.length > 0)).toBe(true);
  });

  it("records muted playback without creating an AudioContext", () => {
    let contextCreations = 0;
    const audio = new SemanticAudio({
      enabled: false,
      contextFactory: () => {
        contextCreations += 1;
        throw new Error("must not create");
      },
    });
    expect(audio.play("gate.accepted").outcome).toBe("muted");
    expect(contextCreations).toBe(0);
    expect(audio.getReadback()).toMatchObject({
      muted: true,
      contextState: "not-created",
      cueCount: 17,
    });
  });

  it("rate-limits repeated semantic cues and keeps their audit outcomes", () => {
    let now = 1_000;
    const fakeContext = {
      state: "running",
      currentTime: 0,
      destination: {},
      createOscillator: () => ({
        type: "square",
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() { return this; },
        start() {},
        stop() {},
      }),
      createGain: () => ({
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() { return this; },
      }),
      resume: async () => {},
      close: async () => {},
    } as unknown as AudioContext;
    const audio = new SemanticAudio({
      now: () => now,
      contextFactory: () => fakeContext,
    });
    expect(audio.play("contact.detected").outcome).toBe("played");
    now += 100;
    expect(audio.play("contact.detected").outcome).toBe("rate-limited");
    now += 500;
    expect(audio.play("contact.detected").outcome).toBe("played");
    expect(audio.getReadback().events.map((event) => event.outcome)).toEqual([
      "played",
      "rate-limited",
      "played",
    ]);
  });
});
