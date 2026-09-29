import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barNotes, chooseTrack, degreeToMidi, seeded } from '../../src/audio/music.ts';
import { SFX_NAMES } from '../../src/audio/names.ts';
import { loadContent } from '../../src/content/index.ts';
import { STORAGE } from '../../src/config.ts';
import { loadSettings } from '../../src/core/settings.ts';
import { validateWorld } from '../../src/world/validate.ts';
import { memoryStorage, playing, stand } from './helpers.ts';

const content = loadContent();

describe('sound effects', () => {
  it('every effect the code triggers has a recipe', () => {
    for (const name of SFX_NAMES) expect(content.sfx[name], name).toBeTruthy();
  });

  it('the code only triggers effects from the list', () => {
    const sources = ['src/game/game.ts', 'src/entities/boss.ts', 'src/entities/enemies.ts', 'src/magic/effects.ts', 'src/ui/ui.ts']
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const used = [...sources.matchAll(/(?:sound|play)\(\s*'([a-zA-Z]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(20);
    for (const name of used) expect(SFX_NAMES as readonly string[]).toContain(name);
  });
});

describe('generative music', () => {
  const forest = content.music.tracks.forest;

  it('maps scale degrees to notes, wrapping octaves', () => {
    expect(degreeToMidi(forest, 0, 0)).toBe(forest.root);
    expect(degreeToMidi(forest, 7, 0)).toBe(forest.root + 12);
    expect(degreeToMidi(forest, -1, 0)).toBe(forest.root + forest.scale[6] - 12);
  });

  it('every note stays in the track scale', () => {
    for (const [name, track] of Object.entries(content.music.tracks)) {
      const inScale = new Set(track.scale);
      for (let bar = 0; bar < 16; bar++)
        for (const n of barNotes(track, bar, seeded(bar)))
          if (n.midi !== undefined) expect(inScale.has((((n.midi - track.root) % 12) + 12) % 12), `${name} bar ${bar}`).toBe(true);
    }
  });

  it('the same bar always sounds the same', () => {
    const track = content.music.tracks.title;
    expect(barNotes(track, 3, seeded(42))).toEqual(barNotes(track, 3, seeded(42)));
  });

  it('boss tracks have drums; exploration tracks do not', () => {
    const drums = (name: string) => barNotes(content.music.tracks[name], 0, seeded(1)).some((n) => n.voice === 'kick');
    expect(drums('groth')).toBe(true);
    expect(drums('vharn2')).toBe(true);
    expect(drums('forest')).toBe(false);
  });

  it('picks the track for the moment', () => {
    const { game } = playing();
    game.mode = 'title';
    expect(chooseTrack(game, content.music)).toBe('title');
    game.mode = 'play';
    stand(game, 'Umbral', 99);
    expect(chooseTrack(game, content.music)).toBe('forest');
    stand(game, 'Cavernas', 100, 504);
    expect(chooseTrack(game, content.music)).toBe('caves');
    stand(game, 'Corazon', 200);
    expect(chooseTrack(game, content.music)).toBe('vharn');
    game.enemies.find((e) => e.boss)!.boss!.phase = 1;
    expect(chooseTrack(game, content.music)).toBe('vharn2');
    game.mode = 'dead';
    expect(chooseTrack(game, content.music)).toBeNull();
  });

  it('the validator catches a missing track', () => {
    const broken = loadContent();
    broken.music.biomes.caves = 'nope';
    expect(validateWorld(broken).errors.join('\n')).toContain('"nope" no existe');
  });
});

describe('audio settings', () => {
  it('start with sound on', () => {
    expect(loadSettings(memoryStorage()).audio).toEqual({ enabled: true, music: 0.6, sfx: 0.8 });
  });

  it('old settings, where sound started off by default, turn it on', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE.settings, JSON.stringify({ sound: false, bindings: {} }));
    expect(loadSettings(storage).audio.enabled).toBe(true);
  });

  it('keep chosen volumes and reject nonsense', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE.settings, JSON.stringify({ audio: { enabled: false, music: 0.3, sfx: 7 } }));
    expect(loadSettings(storage).audio).toEqual({ enabled: false, music: 0.3, sfx: 0.8 });
  });
});
