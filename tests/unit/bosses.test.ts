import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/index.ts';
import type { Enemy } from '../../src/entities/enemies.ts';
import type { Game } from '../../src/game/game.ts';
import { samplePose } from '../../src/render/skeleton.ts';
import { validateWorld } from '../../src/world/validate.ts';
import { playing, run, stand } from './helpers.ts';

function arena() {
  const setup = playing();
  stand(setup.game, 'Corazon', 200);
  const vharn = setup.game.enemies.find((e) => e.boss)!;
  vharn.ground = true;
  return { ...setup, vharn };
}


/** Makes the boss pick `move` next and enter its windup (running its aim hook). */
function begin(game: Game, e: Enemy, move: string): void {
  const pattern = e.boss!.def.phases[e.boss!.phase].pattern;
  e.boss!.turn = pattern.indexOf(move);
  Object.assign(e, { state: 'idle', timer: 0 });
  run(game, 1);
  expect(e.state).toBe('wind');
  expect(e.boss!.move).toBe(move);
}

/** Runs until the boss starts striking. */
function untilStrike(game: Game, e: Enemy): void {
  for (let i = 0; i < 120 && e.state !== 'strike'; i++) run(game, 1);
}

describe('Vharn', () => {
  it('roars into a faster second phase instead of calling help', () => {
    const { game, vharn } = arena();
    game.player.inv = 99;
    vharn.hp = 23;
    run(game, 1);
    expect(vharn.boss!.phase).toBe(1);
    expect(vharn.state).toBe('transition');
    expect(vharn.boss!.guard).toBe(true);
    game.hitEnemy(vharn, 5);
    expect(vharn.hp).toBe(23);
    vharn.timer = 0;
    run(game, 1);
    expect(vharn.boss!.guard).toBe(false);
    expect(game.enemies.filter((e) => !e.boss)).toHaveLength(0);
    game.hitEnemy(vharn, 5);
    expect(vharn.hp).toBe(18);
    expect(vharn.boss!.def.phases[1].pattern).toContain('shatter');
  });

  it('erupting pillars warn before they hurt, and travel away from him', () => {
    const { game, vharn } = arena();
    begin(game, vharn, 'eruption');
    run(game, 60);
    const pillars = game.hazards.filter((h) => h.kind === 'pillar');
    expect(pillars.length).toBeGreaterThanOrEqual(3);
    expect(pillars.every((h) => h.delay > 0 || h.life > 0)).toBe(true);
    const xs = pillars.map((h) => h.x);
    expect(xs).toEqual([...xs].sort((a, b) => b - a));

    // A pillar under the player only hurts once its warning is over.
    const p = game.player;
    game.hazards = [{ kind: 'pillar', x: p.x, y: p.y, w: 28, h: 40, delay: 0.3, life: 0.4, max: 0.4 }];
    run(game, 10);
    expect(p.hp).toBe(5);
    run(game, 20);
    expect(p.hp).toBe(4);
  });

  it('aims the beam at the player during the windup', () => {
    const { game, vharn } = arena();
    game.player.inv = 99;
    begin(game, vharn, 'beam');
    const beam = game.hazards.find((h) => h.kind === 'beam')!;
    expect(beam.delay).toBeGreaterThan(0);
    expect(beam.x).toBe(0);
    expect(beam.y).toBeLessThan(game.player.y + game.player.h);
    expect(beam.y + beam.h).toBeGreaterThan(game.player.y);
  });

  it('rolls and, enraged, bounces off a wall once', () => {
    const { game, vharn } = arena();
    game.player.inv = 99;
    vharn.boss!.phase = 1;
    // Near the right wall, with the player behind him: he rolls into the wall.
    vharn.x = 850;
    game.player.x = 910;
    begin(game, vharn, 'roll');
    untilStrike(game, vharn);
    expect(vharn.boss!.bounces).toBe(1);
    expect(vharn.lock).toBe(1);
    run(game, 20);
    expect(vharn.boss!.bounces).toBe(0);
    expect(vharn.vx).toBeLessThan(0);
  });
});

describe('boss rigs', () => {
  it('sample keyframes with easing and keep the clip base', () => {
    const clip = { base: { torso: 30 }, keys: [{ t: 0, pose: { arm: 0 } }, { t: 1, pose: { arm: 100 } }] };
    expect(samplePose(clip, 0).arm).toBe(0);
    expect(samplePose(clip, 0.5).arm).toBe(50);
    expect(samplePose(clip, 0.25).arm).toBeLessThan(25);
    expect(samplePose(clip, 1).arm).toBe(100);
    expect(samplePose(clip, 0.5).torso).toBe(30);
  });

  it('every boss has a valid rig with idle and attack clips', () => {
    const report = validateWorld(loadContent());
    expect(report.errors).toEqual([]);
    expect(report.warnings.filter((w) => w.startsWith('Esqueleto'))).toEqual([]);
  });

  it('the validator catches a bone hanging from nowhere', () => {
    const content = loadContent();
    content.rigs.golem.bones.push({ id: 'tail', parent: 'nowhere', x: 0, y: 0, parts: [] });
    expect(validateWorld(content).errors.join('\n')).toContain('"tail" cuelga de "nowhere"');
  });
});
