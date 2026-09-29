/**
 * Generative music: each bar of a track is expanded into note events from
 * its chord, patterns and a seeded random melody. Pure functions, so the
 * composition rules are testable without an audio device.
 */
import type { MusicDef, MusicTrack } from '../content/types.ts';
import type { Game } from '../game/game.ts';

export type Voice = 'pad' | 'bass' | 'arp' | 'bell' | 'kick' | 'snare' | 'hat';

export interface NoteEvent {
  voice: Voice;
  /** Sixteenth-note step within the bar, 0-15. */
  step: number;
  /** Length in steps. */
  dur: number;
  midi?: number;
}

export const STEPS = 16;

/** Small seeded PRNG (mulberry32): the same bar always plays the same melody. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashName = (name: string): number => [...name].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

/** MIDI note of a scale degree; degrees past the scale wrap into higher octaves. */
export function degreeToMidi(track: MusicTrack, degree: number, octave: number): number {
  const n = track.scale.length;
  const wrapped = ((degree % n) + n) % n;
  return track.root + track.scale[wrapped] + 12 * (Math.floor(degree / n) + octave);
}

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** All notes of one bar. `bar` counts up from the start of the track. */
export function barNotes(track: MusicTrack, bar: number, rng: () => number): NoteEvent[] {
  const events: NoteEvent[] = [];
  const chord = track.chords[bar % track.chords.length];
  const { pad, bass, arp, bells, drums } = track.layers;
  if (pad) for (const degree of chord) events.push({ voice: 'pad', step: 0, dur: STEPS, midi: degreeToMidi(track, degree, pad.octave) });
  if (bass)
    bass.pattern.forEach((v, step) => {
      if (!v) return;
      const degree = v === 2 ? chord[0] + 4 : chord[0];
      events.push({ voice: 'bass', step, dur: 2, midi: degreeToMidi(track, degree, bass.octave + (v === 3 ? 1 : 0)) });
    });
  if (arp) {
    // Up the chord, then its octave, and back down.
    const run = [chord[0], chord[1], chord[2], chord[0] + track.scale.length, chord[2], chord[1]];
    let k = 0;
    arp.pattern.forEach((v, step) => {
      if (v) events.push({ voice: 'arp', step, dur: 1, midi: degreeToMidi(track, run[k++ % run.length], arp.octave) });
    });
  }
  if (bells) {
    // A melody that wanders the scale in small steps, starting on the chord.
    let degree = chord[Math.floor(rng() * chord.length)];
    for (let step = 0; step < STEPS; step += 2) {
      if (rng() >= bells.density) continue;
      degree += Math.floor(rng() * 5) - 2;
      events.push({ voice: 'bell', step, dur: 4, midi: degreeToMidi(track, degree, bells.octave) });
    }
  }
  if (drums)
    for (const voice of ['kick', 'snare', 'hat'] as const)
      drums[voice].forEach((v, step) => {
        if (v) events.push({ voice, step, dur: 1 });
      });
  return events;
}

/** Which track fits the moment: title, a boss (per phase), the room's biome, or silence. */
export function chooseTrack(game: Game, music: MusicDef): string | null {
  if (game.mode === 'title' || game.mode === 'prologue') return music.title;
  if (game.mode === 'dead') return null;
  const boss = game.enemies.find((e) => e.boss && e.hp > 0)?.boss;
  if (boss?.def.music?.length) return boss.def.music[Math.min(boss.phase, boss.def.music.length - 1)];
  return music.biomes[game.room.biome] ?? null;
}
