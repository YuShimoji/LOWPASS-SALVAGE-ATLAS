export class SquadFeedbackAudio {
  private context: AudioContext | null = null;

  play(accepted: boolean): void {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
      const now = this.context.currentTime;
      this.tone(accepted ? 420 : 180, now, 0.07, accepted ? "triangle" : "square");
      this.tone(accepted ? 610 : 140, now + 0.075, 0.09, accepted ? "sine" : "sawtooth");
    } catch {
      // Command audio is presentation-only and never changes the simulation result.
    }
  }

  dispose(): void {
    if (this.context) void this.context.close();
    this.context = null;
  }

  private tone(frequency: number, start: number, duration: number, type: OscillatorType): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.035, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
