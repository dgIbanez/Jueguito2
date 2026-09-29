/**
 * Web Audio engine: synthesized sound effects and generative music, mixed
 * into separate buses with a shared reverb. Nothing is loaded from files.
 * Browsers only allow audio after a user gesture, so it starts on unlock().
 */
import type { Content, MusicTrack, SfxLayer } from '../content/types.ts';
import { barNotes, hashName, midiToHz, seeded, STEPS, type NoteEvent } from './music.ts';
import type { SfxName } from './names.ts';

export interface AudioSettings {
  enabled: boolean;
  /** 0 to 1. */
  music: number;
  sfx: number;
}

export const DEFAULT_AUDIO: AudioSettings = { enabled: true, music: 0.6, sfx: 0.8 };

/** Seconds to fade between tracks. */
const FADE = 1.2;
/** How far ahead bars are scheduled. */
const LOOKAHEAD = 0.4;

interface Playing {
  name: string;
  track: MusicTrack;
  out: GainNode;
  bar: number;
  nextBar: number;
  seed: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverbIn!: GainNode;
  private echoIn!: GainNode;
  private echo!: DelayNode;
  private noise!: AudioBuffer;
  private playing: Playing | null = null;
  private wanted: string | null = null;
  private readonly content: Content;
  settings: AudioSettings;

  constructor(content: Content, settings: AudioSettings) {
    this.content = content;
    this.settings = settings;
  }

  /** Creates the audio graph on the first user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    // A limiter keeps loud moments (a boss plus effects) from clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.master.connect(limiter).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    // Shared reverb: a convolver with a synthetic, decaying noise tail.
    const reverb = ctx.createConvolver();
    const seconds = 2.4;
    const impulse = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    reverb.buffer = impulse;
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.5;
    this.reverbIn.connect(reverb).connect(this.master);

    // Music echo: a filtered feedback delay synced to the tempo.
    this.echo = ctx.createDelay(2);
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2500;
    this.echoIn = ctx.createGain();
    this.echoIn.connect(this.echo).connect(tone).connect(feedback).connect(this.echo);
    tone.connect(this.musicBus);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.apply(this.settings);
    // Scheduling runs on a timer, not on frames, so music keeps time while rendering stalls.
    setInterval(() => this.schedule(), 50);
  }

  /** Volumes follow a squared curve, closer to how loudness is perceived. */
  apply(settings: AudioSettings): void {
    this.settings = settings;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.enabled ? 1 : 0, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.sfx ** 2 * 2.2, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.music ** 2 * 4, t, 0.05);
  }

  // ------------------------------------------------------------ effects

  /** Plays a sound effect; pan from -1 (left) to 1 (right). */
  play(name: SfxName, pan = 0): void {
    const ctx = this.ctx;
    const def = this.content.sfx[name];
    if (!ctx || !def || !this.settings.enabled) return;
    const pitch = 1 + (Math.random() * 2 - 1) * (def.vary ?? 0);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.sfxBus);
    for (const layer of def.layers) this.layer(layer, pitch, panner);
  }

  private layer(l: SfxLayer, pitch: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const start = ctx.currentTime + (l.delay ?? 0);
    const end = start + l.dur;
    let source: AudioScheduledSourceNode;
    if (l.wave === 'noise') {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise;
      noise.loop = true;
      noise.playbackRate.value = pitch;
      source = noise;
    } else {
      const osc = ctx.createOscillator();
      osc.type = l.wave;
      osc.frequency.setValueAtTime(l.freq * pitch, start);
      if (l.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, l.to * pitch), end);
      source = osc;
    }
    let node: AudioNode = source;
    if (l.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = l.filter.type;
      filter.Q.value = l.filter.q ?? 1;
      filter.frequency.setValueAtTime(l.filter.freq, start);
      if (l.filter.to) filter.frequency.exponentialRampToValueAtTime(Math.max(1, l.filter.to), end);
      node = node.connect(filter);
    }
    const gain = this.envelope(start, l.attack ?? 0.005, end, l.gain);
    node.connect(gain).connect(out);
    if (l.reverb) this.send(gain, this.reverbIn, l.reverb);
    source.start(start);
    source.stop(end + 0.05);
  }

  /** A gain node that rises to `peak` and decays to silence by `end`. */
  private envelope(start: number, attack: number, end: number, peak: number): GainNode {
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(attack, (end - start) * 0.9));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    return gain;
  }

  private send(from: AudioNode, to: AudioNode, amount: number): void {
    const level = this.ctx!.createGain();
    level.gain.value = amount;
    from.connect(level).connect(to);
  }

  // ------------------------------------------------------------ music

  /** Requests a track (or silence); the change cross-fades on the next schedule. */
  setTrack(name: string | null): void {
    this.wanted = name;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if ((this.playing?.name ?? null) !== this.wanted) this.switchTo(this.wanted);
    const p = this.playing;
    if (!p) return;
    while (p.nextBar < ctx.currentTime + LOOKAHEAD) {
      const step = 60 / p.track.bpm / 4;
      for (const note of barNotes(p.track, p.bar, seeded(p.seed + p.bar))) this.note(p, note, p.nextBar + note.step * step, note.dur * step);
      p.nextBar += STEPS * step;
      p.bar++;
    }
  }

  private switchTo(name: string | null): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (this.playing) {
      const old = this.playing.out;
      old.gain.setValueAtTime(old.gain.value, t);
      old.gain.linearRampToValueAtTime(0, t + FADE);
      setTimeout(() => old.disconnect(), (FADE + 3) * 1000);
    }
    const track = name ? this.content.music.tracks[name] : undefined;
    if (!name || !track) {
      this.playing = null;
      return;
    }
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(1, t + FADE);
    out.connect(this.musicBus);
    this.echo.delayTime.setValueAtTime((60 / track.bpm / 4) * 3, t);
    this.playing = { name, track, out, bar: 0, nextBar: t + 0.05, seed: hashName(name) };
  }

  /** One instrument note. */
  private note(p: Playing, n: NoteEvent, at: number, dur: number): void {
    const ctx = this.ctx!;
    const L = p.track.layers;
    const hz = n.midi !== undefined ? midiToHz(n.midi) : 0;
    const osc = (type: OscillatorType, freq: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      return o;
    };
    const lowpass = (freq: number) => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = freq;
      return f;
    };
    const play = (sources: AudioScheduledSourceNode[], chain: AudioNode, end: number) => {
      for (const s of sources) {
        s.connect(chain);
        s.start(at);
        s.stop(end + 0.1);
      }
    };
    switch (n.voice) {
      case 'pad': {
        const v = L.pad!;
        const end = at + dur + 1;
        const gain = this.envelope(at, Math.min(0.9, dur * 0.4), end, v.gain);
        const filter = lowpass(v.cutoff);
        filter.connect(gain).connect(p.out);
        this.send(gain, this.reverbIn, 0.5);
        play([osc(v.wave, hz, -7), osc(v.wave, hz, 7)], filter, end);
        break;
      }
      case 'bass': {
        const v = L.bass!;
        const gain = this.envelope(at, 0.01, at + dur * 0.95, v.gain);
        const filter = lowpass(v.cutoff);
        filter.connect(gain).connect(p.out);
        play([osc(v.wave, hz)], filter, at + dur);
        break;
      }
      case 'arp': {
        const v = L.arp!;
        const end = at + v.decay;
        const gain = this.envelope(at, 0.005, end, v.gain);
        gain.connect(p.out);
        this.send(gain, this.echoIn, v.echo);
        play([osc(v.wave, hz)], gain, end);
        break;
      }
      case 'bell': {
        const v = L.bells!;
        const end = at + v.decay;
        const gain = this.envelope(at, 0.005, end, v.gain);
        gain.connect(p.out);
        this.send(gain, this.echoIn, v.echo);
        this.send(gain, this.reverbIn, 0.6);
        const partial = ctx.createGain();
        partial.gain.value = 0.3;
        partial.connect(gain);
        play([osc('sine', hz)], gain, end);
        play([osc('sine', hz * 2.01)], partial, end);
        break;
      }
      case 'kick': {
        const g = L.drums!.gain;
        const o = osc('sine', 150);
        o.frequency.setValueAtTime(150, at);
        o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
        const gain = this.envelope(at, 0.003, at + 0.28, g * 1.6);
        gain.connect(p.out);
        play([o], gain, at + 0.3);
        break;
      }
      case 'snare': {
        const g = L.drums!.gain;
        const noise = ctx.createBufferSource();
        noise.buffer = this.noise;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1800;
        const gain = this.envelope(at, 0.002, at + 0.16, g);
        band.connect(gain).connect(p.out);
        this.send(gain, this.reverbIn, 0.2);
        play([noise], band, at + 0.18);
        break;
      }
      case 'hat': {
        const g = L.drums!.gain;
        const noise = ctx.createBufferSource();
        noise.buffer = this.noise;
        const high = ctx.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = 7000;
        const gain = this.envelope(at, 0.001, at + 0.045, g * 0.45);
        high.connect(gain).connect(p.out);
        play([noise], high, at + 0.05);
        break;
      }
    }
  }
}
