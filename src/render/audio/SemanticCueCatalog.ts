export type SemanticCueId =
  | "watcher-contact"
  | "share-transmit"
  | "share-receive"
  | "needle-reacquired"
  | "lock-on-warning"
  | "interference-pulse"
  | "reinforcement-accepted"
  | "cautious-transition"
  | "outnumbered-transition"
  | "cell-disengage"
  | "relay-sabotage-start"
  | "relay-disabled"
  | "relay-restarted"
  | "porter-authenticated"
  | "porter-carry-accepted"
  | "flare-deployed"
  | "flare-observed";

export type SemanticAudioState = "enabled" | "suspended" | "muted";

export interface SemanticCueDefinition {
  readonly id: SemanticCueId;
  readonly label: string;
  readonly fromHz: number;
  readonly toHz: number;
  readonly durationSeconds: number;
  readonly peakGain: number;
  readonly waveform: OscillatorType;
  readonly pulses: number;
  readonly rateLimitSeconds: number;
}

export const SEMANTIC_CUE_INVENTORY: readonly SemanticCueDefinition[] = [
  cue("watcher-contact", "WATCHER CONTACT DETECTED", 620, 820, 0.13, 0.045, "sine"),
  cue("share-transmit", "HOSTILE SHARE TRANSMIT", 760, 1280, 0.14, 0.04, "square", 2),
  cue("share-receive", "HOSTILE SHARE RECEIVE", 610, 430, 0.16, 0.036, "triangle", 2),
  cue("needle-reacquired", "NEEDLE DIRECT RE-ACQUISITION", 1320, 980, 0.09, 0.045, "square"),
  cue("lock-on-warning", "LOCK-ON WARNING", 340, 760, 0.08, 0.04, "square", 1, 0.14),
  cue("interference-pulse", "INTERFERENCE PULSE", 180, 58, 0.18, 0.05, "sawtooth", 2),
  cue("reinforcement-accepted", "REINFORCEMENT ACCEPTED", 360, 540, 0.16, 0.034, "triangle"),
  cue("cautious-transition", "SECURITY CELL RE-EVALUATING", 510, 420, 0.15, 0.032, "triangle", 2),
  cue("outnumbered-transition", "SECURITY CELL OUTNUMBERED", 420, 170, 0.26, 0.042, "sine"),
  cue("cell-disengage", "SECURITY CELL DISENGAGING", 330, 120, 0.3, 0.045, "triangle"),
  cue("relay-sabotage-start", "RELAY SABOTAGE STARTED", 210, 130, 0.24, 0.042, "square", 4),
  cue("relay-disabled", "RELAY DISABLED", 160, 70, 0.2, 0.045, "sawtooth"),
  cue("relay-restarted", "RELAY RESTORED", 260, 520, 0.28, 0.038, "sine", 2),
  cue("porter-authenticated", "PORTER AUTHENTICATED", 170, 290, 0.2, 0.032, "sine"),
  cue("porter-carry-accepted", "PORTER CARRY ACCEPTED", 120, 190, 0.16, 0.028, "triangle"),
  cue("flare-deployed", "FLARE DEPLOYED", 720, 1120, 0.18, 0.038, "sine"),
  cue("flare-observed", "FLARE OBSERVED", 980, 760, 0.13, 0.034, "triangle"),
] as const;

function cue(
  id: SemanticCueId,
  label: string,
  fromHz: number,
  toHz: number,
  durationSeconds: number,
  peakGain: number,
  waveform: OscillatorType,
  pulses = 1,
  rateLimitSeconds = 0.22,
): SemanticCueDefinition {
  return { id, label, fromHz, toHz, durationSeconds, peakGain, waveform, pulses, rateLimitSeconds };
}
