export class MachineFeedbackAudio {
  private context: AudioContext | null = null;
  private lastLockPulse = Number.NEGATIVE_INFINITY;
  private lastMode = "";

  constructor(private readonly enabled: boolean) {}

  update(mode: string, lockProgress: number, elapsedSeconds: number): void {
    if (!this.enabled) return;
    if (mode === "lock-on") {
      const interval = 0.58 - Math.min(1, lockProgress) * 0.4;
      if (elapsedSeconds - this.lastLockPulse >= interval) {
        this.tone(280 + lockProgress * 420, 0.055, 0.035);
        this.lastLockPulse = elapsedSeconds;
      }
    }
    if (mode !== this.lastMode) {
      if (mode === "disengage") this.sweep(360, 150, 0.22, 0.055);
      if (mode === "interdict") this.sweep(170, 70, 0.16, 0.065);
      if (mode === "gate-rejected") this.sweep(120, 62, 0.28, 0.05);
      this.lastMode = mode;
    }
  }

  playPorterAuthenticated(): void {
    if (this.enabled) this.sweep(180, 310, 0.2, 0.04);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }

  private tone(frequency: number, duration: number, volume: number): void {
    this.sweep(frequency, frequency, duration, volume);
  }

  private sweep(from: number, to: number, duration: number, volume: number): void {
    const context = this.ensureContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(from, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), context.currentTime + duration);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") void this.context.resume();
    return this.context;
  }
}
