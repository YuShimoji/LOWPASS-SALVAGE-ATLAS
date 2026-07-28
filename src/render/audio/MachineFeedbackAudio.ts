import type { HostileDroneMode, PorterAndroidMode } from "../../game/machines/machineTypes";
import {
  SEMANTIC_CUE_INVENTORY,
  type SemanticAudioState,
  type SemanticCueDefinition,
  type SemanticCueId,
} from "./SemanticCueCatalog";

export {
  SEMANTIC_CUE_INVENTORY,
  type SemanticAudioState,
  type SemanticCueDefinition,
  type SemanticCueId,
} from "./SemanticCueCatalog";

const CUE_BY_ID = new Map(SEMANTIC_CUE_INVENTORY.map((entry) => [entry.id, entry]));

export class MachineFeedbackAudio {
  private context: AudioContext | null = null;
  private readonly lastCueAtSeconds = new Map<SemanticCueId, number>();
  private lastLockPulse = Number.NEGATIVE_INFINITY;
  private lastMode = "";
  private lastPorterMode = "";

  constructor(
    private readonly enabled: boolean,
    private readonly onCaption: (cueId: SemanticCueId, label: string) => void = () => undefined,
  ) {}

  getState(): SemanticAudioState {
    if (!this.enabled) return "muted";
    return this.context?.state === "suspended" ? "suspended" : "enabled";
  }

  async resume(): Promise<SemanticAudioState> {
    const context = this.ensureContext();
    if (context?.state === "suspended") await context.resume();
    return this.getState();
  }

  playCue(cueId: SemanticCueId, elapsedSeconds = performance.now() / 1000, force = false): boolean {
    if (!this.enabled) return false;
    const definition = CUE_BY_ID.get(cueId);
    if (!definition) return false;
    const previous = this.lastCueAtSeconds.get(cueId) ?? Number.NEGATIVE_INFINITY;
    if (!force && elapsedSeconds - previous < definition.rateLimitSeconds) return false;
    const context = this.ensureContext();
    if (!context) return false;
    this.lastCueAtSeconds.set(cueId, elapsedSeconds);
    this.playDefinition(context, definition);
    this.onCaption(cueId, definition.label);
    return true;
  }

  update(mode: HostileDroneMode, lockProgress: number, elapsedSeconds: number): void {
    if (!this.enabled) return;
    if (mode === "lock-on") {
      const interval = 0.58 - Math.min(1, lockProgress) * 0.4;
      if (elapsedSeconds - this.lastLockPulse >= interval) {
        this.playCue("lock-on-warning", elapsedSeconds);
        this.lastLockPulse = elapsedSeconds;
      }
    }
    if (mode !== this.lastMode) {
      if (mode === "disengage") this.playCue("cell-disengage", elapsedSeconds);
      if (mode === "interdict") this.playCue("interference-pulse", elapsedSeconds);
      this.lastMode = mode;
    }
  }

  updatePorter(mode: PorterAndroidMode, elapsedSeconds: number): void {
    if (!this.enabled) return;
    if (mode !== this.lastPorterMode) {
      if (mode === "carrying") this.playCue("porter-carry-accepted", elapsedSeconds);
      if (mode === "path-failed") this.playCue("porter-path-failed", elapsedSeconds);
      if (mode === "gate-rejected") this.playCue("porter-gate-rejected", elapsedSeconds);
      this.lastPorterMode = mode;
    }
  }

  playPorterAuthenticated(elapsedSeconds = performance.now() / 1000): void {
    this.playCue("porter-authenticated", elapsedSeconds);
  }

  playPorterCommandAccepted(elapsedSeconds = performance.now() / 1000): void {
    this.playCue("porter-command-accepted", elapsedSeconds);
  }

  playHostileShareTransmit(): void {
    this.playCue("share-transmit");
  }

  playHostileShareReceive(): void {
    this.playCue("share-receive");
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.lastCueAtSeconds.clear();
  }

  private playDefinition(context: AudioContext, definition: SemanticCueDefinition): void {
    if (context.state === "suspended") void context.resume();
    const pulseDuration = definition.durationSeconds / definition.pulses;
    for (let index = 0; index < definition.pulses; index += 1) {
      const startsAt = context.currentTime + index * pulseDuration;
      const endsAt = startsAt + pulseDuration * 0.72;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const progress = definition.pulses === 1 ? 0 : index / (definition.pulses - 1);
      const startFrequency = definition.fromHz + (definition.toHz - definition.fromHz) * progress;
      const endFrequency = definition.fromHz + (definition.toHz - definition.fromHz) * Math.min(1, progress + 1 / definition.pulses);
      oscillator.type = definition.waveform;
      oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), startsAt);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), endsAt);
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(definition.peakGain, startsAt + Math.min(0.012, pulseDuration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startsAt);
      oscillator.stop(endsAt);
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    this.context ??= new AudioContext();
    return this.context;
  }
}

export interface SemanticCueWaveformAudit {
  readonly id: SemanticCueId;
  readonly label: string;
  readonly sampleRate: number;
  readonly durationSeconds: number;
  readonly peak: number;
  readonly nonSilent: boolean;
  readonly clipped: boolean;
  readonly fingerprint: string;
}

export function auditSemanticCueWaveforms(sampleRate = 24_000): readonly SemanticCueWaveformAudit[] {
  return SEMANTIC_CUE_INVENTORY.map((definition) => {
    const samples = renderSemanticCueSamples(definition.id, sampleRate);
    let peak = 0;
    let energy = 0;
    let hash = 2166136261;
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
      hash ^= Math.round((sample + 1) * 32767);
      hash = Math.imul(hash, 16777619);
    }
    return {
      id: definition.id,
      label: definition.label,
      sampleRate,
      durationSeconds: samples.length / sampleRate,
      peak,
      nonSilent: energy > 0.00001,
      clipped: peak >= 0.98,
      fingerprint: `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`,
    };
  });
}

export function renderSemanticCueSamples(cueId: SemanticCueId, sampleRate = 24_000): Float32Array {
  const definition = CUE_BY_ID.get(cueId);
  if (!definition) throw new Error(`UNKNOWN_SEMANTIC_CUE:${cueId}`);
  const length = Math.max(1, Math.ceil(definition.durationSeconds * sampleRate));
  const samples = new Float32Array(length);
  const pulseSamples = length / definition.pulses;
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const globalProgress = index / Math.max(1, length - 1);
    const pulsePosition = (index % pulseSamples) / pulseSamples;
    if (pulsePosition > 0.72) continue;
    const envelope = Math.sin(Math.PI * Math.min(1, pulsePosition / 0.72)) ** 1.4;
    const frequency = definition.fromHz * ((definition.toHz / definition.fromHz) ** globalProgress);
    const phase = Math.PI * 2 * frequency * t;
    const raw = definition.waveform === "square"
      ? Math.sign(Math.sin(phase))
      : definition.waveform === "sawtooth"
        ? 2 * ((frequency * t) % 1) - 1
        : definition.waveform === "triangle"
          ? 2 * Math.abs(2 * ((frequency * t) % 1) - 1) - 1
          : Math.sin(phase);
    samples[index] = raw * definition.peakGain * envelope;
  }
  return samples;
}
