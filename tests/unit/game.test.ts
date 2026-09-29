import { describe, expect, it } from 'vitest';
import { PHYS, STEP } from '../../src/config.ts';
import { createEnemy, type Enemy } from '../../src/entities/enemies.ts';
import { idleIntent } from '../../src/entities/player.ts';
import type { Game } from '../../src/game/game.ts';
import { makeGame, playing, run, stand } from './helpers.ts';

const kind = (game: Game, k: string): Enemy[] => game.enemies.filter((e) => e.kind === k);
const boss = (game: Game): Enemy => game.enemies.find((e) => e.boss)!;

function readyForBoss() {
  const setup = playing();
  const { game } = setup;
  game.progress.spells.add('ascua');
  game.progress.flags.add('gate:thorns_throne');
  stand(game, 'Trono', 200);
  return setup;
}

describe('combat', () => {
  it('the sword hits once per swing and restores magic', () => {
    const { game, content } = playing();
    stand(game, 'Umbral', 99);
    game.player.mana = 1;
    const dummy = createEnemy('goblin', content.enemies.goblin, 136, 480, null);
    Object.assign(dummy, { state: 'recover', timer: 9 });
    game.enemies = [dummy];
    game.player.face = 1;
    game.tick(STEP, { ...idleIntent(), attackPressed: true });
    run(game, 10);
    expect(dummy.hp).toBe(2);
    expect(game.player.mana).toBe(2);
  });

  it('a downward strike bounces off enemies', () => {
    const { game, content } = playing();
    stand(game, 'Umbral', 99);
    const dummy = createEnemy('goblin', content.enemies.goblin, 300, 480, null);
    Object.assign(dummy, { state: 'recover', timer: 9 });
    game.enemies = [dummy];
    Object.assign(game.player, { x: 291, y: 400, vy: 100, ground: false });
    game.tick(STEP, { ...idleIntent(), down: true, attackPressed: true });
    expect(game.player.attackDown).toBe(true);
    expect(game.player.vy).toBeLessThan(-PHYS.pogo + 50);
    expect(dummy.hp).toBe(2);
  });

  it('melee enemies chase from long range, slower than the player', () => {
    const { game } = playing();
    stand(game, 'Sendero', 20);
    game.enemies = game.enemies.filter((e) => e.kind !== 'archer');
    kind(game, 'hob')[0].x = 580;
    run(game, 1);
    expect(kind(game, 'goblin')[0].vx).toBe(-180);
    expect(kind(game, 'hob')[0].vx).toBe(-165);
  });

  it('a melee lunge keeps the direction chosen during the windup', () => {
    const { game } = playing();
    stand(game, 'Sendero', 20);
    const e = kind(game, 'goblin')[0];
    Object.assign(e, { x: 200, state: 'strike', timer: 0.18, lock: 1 });
    game.player.x = 100;
    run(game, 1);
    expect(e.vx).toBe(180);
    expect(e.face).toBe(1);
  });

  it('walkers stop at the edge of a pit instead of falling', () => {
    const { game } = playing();
    stand(game, 'Copa', 150);
    game.enemies = kind(game, 'goblin').slice(0, 1);
    game.player.inv = 20;
    run(game, 300);
    const e = game.enemies[0];
    expect(e.hp).toBeGreaterThan(0);
    expect(e.ground).toBe(true);
    expect(e.x).toBeGreaterThanOrEqual(420);
  });

  it('archers telegraph, then shoot a locked arrow', () => {
    const { game } = playing();
    stand(game, 'Sendero', 450);
    game.player.inv = 20;
    const archer = kind(game, 'archer')[0];
    archer.timer = 0;
    run(game, 1);
    expect(archer.state).toBe('wind');
    expect(game.arrows).toHaveLength(0);
    archer.timer = 0;
    run(game, 1);
    expect(game.arrows).toHaveLength(1);
    expect(archer.state).toBe('recover');
  });

  it('arrows hurt, the dash dodges them and Égida sends them back', () => {
    const { game } = playing();
    stand(game, 'Umbral', 99);
    game.enemies = [];
    const p = game.player;
    const arrow = () => ({ x: p.x, y: p.y + 10, w: 8, h: 6, vx: 0, vy: 0, life: 1 });
    game.arrows = [arrow()];
    run(game, 1);
    expect(p.hp).toBe(4);
    expect(game.arrows).toHaveLength(0);

    Object.assign(p, { inv: 0, dash: 0.1 });
    game.arrows = [arrow()];
    run(game, 1);
    expect(p.hp).toBe(4);

    Object.assign(p, { inv: 0, dash: 0, shield: 0.5 });
    game.arrows = [{ ...arrow(), vx: -200 }];
    run(game, 1);
    expect(p.hp).toBe(4);
    expect(game.arrows[0].friendly).toBe(true);
    expect(game.arrows[0].vx).toBe(200);
  });

  it('arrows pass through one-way platforms but stop at solid ground', () => {
    const { game } = playing();
    stand(game, 'Sendero', 100);
    game.player.inv = 20;
    game.enemies = [];
    game.arrows = [{ x: 610, y: 244, w: 8, h: 6, vx: 0, vy: 0, life: 1 }];
    run(game, 1);
    expect(game.arrows).toHaveLength(1);
    game.arrows = [{ x: 610, y: 486, w: 8, h: 6, vx: 0, vy: 0, life: 1 }];
    run(game, 1);
    expect(game.arrows).toHaveLength(0);
  });

  it('spikes hurt and return the player to safe footing', () => {
    const { game } = playing();
    game.progress.abilities.add('wall_jump');
    stand(game, 'Nido', 400, 648);
    game.enemies = [];
    run(game, 5);
    const safe = { ...game.player.safe };
    Object.assign(game.player, { x: 540, y: 630 });
    run(game, 1);
    expect(game.player.hp).toBe(4);
    expect(game.player.x).toBe(safe.x);
  });

  it('a downward strike bounces off spikes without damage', () => {
    const { game } = playing();
    stand(game, 'Nido', 400, 648);
    game.enemies = [];
    Object.assign(game.player, { x: 540, y: 570, vy: 50, ground: false });
    game.tick(STEP, { ...idleIntent(), down: true, attackPressed: true });
    expect(game.player.vy).toBeLessThan(0);
    expect(game.player.hp).toBe(5);
  });
});

describe('encounters', () => {
  it('kills leave blood, persist between rooms and on reload', () => {
    const { game, storage } = playing();
    stand(game, 'Umbral', 99);
    const goblin = game.enemies[0];
    game.hitEnemy(goblin, 99);
    expect(game.progress.defeated.has(goblin.id!)).toBe(true);
    expect(game.blood.get('Umbral')!.length).toBeGreaterThan(0);
    expect(game.corpses).toHaveLength(1);
    stand(game, 'Sendero', 20);
    stand(game, 'Umbral', 900);
    expect(game.enemies).toHaveLength(0);
    expect(game.blood.get('Umbral')!.length).toBeGreaterThan(0);
    const reloaded = makeGame(storage).game;
    reloaded.continueGame();
    expect(reloaded.enemies).toHaveLength(0);
  });

  it('resting at a shrine restores ordinary enemies and clears blood', () => {
    const { game } = playing();
    stand(game, 'Umbral', 99);
    game.hitEnemy(game.enemies[0], 99);
    game.interact();
    expect(game.enemies).toHaveLength(1);
    expect(game.progress.defeated.size).toBe(0);
    expect(game.blood.size).toBe(0);
    expect(game.progress.checkpoint.room).toBe('Umbral');
  });

  it('dying keeps discoveries and restores encounters', () => {
    const { game } = playing();
    game.progress.spells.add('ascua');
    stand(game, 'Umbral', 99);
    game.hitEnemy(game.enemies[0], 99);
    game.player.hp = 1;
    game.hurtPlayer(0);
    expect(game.mode).toBe('dead');
    game.retry();
    expect(game.mode).toBe('play');
    expect(game.player.hp).toBe(5);
    expect(game.progress.spells.has('ascua')).toBe(true);
    expect(game.enemies).toHaveLength(1);
  });
});

describe('progression', () => {
  it('picks up the map, the boots and the grimoire', () => {
    const { game } = playing();
    stand(game, 'Umbral', 159);
    game.interact();
    expect(game.progress.items.has('map')).toBe(true);
    stand(game, 'Sendero', 411, 312);
    game.interact();
    expect(game.progress.abilities.has('dash')).toBe(true);
    stand(game, 'Archivo', 387, 336);
    game.interact();
    expect(game.progress.items.has('grimoire')).toBe(true);
    expect(game.progress.spells.size).toBe(0);
  });

  it('a page must be deciphered before it teaches its spell', () => {
    const { game } = playing();
    game.progress.items.add('grimoire');
    const opened: string[] = [];
    game.events.on('openPage', (id) => opened.push(id));
    stand(game, 'Copa', 1035, 288);
    game.interact();
    expect(game.progress.pages.get('page_ascua')).toEqual({ solved: false });
    expect(opened).toEqual(['page_ascua']);
    expect(game.solvePage('page_ascua', { shift: 0 })).toBe(false);
    expect(game.solvePage('page_ascua', { shift: 4 })).toBe(false);
    expect(game.progress.spells.size).toBe(0);
    expect(game.solvePage('page_ascua', { shift: 3 })).toBe(true);
    expect(game.progress.spells.has('ascua')).toBe(true);
    expect(game.readPage(game.page('page_ascua')!, { shift: 3 })).toBe('LA LLAMA ABRE EL CAMINO');
    expect(game.readPage(game.page('page_ascua')!, { shift: 3 }, 'LXOLQ VDHUK')).toBe('IULIN SAERH');
  });

  it('murals reveal glyphs that decipher the rune page', () => {
    const { game } = playing();
    const page = game.page('page_egida')!;
    game.progress.pages.set(page.id, { solved: false });
    expect(Object.keys(game.knownGlyphs('iulin'))).toHaveLength(0);
    for (const id of ['mural_runa', 'mural_guarda', 'mural_espera']) game.progress.clues.add(id);
    const known = game.knownGlyphs('iulin');
    expect(game.readPage(page, { map: known })).toBe('·A RUNA GUARDA A· ·UE ESPERA');
    expect(game.solvePage(page.id, { map: known })).toBe(false);
    const script = game.content.scripts.iulin;
    const full = { ...known, [script[11]]: 'L', [script[16]]: 'Q' };
    expect(game.solvePage(page.id, { map: full })).toBe(true);
    expect(game.progress.spells.has('egida')).toBe(true);
  });

  it('reading a mural records the clue', () => {
    const { game } = playing();
    const read: string[] = [];
    game.events.on('readClue', (id) => read.push(id));
    stand(game, 'Archivo', 207);
    game.interact();
    expect(read).toEqual(['mural_runa']);
    expect(game.progress.clues.has('mural_runa')).toBe(true);
  });

  it('thorns block the way until Ascua burns them, which wakes the boss', () => {
    const { game } = playing();
    game.learnSpell('ascua');
    stand(game, 'Trono', 40);
    run(game, 60, { moveX: 1 });
    expect(game.player.x + game.player.w).toBeLessThanOrEqual(120);
    expect(game.enemies).toHaveLength(0);
    game.player.face = 1;
    game.tick(STEP, { ...idleIntent(), castSlot: 1 });
    run(game, 12);
    expect(game.progress.flags.has('gate:thorns_throne')).toBe(true);
    expect(boss(game)).toBeTruthy();
  });

  it('Égida blocks shockwaves', () => {
    const { game } = playing();
    game.learnSpell('egida');
    stand(game, 'Umbral', 99);
    game.enemies = [];
    game.tick(STEP, { ...idleIntent(), castSlot: 1 });
    expect(game.player.shield).toBeGreaterThan(0);
    expect(game.player.mana).toBe(2);
    game.waves = [{ x: game.player.x, y: game.player.y + 10, w: 24, h: 22, vx: 0, life: 3 }];
    run(game, 1);
    expect(game.player.hp).toBe(5);
    expect(game.waves).toHaveLength(0);
  });
});

describe('boss', () => {
  it('cycles through its four attacks, including the thrown cleaver', () => {
    const { game } = readyForBoss();
    const b = boss(game);
    const moves = new Set<string>();
    let thrown = false;
    for (let i = 0; i < 1400; i++) {
      game.player.inv = 10;
      run(game, 1);
      if (b.state !== 'idle') moves.add(b.boss!.move);
      if (game.arrows.some((a) => a.spin)) thrown = true;
    }
    expect([...moves].sort()).toEqual(['charge', 'leap', 'slash', 'throw']);
    expect(thrown).toBe(true);
  });

  it('the thrown cleaver flies out and comes back', () => {
    const { game } = readyForBoss();
    const b = boss(game);
    game.player.inv = 99;
    b.boss!.move = 'throw';
    Object.assign(b, { state: 'wind', timer: 0, lock: -1, face: -1 });
    run(game, 1);
    const cleaver = game.arrows.find((a) => a.spin)!;
    expect(cleaver.vx).toBeLessThan(0);
    run(game, 60);
    expect(cleaver.vx).toBeGreaterThan(0);
  });


  it('keeps the player inside the arena while alive', () => {
    const { game } = readyForBoss();
    game.player.inv = 99;
    stand(game, 'Trono', 10);
    run(game, 30, { moveX: -1 });
    expect(game.room.id).toBe('Trono');
  });


  it('at half health Groth calls two hobgoblins and two archers, once', () => {
    const { game } = readyForBoss();
    const b = boss(game);
    game.player.inv = 99;
    b.ground = true;
    b.hp = 17;
    run(game, 1);
    expect(b.boss!.phase).toBe(0);
    b.hp = 16;
    run(game, 1);
    expect(b.boss!.phase).toBe(1);
    expect(b.state).toBe('transition');
    expect(b.boss!.guard).toBe(false);
    expect(game.enemies.some((e) => e.summoned)).toBe(false);
    b.timer = 0;
    run(game, 1);
    expect(game.enemies.filter((e) => e.summoned && e.kind === 'hob')).toHaveLength(2);
    expect(game.enemies.filter((e) => e.summoned && e.kind === 'archer')).toHaveLength(2);
    Object.assign(b, { hp: 10, state: 'idle', timer: 0 });
    run(game, 1);
    expect(game.enemies.filter((e) => e.summoned)).toHaveLength(4);
    expect(b.state).toBe('wind');
  });

  it('victory clears reinforcements, persists and never resurrects the boss', () => {
    const { game, storage } = readyForBoss();
    const b = boss(game);
    Object.assign(b, { hp: 16, ground: true });
    game.player.inv = 99;
    run(game, 1);
    b.timer = 0;
    run(game, 1);
    game.hitEnemy(b, 99);
    expect(game.mode).toBe('win');
    expect(game.enemies.some((e) => e.summoned)).toBe(false);
    expect(game.arrows).toHaveLength(0);
    expect(makeGame(storage).game.store.load()!.flags.has('boss:groth')).toBe(true);
    game.mode = 'play';
    stand(game, 'Umbral', 99);
    game.interact();
    stand(game, 'Trono', 200);
    expect(game.enemies.some((e) => e.boss)).toBe(false);
  });

  it('a new attempt starts again from the first phase', () => {
    const { game } = readyForBoss();
    boss(game).boss!.phase = 1;
    stand(game, 'Sendero', 1300);
    stand(game, 'Trono', 200);
    expect(boss(game).boss!.phase).toBe(0);
  });
});
