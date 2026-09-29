import type { BossDef, BossMoveDef, BossSummon } from '../content/types.ts';
import { centerX, centerY, clamp, overlap, type Rect } from '../core/math.ts';
import { Tile } from '../world/ldtk.ts';
import type { Enemy, EnemyContext, EnemyState } from './enemies.ts';

export interface Wave extends Rect {
  vx: number;
  life: number;
}

/**
 * An area that warns first (delay > 0, harmless) and then hurts for `life`
 * seconds: crystal pillars erupting from the floor, or a light beam.
 */
export interface Hazard extends Rect {
  kind: 'pillar' | 'beam';
  delay: number;
  life: number;
  max: number;
}

export interface BossContext extends EnemyContext {
  spawnWave(wave: Wave): void;
  addHazard(hazard: Hazard): void;
  summon(list: BossSummon[]): void;
  shake(seconds: number): void;
}

export interface BossState {
  id: string;
  def: BossDef;
  /** Index into def.phases. */
  phase: number;
  turn: number;
  move: string;
  target: number;
  /** Length of the current state, so animations can follow its progress. */
  span: number;
  /** Invulnerable (roaring into a new phase). */
  guard: boolean;
  /** Wall bounces left during a roll. */
  bounces: number;
}

export function createBoss(id: string, def: BossDef, ax: number, ay: number): Enemy {
  return {
    id: null, kind: id, look: def.look, def: null,
    x: ax - def.w / 2, y: ay - def.h, w: def.w, h: def.h, vx: 0, vy: 0,
    ground: false, groundTile: Tile.Empty, hitWall: 0,
    hp: def.hp, max: def.hp, face: -1, state: 'idle', timer: 1.5, hit: 0, attackId: -1, lock: -1,
    home: { x: ax - def.w / 2, y: ay - def.h }, frozen: 0, knock: 0, knockVx: 0, burnCd: 0,
    boss: { id, def, phase: 0, turn: 0, move: def.phases[0].pattern[0], target: ax, span: 1.5, guard: false, bounces: 0 },
  };
}

/** From the second phase on, moves use their "Enraged" tuning. */
export const isEnraged = (e: Enemy): boolean => !!e.boss && e.boss.phase > 0;

/** A move's value for the current phase. */
function tune(m: BossMoveDef, key: keyof BossMoveDef, enraged: boolean, fallback: number): number {
  const fast = m[`${key}Enraged` as keyof BossMoveDef] as number | undefined;
  return (enraged && fast !== undefined ? fast : (m[key] as number | undefined)) ?? fallback;
}

function setState(e: Enemy, state: EnemyState, timer: number): void {
  e.state = state;
  e.timer = timer;
  e.boss!.span = timer;
}

/** Crystal pillars erupting one after another, starting near `x0` and moving in `dir`. */
function erupt(ctx: BossContext, floorY: number, x0: number, dir: number, m: BossMoveDef, count: number): void {
  const height = m.height ?? 76;
  for (let i = 0; i < count; i++) {
    const x = x0 + dir * (50 + i * (m.spacing ?? 64)) - 14;
    if (x < 10 || x > ctx.room.w - 38) break;
    const life = m.life ?? 0.45;
    ctx.addHazard({ kind: 'pillar', x, y: floorY - height, w: 28, h: height, delay: (m.delay ?? 0.35) + i * (m.step ?? 0.1), life, max: life });
  }
}

/** Falling crystals around the player, with gaps to dodge through. */
function crystalRain(ctx: BossContext, count: number, speed: number): void {
  const center = centerX(ctx.player);
  for (let i = 0; i < count; i++) {
    const x = clamp(center + (i - (count - 1) / 2) * 84 + (Math.random() - 0.5) * 20, 30, ctx.room.w - 40);
    ctx.fireArrow({ x, y: 26, w: 10, h: 16, vx: 0, vy: speed * (0.75 + Math.random() * 0.5), life: 4, shard: true });
  }
}

type Hook = (e: Enemy, m: BossMoveDef, ctx: BossContext, enraged: boolean) => void;

/** Each attack: optional hook when its windup begins, then start and per-step update while striking. */
const MOVES: Record<string, { wind?: Hook; start: Hook; update: Hook }> = {
  slash: {
    start() {},
    update(e, m, ctx) {
      e.face = e.lock;
      const reach = m.reach ?? 100;
      const box = { x: e.lock > 0 ? e.x + e.w : e.x - reach, y: e.y - 8, w: reach, h: e.h + 13 };
      if (e.timer > m.duration * 0.4 && overlap(ctx.player, box)) ctx.hurtPlayer(centerX(e));
    },
  },
  // A cleaver thrown like a boomerang: it flies out, slows and comes back past its owner.
  throw: {
    start(e, m, ctx, enraged) {
      const speed = tune(m, 'speed', enraged, 430);
      ctx.fireArrow({ x: centerX(e) + e.lock * 30 - 13, y: e.y + e.h * 0.35, w: 26, h: 26, vx: e.lock * speed, vy: 0, ax: -e.lock * (m.accel ?? 560), life: 2.6, pass: true, spin: true });
    },
    update(e) {
      e.face = e.lock;
    },
  },
  leap: {
    start(e, m, ctx) {
      e.vy = -(m.jump ?? 560);
      e.boss!.target = clamp(ctx.player.x, 80, ctx.room.w - 130);
    },
    update(e, m, ctx, enraged) {
      e.vx = (e.boss!.target - e.x) * 2;
      // Land: shockwaves run along the floor in both directions.
      if (e.ground && e.timer < m.duration - 0.5) {
        const speed = tune(m, 'wave', enraged, 220);
        for (const dir of [-1, 1]) ctx.spawnWave({ x: centerX(e), y: e.y + e.h - 22, w: 24, h: 22, vx: dir * speed, life: 3 });
        ctx.shake(0.3);
        e.timer = 0;
      }
    },
  },
  charge: {
    start(e, m, _ctx, enraged) {
      e.boss!.bounces = tune(m, 'bounces', enraged, 0);
    },
    update(e, m, ctx, enraged) {
      // A roll that meets a wall turns around while it has bounces left.
      if (e.hitWall && e.boss!.bounces > 0) {
        e.boss!.bounces--;
        e.lock = e.lock > 0 ? -1 : 1;
        ctx.shake(0.15);
      }
      e.face = e.lock;
      e.vx = e.lock * tune(m, 'speed', enraged, 360);
      if (overlap(ctx.player, e)) ctx.hurtPlayer(centerX(e));
    },
  },
  rain: {
    start(e, m, ctx, enraged) {
      crystalRain(ctx, tune(m, 'count', enraged, 5), tune(m, 'speed', enraged, 300));
      e.vx = 0;
    },
    update(e) {
      e.vx = 0;
    },
  },
  // Pillars travel along the floor toward where the player was.
  eruption: {
    start(e, m, ctx, enraged) {
      ctx.shake(0.2);
      erupt(ctx, e.y + e.h, centerX(e), e.lock, m, tune(m, 'count', enraged, 6));
    },
    update(e) {
      e.vx = 0;
    },
  },
  // The core charges during the windup, aimed at the player's height; then it fires.
  beam: {
    wind(e, m, ctx, enraged) {
      const height = m.height ?? 22;
      const y = clamp(centerY(ctx.player) - height / 2, 30, e.y + e.h - height);
      const x = e.lock > 0 ? e.x + e.w : 0;
      const w = e.lock > 0 ? ctx.room.w - x : e.x;
      const windup = tune(m, 'windup', enraged, 1);
      ctx.addHazard({ kind: 'beam', x, y, w, h: height, delay: windup, life: m.duration, max: m.duration });
    },
    start(_e, _m, ctx) {
      ctx.shake(0.25);
    },
    update(e) {
      e.face = e.lock;
      e.vx = 0;
    },
  },
  // Phase-two finisher: leaps to the middle and lands with waves, pillars and rain.
  shatter: {
    start(e, m, ctx) {
      e.vy = -(m.jump ?? 600);
      e.boss!.target = ctx.room.w / 2 - e.w / 2;
    },
    update(e, m, ctx, enraged) {
      e.vx = (e.boss!.target - e.x) * 2.5;
      if (e.ground && e.timer < m.duration - 0.5) {
        const speed = tune(m, 'wave', enraged, 330);
        for (const dir of [-1, 1]) {
          ctx.spawnWave({ x: centerX(e), y: e.y + e.h - 22, w: 24, h: 22, vx: dir * speed, life: 3 });
          erupt(ctx, e.y + e.h, centerX(e), dir, m, tune(m, 'count', enraged, 4));
        }
        crystalRain(ctx, 6, 340);
        ctx.shake(0.5);
        e.timer = 0;
      }
    },
  },
};

// Rolling is a charge with its own animation.
MOVES.roll = MOVES.charge;

/** Moves that exist in the engine, for the data validator. */
export const BOSS_MOVES = new Set(Object.keys(MOVES));

export function updateBoss(e: Enemy, ctx: BossContext): void {
  const b = e.boss!;
  // Crossing a phase threshold: land, then call help or roar (invulnerable).
  const next = b.def.phases[b.phase + 1];
  if (next && e.hp <= e.max * next.at && e.ground && e.state !== 'transition') {
    b.phase++;
    b.turn = 0;
    b.guard = next.transition?.kind === 'roar';
    e.vx = 0;
    setState(e, 'transition', next.transition?.time ?? 0.8);
    ctx.sound(b.guard ? 60 : 75, 0.6, 'sawtooth');
    ctx.shake(b.guard ? 0.8 : 0.2);
  }
  if (e.state === 'transition') {
    e.vx = 0;
    if (e.timer <= 0) {
      const transition = b.def.phases[b.phase].transition;
      if (transition?.kind === 'summon' && transition.summon) ctx.summon(transition.summon);
      b.guard = false;
      setState(e, 'recover', 0.8);
    }
    return;
  }
  const enraged = isEnraged(e);
  const move = b.def.moves[b.move];
  if (e.state === 'idle' && e.timer <= 0) {
    const pattern = b.def.phases[b.phase].pattern;
    b.move = pattern[b.turn++ % pattern.length];
    const next = b.def.moves[b.move];
    e.lock = e.face;
    setState(e, 'wind', tune(next, 'windup', enraged, 0.9));
    MOVES[b.move]?.wind?.(e, next, ctx, enraged);
  } else if (e.state === 'wind' && e.timer <= 0) {
    setState(e, 'strike', move.duration);
    MOVES[b.move]?.start(e, move, ctx, enraged);
    ctx.sound(95, 0.2, 'sawtooth');
  } else if (e.state === 'strike') {
    MOVES[b.move]?.update(e, move, ctx, enraged);
    if (e.timer <= 0) setState(e, 'recover', tune(move, 'recover', enraged, 1));
  } else if (e.state === 'recover' && e.timer <= 0) setState(e, 'idle', 0.35);
}

/** Windup length of the current move, for telegraph animations. */
export function windupLength(e: Enemy): number {
  if (!e.boss) return 1;
  return tune(e.boss.def.moves[e.boss.move], 'windup', isEnraged(e), 0.9);
}

/** How far through its current state the boss is, 0 to 1. */
export const stateProgress = (e: Enemy): number => (e.boss && e.boss.span > 0 ? Math.min(1, Math.max(0, 1 - e.timer / e.boss.span)) : 0);
