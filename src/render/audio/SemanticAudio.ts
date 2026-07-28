export type SemanticAudioCueId =
  | "gate.accepted"
  | "gate.rejected"
  | "squad.accepted"
  | "squad.rejected"
  | "contact.detected"
  | "contact.lock-pulse"
  | "contact.disengaged"
  | "contact.interdicted"
  | "hostile.share-transmit"
  | "hostile.share-receive"
  | "relay.deployed"
  | "relay.disabled"
  | "relay.restarted"
  | "flare.deployed"
  | "porter.authenticated"
  | "porter.operational-pulse"
  | "porter.rejected";

interface ToneSpec {
  readonly frequency: number;
  readonly endFrequency?: number;
  readonly offsetSeconds: number;
  readonly durationSeconds: number;
  readonly oscillator: OscillatorType;
  readonly gain: number;
}

export interface SemanticAudioCue {
  readonly id: SemanticAudioCueId;
  readonly caption: string;
  readonly minIntervalMs: number;
  readonly tones: readonly ToneSpec[];
}

export interface SemanticAudioAuditEntry {
  readonly cueId: SemanticAudioCueId;
  readonly caption: string;
  readonly requestedAtMs: number;
  readonly outcome: "played" | "muted" | "rate-limited" | "context-unavailable";
}

export interface SemanticAudioReadback {
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly contextState: AudioContextState | "not-created" | "unavailable";
  readonly cueCount: number;
  readonly events: readonly SemanticAudioAuditEntry[];
}

export const SEMANTIC_AUDIO_CUES: readonly SemanticAudioCue[] = [
  cue("gate.accepted", "Gate accepted", 180, [[520, 760], [760, 900]]),
  cue("gate.rejected", "Gate rejected", 220, [[150, 112], [112, 82]]),
  cue("squad.accepted", "Squad command accepted", 120, [[420, 610], [610, 720]]),
  cue("squad.rejected", "Squad command rejected", 180, [[180, 140], [140, 104]]),
  cue("contact.detected", "Hostile contact detected", 450, [[240, 520], [520, 760]]),
  cue("contact.lock-pulse", "Hostile lock tightening", 120, [[280, 700]]),
  cue("contact.disengaged", "Hostile contact disengaged", 260, [[360, 150]]),
  cue("contact.interdicted", "Agent interdicted", 260, [[170, 70], [95, 58]]),
  cue("hostile.share-transmit", "Hostile contact transmitted", 140, [[920, 1240]]),
  cue("hostile.share-receive", "Hostile contact received", 140, [[520, 690]]),
  cue("relay.deployed", "Relay deployed", 240, [[330, 660], [660, 820]]),
  cue("relay.disabled", "Relay disabled", 260, [[260, 86], [110, 72]]),
  cue("relay.restarted", "Relay restart initiated", 260, [[180, 420], [420, 680]]),
  cue("flare.deployed", "Signal flare deployed", 300, [[410, 960], [720, 1180]]),
  cue("porter.authenticated", "Porter authenticated", 300, [[180, 310], [310, 520]]),
  cue("porter.operational-pulse", "Friendly porter operational", 1_400, [[108, 108]]),
  cue("porter.rejected", "Porter command rejected", 300, [[120, 62], [90, 54]]),
] as const;

const CUE_BY_ID = new Map(SEMANTIC_AUDIO_CUES.map((entry) => [entry.id, entry]));

export interface SemanticAudioOptions {
  readonly enabled?: boolean;
  readonly onCaption?: (caption: string, cueId: SemanticAudioCueId) => void;
  readonly now?: () => number;
  readonly contextFactory?: () => AudioContext;
}

export class SemanticAudio {
  private context: AudioContext | null = null;
  private contextUnavailable = false;
  private muted: boolean;
  private readonly lastPlayedAt = new Map<SemanticAudioCueId, number>();
  private readonly events: SemanticAudioAuditEntry[] = [];
  private readonly now: () => number;

  constructor(private readonly options: SemanticAudioOptions = {}) {
    this.muted = options.enabled === false;
    this.now = options.now ?? (() => performance.now());
  }

  play(cueId: SemanticAudioCueId): SemanticAudioAuditEntry {
    const definition = CUE_BY_ID.get(cueId);
    if (!definition) throw new Error(`Unknown semantic audio cue: ${cueId}`);
    const requestedAtMs = this.now();
    if (this.muted) return this.record(definition, requestedAtMs, "muted");
    const lastPlayedAt = this.lastPlayedAt.get(cueId) ?? Number.NEGATIVE_INFINITY;
    if (requestedAtMs - lastPlayedAt < definition.minIntervalMs) {
      return this.record(definition, requestedAtMs, "rate-limited");
    }
    const context = this.ensureContext();
    if (!context) return this.record(definition, requestedAtMs, "context-unavailable");
    if (context.state === "suspended") void context.resume();
    this.lastPlayedAt.set(cueId, requestedAtMs);
    this.options.onCaption?.(definition.caption, cueId);
    for (const tone of definition.tones) this.scheduleTone(context, tone);
    return this.record(definition, requestedAtMs, "played");
  }

  async unlock(): Promise<boolean> {
    if (this.muted) return false;
    const context = this.ensureContext();
    if (!context) return false;
    if (context.state === "suspended") await context.resume();
    return context.state === "running";
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  getReadback(): SemanticAudioReadback {
    return {
      enabled: this.options.enabled !== false,
      muted: this.muted,
      contextState: this.context?.state ?? (this.contextUnavailable ? "unavailable" : "not-created"),
      cueCount: SEMANTIC_AUDIO_CUES.length,
      events: [...this.events],
    };
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || this.contextUnavailable) return null;
    try {
      this.context ??= this.options.contextFactory?.() ?? new AudioContext();
      return this.context;
    } catch {
      this.contextUnavailable = true;
      return null;
    }
  }

  private scheduleTone(context: AudioContext, tone: ToneSpec): void {
    const start = context.currentTime + tone.offsetSeconds;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.oscillator;
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    if (tone.endFrequency && tone.endFrequency !== tone.frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, tone.endFrequency),
        start + tone.durationSeconds,
      );
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.durationSeconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + tone.durationSeconds + 0.02);
  }

  private record(
    cueDefinition: SemanticAudioCue,
    requestedAtMs: number,
    outcome: SemanticAudioAuditEntry["outcome"],
  ): SemanticAudioAuditEntry {
    const entry = {
      cueId: cueDefinition.id,
      caption: cueDefinition.caption,
      requestedAtMs,
      outcome,
    } satisfies SemanticAudioAuditEntry;
    this.events.push(entry);
    if (this.events.length > 128) this.events.splice(0, this.events.length - 128);
    return entry;
  }
}

function cue(
  id: SemanticAudioCueId,
  caption: string,
  minIntervalMs: number,
  sweeps: readonly (readonly [number, number])[],
): SemanticAudioCue {
  return {
    id,
    caption,
    minIntervalMs,
    tones: sweeps.map(([frequency, endFrequency], index) => ({
      frequency,
      endFrequency,
      offsetSeconds: index * 0.075,
      durationSeconds: 0.09 + index * 0.025,
      oscillator: index % 2 === 0 ? "square" : "triangle",
      gain: 0.026,
    })),
  };
}
