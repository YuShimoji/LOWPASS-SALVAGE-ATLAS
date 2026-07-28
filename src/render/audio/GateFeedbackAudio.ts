import type { SemanticAudio } from "./SemanticAudio";

export class GateFeedbackAudio {
  constructor(private readonly audio: SemanticAudio) {}

  play(accepted: boolean): void {
    this.audio.play(accepted ? "gate.accepted" : "gate.rejected");
  }
}
