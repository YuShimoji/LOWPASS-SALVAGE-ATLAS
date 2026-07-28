import type { SemanticAudio } from "./SemanticAudio";

export class SquadFeedbackAudio {
  constructor(private readonly audio: SemanticAudio) {}

  play(accepted: boolean): void {
    this.audio.play(accepted ? "squad.accepted" : "squad.rejected");
  }

  dispose(): void {}
}
