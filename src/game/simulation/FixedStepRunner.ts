export const FIXED_TIMESTEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;
const MAX_SUB_STEPS = 8;

export interface StepResult {
  alpha: number;
  steps: number;
  droppedTime: boolean;
}

export class FixedStepRunner {
  private accumulator = 0;

  constructor(private readonly timestep = FIXED_TIMESTEP_SECONDS) {}

  advance(frameSeconds: number, step: (dt: number) => void): StepResult {
    const clampedFrame = Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
    this.accumulator += clampedFrame;
    let steps = 0;

    while (this.accumulator >= this.timestep && steps < MAX_SUB_STEPS) {
      step(this.timestep);
      this.accumulator -= this.timestep;
      steps += 1;
    }

    const droppedTime = this.accumulator >= this.timestep;
    if (droppedTime) {
      this.accumulator %= this.timestep;
    }

    return {
      alpha: this.accumulator / this.timestep,
      steps,
      droppedTime,
    };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
