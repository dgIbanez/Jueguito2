import { describe, expect, it } from 'vitest';
import { PHYS, STEP } from '../../src/config.ts';
import { createPlayer, idleIntent, updatePlayer, type Intent, type Player } from '../../src/entities/player.ts';
import { moveBody } from '../../src/world/collision.ts';
import { asciiRoom } from './helpers.ts';

// 20 columns × 12 rows; floor top at y = 240 (row 10).
const room = asciiRoom([
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#......#...........#',
  '#......#...........#',
  '#......#....----...#',
  '#......#...........#',
  '#......#.......^^^.#',
  '####################',
  '####################',
]);

const all = new Set(['dash', 'double_jump', 'wall_jump']);

function sim(p: Player, frames: number, intent: Partial<Intent> = {}, abilities: ReadonlySet<string> = new Set()) {
  let top = p.y;
  for (let i = 0; i < frames; i++) {
    updatePlayer(p, { ...idleIntent(), ...intent }, abilities, room, STEP);
    top = Math.min(top, p.y);
  }
  return top;
}

const standing = (x = 216) => {
  const p = createPlayer(x, 240 - 32);
  sim(p, 2);
  return p;
};

describe('player movement', () => {
  it('lands on solid ground', () => {
    const p = createPlayer(216, 100);
    sim(p, 60);
    expect(p.ground).toBe(true);
    expect(p.y).toBe(208);
  });

  it('a held jump rises at least 110px; a tap is much lower', () => {
    const held = standing();
    const top = sim(held, 1, { jumpPressed: true, jumpHeld: true });
    expect(208 - Math.min(top, sim(held, 40, { jumpHeld: true }))).toBeGreaterThanOrEqual(110);
    const tap = standing();
    sim(tap, 1, { jumpPressed: true, jumpHeld: true });
    expect(208 - sim(tap, 40)).toBeLessThan(60);
  });

  it('buffers a jump pressed shortly before landing', () => {
    const p = createPlayer(216, 240 - 32 - 6);
    p.vy = 300;
    sim(p, 1, { jumpPressed: true, jumpHeld: true });
    expect(p.ground).toBe(false);
    sim(p, 3, { jumpHeld: true });
    expect(p.vy).toBeLessThan(0);
  });

  it('allows a coyote jump just after walking off a ledge', () => {
    const p = createPlayer(216, 240 - 32);
    p.coyote = PHYS.coyote;
    p.ground = false;
    sim(p, 1, { jumpPressed: true, jumpHeld: true });
    expect(p.vy).toBeLessThan(-PHYS.jump + 50);
  });

  it('double jump needs the feather and happens once per airtime', () => {
    const p = standing();
    sim(p, 1, { jumpPressed: true, jumpHeld: true });
    sim(p, 10, { jumpHeld: true });
    const before = p.vy;
    sim(p, 1, { jumpPressed: true, jumpHeld: true });
    expect(p.vy).toBeGreaterThanOrEqual(before);

    const q = standing();
    sim(q, 1, { jumpPressed: true, jumpHeld: true }, all);
    sim(q, 10, { jumpHeld: true }, all);
    sim(q, 1, { jumpPressed: true, jumpHeld: true }, all);
    expect(q.vy).toBeCloseTo(-PHYS.doubleJump + PHYS.gravity * STEP, 0);
    sim(q, 5, { jumpHeld: true }, all);
    const after = q.vy;
    sim(q, 1, { jumpPressed: true, jumpHeld: true }, all);
    expect(q.vy).toBeGreaterThan(after);
  });

  it('slides down walls and wall-jumps away with the claws', () => {
    // Left face of the pillar in column 7 (x = 168), rows 5-9.
    const p = createPlayer(168 - 18 - 0.5, 140);
    p.vy = 300;
    sim(p, 2, { moveX: 1 }, all);
    expect(p.sliding).toBe(true);
    expect(p.vy).toBeLessThanOrEqual(PHYS.wallSlide);
    sim(p, 1, { moveX: 1, jumpPressed: true, jumpHeld: true }, all);
    expect(p.vy).toBeLessThan(-400);
    expect(p.vx).toBeLessThan(0);
    expect(p.face).toBe(-1);

    const q = createPlayer(168 - 18 - 0.5, 140);
    q.vy = 300;
    sim(q, 2, { moveX: 1 });
    expect(q.sliding).toBe(false);
  });

  it('dashes once in the air, ignoring gravity', () => {
    const p = standing(60);
    sim(p, 1, { dashPressed: true }, all);
    expect(p.dash).toBeGreaterThan(0);
    expect(p.vx).toBe(PHYS.dashSpeed);
    const q = standing(230);
    sim(q, 1, { jumpPressed: true, jumpHeld: true }, all);
    sim(q, 3, { jumpHeld: true }, all);
    sim(q, 1, { dashPressed: true }, all);
    expect(q.vy).toBe(0);
    expect(q.airDash).toBe(false);
    q.dash = 0;
    q.dashCool = 0;
    sim(q, 1, { dashPressed: true }, all);
    expect(q.dash).toBe(0);
    const locked = standing(60);
    sim(locked, 1, { dashPressed: true });
    expect(locked.dash).toBe(0);
  });

  it('one-way platforms hold from above, pass from below and drop with down+jump', () => {
    const p = createPlayer(310, 168 - 32 - 40);
    sim(p, 40);
    expect(p.ground).toBe(true);
    expect(p.y).toBe(168 - 32);
    sim(p, 1, { down: true, jumpPressed: true, jumpHeld: true });
    sim(p, 20);
    expect(p.y).toBeGreaterThan(168);

    const below = createPlayer(310, 208);
    below.ground = true;
    sim(below, 1, { jumpPressed: true, jumpHeld: true });
    sim(below, 30, { jumpHeld: true });
    expect(below.y).toBeLessThanOrEqual(168 - 32);
  });

  it('walls block horizontal movement', () => {
    const p = standing(100);
    sim(p, 60, { moveX: 1 });
    expect(p.x + p.w).toBeLessThanOrEqual(168);
  });

  it('remembers the last safe footing away from spikes', () => {
    const p = standing(250);
    sim(p, 5);
    expect(p.safe.x).toBeCloseTo(250, 0);
    sim(p, 40, { moveX: 1 });
    expect(p.safe.x).toBeLessThan(360);
  });

  it('moveBody stops at ceilings', () => {
    const box = asciiRoom(['#####', '#...#', '#...#', '#...#', '#####']);
    const b = { x: 30, y: 30, w: 18, h: 32, vx: 0, vy: -600, ground: false, groundTile: 0, hitWall: 0 };
    moveBody(box, b, STEP);
    moveBody(box, b, STEP);
    expect(b.y).toBe(24);
    expect(b.vy).toBe(0);
  });
});
