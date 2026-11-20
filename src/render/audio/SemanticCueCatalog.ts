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
  | "porter-command-accepted"
  | "porter-carry-accepted"
  | "porter-path-failed"
  | "porter-gate-rejected"
  | "flare-deployed"
  | "flare-observed";

export type SemanticAudioState = "enabled" | "suspended" | "muted";

export interface SemanticCueDefinition {
  readonly id: SemanticCueId;
  /** Developer/QA label (QA buttons, audit readback). Not shown to players. */
  readonly label: string;
  /** Player-facing subtitle shown when the cue plays. */
  readonly caption: string;
  readonly fromHz: number;
  readonly toHz: number;
  readonly durationSeconds: number;
  readonly peakGain: number;
  readonly waveform: OscillatorType;
  readonly pulses: number;
  readonly rateLimitSeconds: number;
}

export const SEMANTIC_CUE_CAPTIONS: Record<SemanticCueId, string> = {
  "watcher-contact": "監視機に捕捉された",
  "share-transmit": "敵機が位置を送信している",
  "share-receive": "敵機が位置を受け取った",
  "needle-reacquired": "ニードルに再び捕捉された",
  "lock-on-warning": "ロックオンされている",
  "interference-pulse": "妨害パルス",
  "reinforcement-accepted": "敵の増援が合流した",
  "cautious-transition": "警備網が様子を見ている",
  "outnumbered-transition": "警備網が劣勢と判断した",
  "cell-disengage": "警備網が引き上げていく",
  "relay-sabotage-start": "中継器が妨害されている",
  "relay-disabled": "中継器が止まった",
  "relay-restarted": "中継器が復旧した",
  "porter-authenticated": "荷役機の認証が通った",
  "porter-command-accepted": "荷役機が指示を受けた",
  "porter-carry-accepted": "荷役機が運搬を始めた",
  "porter-path-failed": "荷役機が進路を見つけられない",
  "porter-gate-rejected": "荷役機がゲートで止められた",
  "flare-deployed": "フレアを投げた",
  "flare-observed": "敵がフレアに反応した"
};

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
  cue("porter-command-accepted", "PORTER COMMAND ACCEPTED", 220, 340, 0.12, 0.03, "triangle"),
  cue("porter-carry-accepted", "PORTER CARRY ACCEPTED", 120, 190, 0.16, 0.028, "triangle"),
  cue("porter-path-failed", "PORTER PATH FAILED", 190, 92, 0.21, 0.036, "sawtooth", 2),
  cue("porter-gate-rejected", "PORTER GATE REJECTED", 260, 110, 0.23, 0.038, "square", 2),
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
  return { id, label, caption: SEMANTIC_CUE_CAPTIONS[id], fromHz, toHz, durationSeconds, peakGain, waveform, pulses, rateLimitSeconds };
}

