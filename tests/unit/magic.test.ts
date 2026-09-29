import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/config.ts';
import { deserialize } from '../../src/core/save.ts';
import { createEnemy, type Enemy } from '../../src/entities/enemies.ts';
import { idleIntent } from '../../src/entities/player.ts';
import { saveContext, type Game } from '../../src/game/game.ts';
import { levelData, levelOf, slotCount, slotOf } from '../../src/magic/loadout.ts';
import { playing, run, stand } from './helpers.ts';

const cast = (game: Game, slot: number) => game.tick(STEP, { ...idleIntent(), castSlot: slot });

/** A harmless practice target standing on the Umbral floor. */
function dummy(game: Game, kind: string, ax: number, ay = 480): Enemy {
  const e = createEnemy(kind, game.content.enemies[kind], ax, ay, null);
  Object.assign(e, { state: 'recover', timer: 99 });
  game.enemies = [e];
  return e;
}

function atUmbral() {
  const setup = playing();
  stand(setup.game, 'Umbral', 99);
  setup.game.enemies = [];
  setup.game.player.face = 1;
  return setup;
}

describe('spell loadout', () => {
  it('learning fills free slots; extra spells wait unequipped', () => {
    const { game } = playing();
    for (const id of ['ascua', 'egida', 'cefiro']) game.learnSpell(id);
    expect(game.progress.loadout).toEqual(['ascua', 'egida']);
    expect(slotOf(game.progress, 'cefiro')).toBe(-1);
  });

  it('each seal adds a slot', () => {
    const { game } = playing();
    expect(slotCount(game.content, game.progress)).toBe(2);
    game.progress.items.add('sello_bosque');
    game.progress.items.add('map');
    expect(slotCount(game.content, game.progress)).toBe(3);
  });

  it('the loadout only changes while resting at a shrine', () => {
    const { game } = playing();
    for (const id of ['ascua', 'egida', 'cefiro']) game.learnSpell(id);
    expect(game.unequipSpell('egida')).toBe(false);
    game.mode = 'shrine';
    expect(game.unequipSpell('egida')).toBe(true);
    expect(game.equipSpell('cefiro')).toBe(true);
    expect(game.equipSpell('egida')).toBe(false);
    expect(game.progress.loadout).toEqual(['ascua', 'cefiro']);
  });

  it('resting at a shrine opens the preparation screen', () => {
    const { game } = atUmbral();
    const opened: unknown[] = [];
    game.events.on('shrine', (e) => opened.push(e));
    game.interact();
    expect(game.mode).toBe('shrine');
    expect(opened).toHaveLength(1);
  });

  it('casting uses the pressed slot; empty slots do nothing', () => {
    const { game } = atUmbral();
    game.learnSpell('egida');
    cast(game, 2);
    expect(game.player.shield).toBe(0);
    expect(game.player.mana).toBe(3);
    cast(game, 1);
    expect(game.player.shield).toBeGreaterThan(0);
  });

  it('upgrades cost shards, raise the level and stop at the maximum', () => {
    const { game } = playing();
    game.learnSpell('ascua');
    game.mode = 'shrine';
    game.progress.shards = 5;
    expect(game.upgradeSpell('ascua')).toBe(false);
    game.progress.shards = 30;
    expect(game.upgradeSpell('ascua')).toBe(true);
    expect(levelOf(game.progress, 'ascua')).toBe(2);
    expect(game.progress.shards).toBe(22);
    expect(levelData(game.content, game.progress, 'ascua').damage).toBe(3);
    expect(game.upgradeSpell('ascua')).toBe(true);
    expect(game.upgradeSpell('ascua')).toBe(false);
    expect(levelOf(game.progress, 'ascua')).toBe(3);
    expect(game.progress.shards).toBe(2);
  });

  it('fusions need both spells at level 2 and enough shards', () => {
    const { game } = playing();
    game.learnSpell('ascua');
    game.learnSpell('cefiro');
    game.mode = 'shrine';
    game.progress.shards = 100;
    expect(game.fuseSpells('torbellino')).toBe(false);
    game.upgradeSpell('ascua');
    expect(game.fuseSpells('torbellino')).toBe(false);
    game.upgradeSpell('cefiro');
    expect(game.fuseSpells('torbellino')).toBe(true);
    expect(game.progress.spells.has('torbellino')).toBe(true);
    expect(game.progress.shards).toBe(100 - 8 - 10 - 15);
    expect(game.fuseSpells('torbellino')).toBe(false);
  });
});

describe('spell effects', () => {
  it('a level 3 Ascua pierces and hits harder', () => {
    const { game } = atUmbral();
    game.learnSpell('ascua');
    game.progress.spellLevels.set('ascua', 3);
    const a = dummy(game, 'hob', 200);
    const b = createEnemy('hob', game.content.enemies.hob, 260, 480, null);
    Object.assign(b, { state: 'recover', timer: 99 });
    game.enemies.push(b);
    cast(game, 1);
    run(game, 30);
    expect(a.hp).toBe(2);
    expect(b.hp).toBe(2);
  });

  it('frost freezes: a frozen enemy neither moves nor advances its attack', () => {
    const { game } = atUmbral();
    game.learnSpell('escarcha');
    const e = dummy(game, 'goblin', 200);
    cast(game, 1);
    run(game, 20);
    expect(e.hp).toBe(2);
    expect(e.frozen).toBeGreaterThan(0);
    Object.assign(e, { state: 'wind', timer: 0.05 });
    run(game, 20);
    expect(e.state).toBe('wind');
    expect(e.timer).toBe(0.05);
  });

  it('wind pushes enemies back and blows arrows away', () => {
    const { game } = atUmbral();
    game.learnSpell('cefiro');
    const e = dummy(game, 'goblin', 150);
    game.arrows = [{ x: 150, y: 460, w: 8, h: 6, vx: -200, vy: 0, life: 3 }];
    const x0 = e.x;
    cast(game, 1);
    expect(e.hp).toBe(2);
    expect(e.knockVx).toBeGreaterThan(0);
    run(game, 5);
    expect(e.x).toBeGreaterThan(x0);
    expect(game.arrows).toHaveLength(0);
  });

  it('wind shatters the crystal veil, and so does a fusion made from it', () => {
    for (const spell of ['cefiro', 'ventisca']) {
      const { game } = playing();
      game.learnSpell(spell);
      stand(game, 'Grieta', 820, 648);
      game.enemies = [];
      game.player.face = 1;
      cast(game, 1);
      expect(game.progress.flags.has('gate:velo_cristal')).toBe(true);
    }
  });

  it('the fire vortex burns the same enemy again and again', () => {
    const { game } = atUmbral();
    game.progress.spells.add('torbellino');
    game.progress.loadout = ['torbellino'];
    const e = dummy(game, 'hob', 170);
    cast(game, 1);
    expect(game.player.mana).toBe(1);
    run(game, 60);
    expect(e.hp).toBeLessThanOrEqual(3);
  });

  it('the fiery shield burns enemies that touch it', () => {
    const { game } = atUmbral();
    game.progress.spells.add('egida_ignea');
    game.progress.loadout = ['egida_ignea'];
    const e = dummy(game, 'goblin', 130);
    cast(game, 1);
    run(game, 30);
    expect(e.hp).toBe(1);
  });
});

describe('rewards and progression', () => {
  it('kills grant mana shards', () => {
    const { game } = atUmbral();
    stand(game, 'Umbral', 99);
    game.hitEnemy(game.enemies[0], 99);
    expect(game.progress.shards).toBe(2);
  });

  it('Groth drops the forest seal, and the hatch under his throne opens', () => {
    const { game } = playing();
    game.progress.flags.add('gate:thorns_throne');
    stand(game, 'Trono', 200);
    expect(game.closedGates().map((g) => g.id)).toContain('trono_hatch');
    game.hitEnemy(game.enemies.find((e) => e.boss)!, 99);
    expect(game.progress.items.has('sello_bosque')).toBe(true);
    expect(slotCount(game.content, game.progress)).toBe(3);
    expect(game.progress.shards).toBe(25);
    expect(game.closedGates().map((g) => g.id)).not.toContain('trono_hatch');
    game.mode = 'play';
    stand(game, 'Trono', 470);
    run(game, 60);
    expect(game.room.id).toBe('Grieta');
  });

  it('bats lock on during a visible windup, then swoop', () => {
    const { game } = atUmbral();
    const bat = createEnemy('bat', game.content.enemies.bat, 200, 380, null);
    bat.timer = 0;
    game.enemies = [bat];
    run(game, 1);
    expect(bat.state).toBe('wind');
    expect(bat.aim!.x).toBeLessThan(0);
    run(game, 70);
    expect(game.player.hp).toBe(4);
  });

  it('Vharn rains crystals around the player', () => {
    const { game } = playing();
    stand(game, 'Corazon', 300);
    const vharn = game.enemies.find((e) => e.boss)!;
    expect(vharn.boss!.id).toBe('vharn');
    Object.assign(vharn, { state: 'wind', timer: 0 });
    vharn.boss!.move = 'rain';
    game.player.inv = 99;
    run(game, 1);
    expect(game.arrows.filter((a) => a.shard)).toHaveLength(5);
  });

  it('older saves keep their spells equipped and earn seals already won', () => {
    const { game } = playing();
    const cp = { room: 'Umbral', x: 99, y: 448 };
    const loaded = deserialize({ version: 2, spells: ['ascua', 'egida'], flags: ['boss:groth'], items: [], checkpoint: cp }, saveContext(game.content))!;
    expect(loaded.loadout).toEqual(['ascua', 'egida']);
    expect(loaded.items.has('sello_bosque')).toBe(true);
    expect(loaded.shards).toBe(0);
  });
});
