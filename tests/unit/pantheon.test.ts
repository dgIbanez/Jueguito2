import { describe, expect, it } from 'vitest';
import { STORAGE } from '../../src/config.ts';
import { formatTime, loadRecords, recordTime } from '../../src/core/records.ts';
import { loadSettings } from '../../src/core/settings.ts';
import type { Game } from '../../src/game/game.ts';
import { makeGame, memoryStorage, run } from './helpers.ts';

/** A saved journey where the given bosses were defeated. */
function veteran(bosses: string[]) {
  const setup = makeGame();
  const { game } = setup;
  game.newGame();
  for (const id of bosses) game.progress.flags.add(`boss:${id}`);
  game.progress.shards = 7;
  game.learnSpell('ascua');
  game.save();
  return setup;
}

const boss = (game: Game) => game.enemies.find((e) => e.boss)!;

describe('pantheon', () => {
  it('offers only the bosses defeated in the journey', () => {
    expect(makeGame().game.pantheonBosses()).toEqual([]);
    expect(veteran(['groth']).game.pantheonBosses()).toEqual(['groth']);
    const { game } = veteran(['groth']);
    expect(game.startTrial('duel', ['vharn'])).toBe(false);
  });

  it('a duel stages the arena with just the boss and times the fight', () => {
    const { game } = veteran(['groth', 'vharn']);
    expect(game.startTrial('duel', ['groth'])).toBe(true);
    expect(game.room.id).toBe('Trono');
    expect(game.mode).toBe('play');
    expect(game.enemies).toHaveLength(1);
    expect(boss(game).boss!.id).toBe('groth');
    // Victories from the journey do not open the floor hatch here.
    expect(game.closedGates().map((g) => g.id)).toEqual(['trono_hatch']);
    game.player.inv = 99;
    run(game, 60);
    expect(game.trial!.time).toBeCloseTo(1, 1);
  });

  it('winning grants nothing and never touches the saved journey', () => {
    const { game } = veteran(['groth']);
    const cleared: boolean[] = [];
    game.events.on('trialCleared', ({ done }) => cleared.push(done));
    game.startTrial('duel', ['groth']);
    game.hitEnemy(boss(game), 99);
    expect(cleared).toEqual([true]);
    expect(game.mode).toBe('win');
    game.endTrial();
    expect(game.mode).toBe('title');
    expect(game.progress.shards).toBe(7);
    expect(game.store.load()!.shards).toBe(7);
    expect(game.store.load()!.flags.has('boss:vharn')).toBe(false);
  });

  it('a rush carries health from boss to boss and refills magic', () => {
    const { game } = veteran(['groth', 'vharn']);
    game.startTrial('rush', ['groth', 'vharn']);
    game.player.hp = 3;
    game.player.mana = 0;
    game.hitEnemy(boss(game), 99);
    expect(game.mode).toBe('interlude');
    game.nextTrialBoss();
    expect(game.room.id).toBe('Corazon');
    expect(boss(game).boss!.id).toBe('vharn');
    expect(game.player.hp).toBe(3);
    expect(game.player.mana).toBe(3);
  });

  it('dying ends the attempt; retrying starts over at full health', () => {
    const { game } = veteran(['groth', 'vharn']);
    game.startTrial('rush', ['groth', 'vharn']);
    game.hitEnemy(boss(game), 99);
    game.nextTrialBoss();
    game.player.hp = 1;
    game.player.inv = 0;
    game.hurtPlayer(0);
    expect(game.mode).toBe('dead');
    game.retryTrial();
    expect(game.room.id).toBe('Trono');
    expect(game.player.hp).toBe(5);
    expect(game.trial!.time).toBe(0);
  });
});

describe('records', () => {
  it('keep only the best time', () => {
    const storage = memoryStorage();
    expect(recordTime(storage, 'duel', 'groth', 80)).toBe(true);
    expect(recordTime(storage, 'duel', 'groth', 95)).toBe(false);
    expect(recordTime(storage, 'duel', 'groth', 61.25)).toBe(true);
    expect(recordTime(storage, 'rush', 'groth', 200)).toBe(true);
    expect(loadRecords(storage)).toEqual({ duel: { groth: 61.25 }, rush: 200 });
  });

  it('format as minutes and seconds', () => {
    expect(formatTime(83.44)).toBe('1:23.4');
    expect(formatTime(5)).toBe('0:05.0');
    expect(formatTime(null)).toBe('—');
  });
});

describe('grimoire key', () => {
  it('saved Tab bindings move to the new default', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE.settings, JSON.stringify({ bindings: { grimoire: ['Tab'], jump: ['KeyI', 'Tab'] } }));
    const { bindings } = loadSettings(storage);
    expect(bindings.grimoire).toEqual(['KeyQ']);
    expect(bindings.jump).toEqual(['KeyI']);
  });
});
