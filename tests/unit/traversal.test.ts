/**
 * Plays the level geometry with real physics and scripted inputs, so each
 * ability gate is proven both passable with the ability and closed without it.
 */
import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/config.ts';
import { idleIntent, type Intent } from '../../src/entities/player.ts';
import type { Game } from '../../src/game/game.ts';
import { supportedAt } from '../../src/world/collision.ts';
import { playing, stand } from './helpers.ts';

type Bot = (game: Game, frame: number) => Partial<Intent> | null;

/** Runs a bot until it returns null or the frame budget ends. */
function drive(game: Game, frames: number, bot: Bot): void {
  for (let i = 0; i < frames; i++) {
    game.player.inv = 99;
    const intent = bot(game, i);
    if (!intent) return;
    game.tick(STEP, { ...idleIntent(), ...intent });
  }
}

function setup(abilities: string[], room: string, x: number, feetY: number) {
  const { game } = playing();
  for (const a of abilities) game.progress.abilities.add(a);
  stand(game, room, x, feetY);
  game.enemies = [];
  return game;
}

/** Alternates wall jumps between the two walls of a chimney until `done`. */
function climb(game: Game, done: (g: Game) => boolean, frames = 1800): void {
  let dir = -1;
  let wait = 0;
  drive(game, frames, (g) => {
    if (done(g)) return null;
    const p = g.player;
    let jump = false;
    if (wait > 0) wait--;
    else if (p.ground) {
      jump = true;
      wait = 6;
    } else if (p.wallCoyote > 0 && p.wallDir === dir) {
      jump = true;
      dir = -dir;
      wait = 6;
    }
    return { moveX: dir, jumpPressed: jump, jumpHeld: true };
  });
}

/**
 * Hops up a staircase of platforms, given bottom-to-top as [left column, row].
 * Past the last one it keeps jumping from it (to leave through the ceiling).
 */
function climbPlatforms(game: Game, route: number[][], done: (g: Game) => boolean, frames = 2400): void {
  const room = game.room.id;
  let targetX = -1;
  drive(game, frames, (g) => {
    if (done(g) || g.room.id !== room) return null;
    const p = g.player;
    const feet = p.y + p.h;
    // From solid footing, aim for the lowest platform still above the feet;
    // keep that aim while airborne, as a player would.
    if (p.ground || targetX < 0) targetX = (route.find(([, row]) => row * 24 < feet) ?? route[route.length - 1])[0] * 24 + 36;
    const moveX = Math.abs(p.x - targetX) > 6 ? Math.sign(targetX - p.x) : 0;
    // Jump when close to the target, or from the edge of the current footing.
    const atEdge = !supportedAt(g.room, moveX > 0 ? p.x + p.w + 4 : p.x - 4, feet);
    const jump = p.ground && (Math.abs(p.x - targetX) < 100 || (atEdge && Math.abs(p.x - targetX) < 220));
    return { moveX, jumpPressed: jump, jumpHeld: true };
  });
}

describe('traversal with real physics', () => {
  it('Umbral: platforms climb to the Archivo without abilities', () => {
    const game = setup([], 'Umbral', 150, 480);
    climbPlatforms(game, [[9, 17], [17, 14], [25, 11], [33, 8], [33, 5], [33, 2]], (g) => g.room.id === 'Archivo');
    expect(game.room.id).toBe('Archivo');
  });

  it('Grieta: platforms climb back up through the throne hatch', () => {
    const game = setup([], 'Grieta', 20 * 24, 648);
    game.progress.flags.add('boss:groth');
    climbPlatforms(game, [[25, 24], [17, 20], [9, 16], [17, 12], [25, 8], [17, 4]], () => false);
    expect(game.room.id).toBe('Trono');
    // Steer off the open hatch to land on the throne floor.
    drive(game, 120, (g) => (g.player.ground ? null : { moveX: 1 }));
    expect(game.room.id).toBe('Trono');
    expect(game.player.y + game.player.h).toBe(480);
  });

  it('Cavernas: the Céfiro page is reachable without abilities', () => {
    const game = setup([], 'Cavernas', 38 * 24, 504);
    climbPlatforms(game, [[42, 17], [49, 13]], (g) => g.player.ground && g.player.y + g.player.h === 13 * 24);
    expect(game.player.y + game.player.h).toBe(13 * 24);
    expect(game.interactTarget()?.type).toBe('Page');
  });

  it('Lago: the Escarcha shelf needs the claws', () => {
    const reach = (abilities: string[]) => {
      const game = setup(abilities, 'Lago', 3 * 24, 504);
      climb(game, (g) => g.player.y + g.player.h <= 4 * 24 - 30, 900);
      drive(game, 300, (g) => (g.player.ground && g.player.x > 8 * 24 ? null : { moveX: 1 }));
      return game.player.y + game.player.h === 4 * 24;
    };
    expect(reach([])).toBe(false);
    expect(reach(['wall_jump'])).toBe(true);
  });

  it('Grieta: the crystal veil bars the arena until the wind breaks it', () => {
    const walkRight = (open: boolean) => {
      const game = setup([], 'Grieta', 30 * 24, 648);
      if (open) game.progress.flags.add('gate:velo_cristal');
      drive(game, 180, (g) => (g.room.id === 'Corazon' ? null : { moveX: 1 }));
      return game.room.id;
    };
    expect(walkRight(false)).toBe('Grieta');
    expect(walkRight(true)).toBe('Corazon');
  });

  it('the cavern floor connects the Grieta, the Cavernas and the Lago', () => {
    const game = setup([], 'Grieta', 3 * 24, 648);
    drive(game, 120, (g) => (g.room.id === 'Cavernas' ? null : { moveX: -1 }));
    expect(game.room.id).toBe('Cavernas');
    game.enterRoom('Cavernas', 6 * 24, 504 - 32);
    game.enemies = [];
    drive(game, 120, (g) => (g.room.id === 'Lago' ? null : { moveX: -1 }));
    expect(game.room.id).toBe('Lago');
  });

  it('Copa: the page ledge needs the dash', () => {
    const tryCross = (abilities: string[]) => {
      const game = setup(abilities, 'Copa', 31 * 24 + 4, 288);
      let t = 0;
      drive(game, 180, (g) => {
        t++;
        if (g.player.ground && t > 10) return null;
        return { moveX: 1, jumpPressed: t === 1, jumpHeld: true, dashPressed: t === 18 };
      });
      return game.player.ground && game.player.y + game.player.h === 288 && game.player.x + game.player.w > 41 * 24;
    };
    expect(tryCross([])).toBe(false);
    expect(tryCross(['dash'])).toBe(true);
  });

  it('Copa: the chimney to the Nido needs the claws', () => {
    const blocked = setup([], 'Copa', 5 * 24, 480);
    climb(blocked, (g) => g.room.id === 'Nido', 900);
    expect(blocked.room.id).not.toBe('Nido');
    const game = setup(['wall_jump'], 'Copa', 5 * 24, 480);
    climb(game, (g) => g.room.id === 'Nido');
    expect(game.room.id).toBe('Nido');
  });

  it('Pozo: the claws climb back out of the shaft', () => {
    const game = setup(['wall_jump'], 'Pozo', 11 * 24, 43 * 24);
    climb(game, (g) => g.player.y + g.player.h <= 480 - 30);
    drive(game, 600, (g) => (g.room.id === 'Vigilia' ? null : { moveX: -1 }));
    expect(game.room.id).toBe('Vigilia');
  });

  it('Nido: the chimney leads to the feather', () => {
    const game = setup(['wall_jump'], 'Nido', 36 * 24, 27 * 24);
    climb(game, (g) => g.player.y + g.player.h <= 6 * 24 - 30);
    drive(game, 600, (g) => (g.player.ground && g.player.x < 25 * 24 ? null : { moveX: -1, jumpHeld: true }));
    expect(game.player.y + game.player.h).toBe(6 * 24);
    expect(game.player.x).toBeLessThan(25 * 24);
  });

  it('Nido: the tunnel to the Galería needs the double jump', () => {
    const reach = (abilities: string[]) => {
      const game = setup(abilities, 'Nido', 6 * 24, 23 * 24);
      let t = 0;
      drive(game, 400, (g) => {
        t++;
        if (g.room.id === 'Galeria') return null;
        return { moveX: t > 4 ? -1 : 0, jumpPressed: t === 1 || t === 26, jumpHeld: true };
      });
      return game.room.id;
    };
    expect(reach(['wall_jump'])).toBe('Nido');
    expect(reach(['wall_jump', 'double_jump'])).toBe('Galeria');
  });

  it('Galería: platforms lead back up to the tunnel with the double jump', () => {
    const game = setup(['wall_jump', 'double_jump'], 'Galeria', 20 * 24, 480);
    const hop = (targetX: number, feet: number) => {
      let t = 0;
      drive(game, 300, (g) => {
        t++;
        const p = g.player;
        if (t > 30 && p.ground) return null;
        return { moveX: Math.abs(p.x - targetX) > 6 ? Math.sign(targetX - p.x) : 0, jumpPressed: t === 1 || t === 24, jumpHeld: true };
      });
      return game.player.y + game.player.h === feet;
    };
    expect(hop(23 * 24, 14 * 24)).toBe(true);
    expect(hop(30 * 24, 9 * 24)).toBe(true);
    drive(game, 300, (g) => (g.room.id === 'Nido' ? null : { moveX: 1 }));
    expect(game.room.id).toBe('Nido');
  });
});
