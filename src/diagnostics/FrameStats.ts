export class FrameStats {
  private smoothedFps = 60;
  private droppedFrames = 0;

  record(frameSeconds: number, droppedSimulationTime: boolean): void {
    if (frameSeconds > 0) {
      const instantaneous = 1 / frameSeconds;
      this.smoothedFps += (instantaneous - this.smoothedFps) * 0.08;
    }
    if (droppedSimulationTime) this.droppedFrames += 1;
  }

  get fps(): number {
    return this.smoothedFps;
  }

  get droppedSimulationFrames(): number {
    return this.droppedFrames;
  }
}
