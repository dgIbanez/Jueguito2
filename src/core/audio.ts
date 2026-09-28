/** Tiny synthesized sound effects; no audio files are needed. */
export class Sound {
  private ctx: AudioContext | null = null;
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  beep(freq = 300, duration = 0.1, type: OscillatorType = 'triangle'): void {
    if (!this.enabled) return;
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + duration);
      gain.gain.setValueAtTime(0.025, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      osc.stop(t + duration);
    } catch {
      /* audio unavailable */
    }
  }
}
