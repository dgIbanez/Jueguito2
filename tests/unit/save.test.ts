import { describe, expect, it } from 'vitest';
import { STORAGE } from '../../src/config.ts';
import { makeGame, memoryStorage, stand } from './helpers.ts';

describe('save', () => {
  it('ignores malformed and unknown saves', () => {
    const storage = memoryStorage();
    const { game } = makeGame(storage);
    storage.setItem(STORAGE.save, '{broken');
    expect(game.store.load()).toBeNull();
    storage.setItem(STORAGE.save, JSON.stringify({ version: 99 }));
    expect(game.store.load()).toBeNull();
    storage.setItem(STORAGE.save, JSON.stringify({ version: 2, checkpoint: { room: 'Nowhere', x: 0, y: 0 } }));
    expect(game.store.load()).toBeNull();
  });

  it('round-trips progress', () => {
    const storage = memoryStorage();
    const { game } = makeGame(storage);
    game.newGame();
    game.progress.abilities.add('dash');
    game.progress.pages.set('page_ascua', { solved: true, key: { shift: 3 } });
    game.progress.flags.add('gate:thorns_throne');
    game.save();
    const loaded = makeGame(storage).game.store.load()!;
    expect(loaded.abilities.has('dash')).toBe(true);
    expect(loaded.pages.get('page_ascua')).toEqual({ solved: true, key: { shift: 3 } });
    expect(loaded.flags.has('gate:thorns_throne')).toBe(true);
  });

  it('migrates a v1 save to the new world', () => {
    const storage = memoryStorage();
    storage.setItem(
      STORAGE.legacySave,
      JSON.stringify({
        version: 1,
        progress: { map: true, dash: true, book: true, page: true, spell: true, thorns: true, boss: false, visited: [0, 1, 3, 4] },
        checkpoint: { room: 3, x: 91, y: 448 },
        defeated: ['0:0'],
      }),
    );
    const { game } = makeGame(storage);
    game.continueGame();
    const p = game.progress;
    expect([...p.abilities]).toEqual(['dash']);
    expect(p.items.has('map') && p.items.has('grimoire')).toBe(true);
    expect(p.spells.has('ascua')).toBe(true);
    expect(p.pages.get('page_ascua')?.solved).toBe(true);
    expect(p.flags.has('gate:thorns_throne')).toBe(true);
    expect(p.checkpoint.room).toBe('Archivo');
    expect(game.room.id).toBe('Archivo');
    expect([...p.visited]).toEqual(expect.arrayContaining(['Umbral', 'Sendero', 'Archivo', 'Copa']));
    // Continuing rewrites the save in the new format.
    expect(JSON.parse(storage.getItem(STORAGE.save)!).version).toBe(3);
    // Spells learned before loadouts existed stay castable.
    expect(p.loadout).toEqual(['ascua']);
  });

  it('keeps discoveries when continuing and restores health', () => {
    const storage = memoryStorage();
    const { game } = makeGame(storage);
    game.newGame();
    stand(game, 'Sendero', 411, 312);
    game.interact();
    game.player.hp = 1;
    const next = makeGame(storage).game;
    next.continueGame();
    expect(next.progress.abilities.has('dash')).toBe(true);
    expect(next.player.hp).toBe(5);
  });

  it('plays without storage', () => {
    const { game } = makeGame();
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    const offline = makeGame(blocked as never).game;
    const toasts: string[] = [];
    offline.events.on('toast', (t) => toasts.push(t));
    offline.newGame();
    expect(offline.mode).toBe('play');
    expect(toasts.some((t) => t.includes('Guardado no disponible'))).toBe(true);
    expect(game.store.hasSave()).toBe(false);
  });
});
