export class GateFeedbackAudio {
  private context: AudioContext | null = null;

  constructor(private readonly enabled = true) {}

  play(accepted: boolean): void {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
      const now = this.context.currentTime;
      this.playTone(accepted ? 520 : 150, now, accepted ? 0.11 : 0.16, accepted ? "sine" : "sawtooth");
      this.playTone(accepted ? 760 : 112, now + 0.1, accepted ? 0.13 : 0.2, accepted ? "triangle" : "square");
    } catch {
      // Audio is presentation-only; browser audio policy must not affect the gate result.
    }
  }

  dispose(): void {
    if (this.context) void this.context.close();
    this.context = null;
  }

  private playTone(frequency: number, start: number, duration: number, type: OscillatorType): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.055, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
