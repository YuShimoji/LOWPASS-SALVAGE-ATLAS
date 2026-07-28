import type { HostileDroneMode, PorterAndroidMode } from "../../game/machines/machineTypes";
import type { SemanticAudio } from "./SemanticAudio";

export class MachineFeedbackAudio {
  private lastLockPulse = Number.NEGATIVE_INFINITY;
  private lastPorterPulse = Number.NEGATIVE_INFINITY;
  private lastMode = "";
  private lastPorterMode = "";

  constructor(private readonly audio: SemanticAudio) {}

  update(mode: HostileDroneMode, lockProgress: number, elapsedSeconds: number): void {
    if (mode === "lock-on") {
      const interval = 0.58 - Math.min(1, lockProgress) * 0.4;
      if (elapsedSeconds - this.lastLockPulse >= interval) {
        this.audio.play("contact.lock-pulse");
        this.lastLockPulse = elapsedSeconds;
      }
    }
    if (mode !== this.lastMode) {
      if (mode === "stalk" || mode === "lock-on") this.audio.play("contact.detected");
      if (mode === "disengage") this.audio.play("contact.disengaged");
      if (mode === "interdict") this.audio.play("contact.interdicted");
      this.lastMode = mode;
    }
  }

  updatePorter(mode: PorterAndroidMode, elapsedSeconds: number): void {
    const friendlyOperational = mode !== "dormant"
      && mode !== "handshake"
      && mode !== "path-failed"
      && mode !== "gate-rejected";
    if (friendlyOperational && elapsedSeconds - this.lastPorterPulse >= 1.6) {
      this.audio.play("porter.operational-pulse");
      this.lastPorterPulse = elapsedSeconds;
    }
    if (mode !== this.lastPorterMode) {
      if (mode === "gate-rejected" || mode === "path-failed") this.audio.play("porter.rejected");
      this.lastPorterMode = mode;
    }
  }

  playPorterAuthenticated(): void {
    this.audio.play("porter.authenticated");
  }

  playHostileShareTransmit(): void {
    this.audio.play("hostile.share-transmit");
  }

  playHostileShareReceive(): void {
    this.audio.play("hostile.share-receive");
  }

  dispose(): void {
    // The shared SemanticAudio instance owns the AudioContext lifecycle.
  }
}
