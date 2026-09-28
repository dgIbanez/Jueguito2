import type { BossDef, BossMoveDef } from '../content/types.ts';
import { centerX, clamp, overlap, type Rect } from '../core/math.ts';
import { Tile } from '../world/ldtk.ts';
import type { Enemy, EnemyContext } from './enemies.ts';

export interface Wave extends Rect {
  vx: number;
  life: number;
}

export interface BossContext extends EnemyContext {
  spawnWave(wave: Wave): void;
  summon(list: BossDef['summon']): void;
  shake(seconds: number): void;
}

export function createBoss(id: string, def: BossDef, ax: number, ay: number): Enemy {
  return {
    id: null, kind: id, look: def.look, def: null,
    x: ax - def.w / 2, y: ay - def.h, w: def.w, h: def.h, vx: 0, vy: 0,
    ground: false, groundTile: Tile.Empty, hitWall: 0,
    hp: def.hp, max: def.hp, face: -1, state: 'idle', timer: 1.5, hit: 0, attackId: -1, lock: -1,
    boss: { id, def, turn: 0, move: def.pattern[0], hordeCalled: false, target: ax },
  };
}

export const isEnraged = (e: Enemy): boolean => !!e.boss && e.hp <= e.max * e.boss.def.enrageAt;

const pick = (enraged: boolean, normal: number, fast: number | undefined): number => (enraged && fast !== undefined ? fast : normal);

/** Per-move behavior while striking. Each returns nothing; timers drive the flow. */
const STRIKES: Record<string, { start(e: Enemy, m: BossMoveDef, ctx: BossContext, enraged: boolean): void; update(e: Enemy, m: BossMoveDef, ctx: BossContext, enraged: boolean): void }> = {
  slash: {
    start() {},
    update(e, m, ctx) {
      e.face = e.lock;
      const reach = m.reach ?? 100;
      const box = { x: e.lock > 0 ? e.x + e.w : e.x - reach, y: e.y - 8, w: reach, h: e.h + 13 };
      if (overlap(ctx.player, box)) ctx.hurtPlayer(centerX(e));
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
        const speed = pick(enraged, m.wave ?? 220, m.waveEnraged);
        for (const dir of [-1, 1]) ctx.spawnWave({ x: centerX(e), y: e.y + e.h - 22, w: 24, h: 22, vx: dir * speed, life: 3 });
        ctx.shake(0.3);
        e.timer = 0;
      }
    },
  },
  charge: {
    start() {},
    update(e, m, ctx, enraged) {
      e.face = e.lock;
      e.vx = e.lock * pick(enraged, m.speed ?? 360, m.speedEnraged);
      if (overlap(ctx.player, e)) ctx.hurtPlayer(centerX(e));
    },
  },
};

export function updateBoss(e: Enemy, ctx: BossContext): void {
  const b = e.boss!;
  const enraged = isEnraged(e);
  // At half health the boss lands, raises its weapon and calls reinforcements once.
  if (enraged && !b.hordeCalled && e.ground) {
    b.hordeCalled = true;
    e.state = 'summon';
    e.timer = b.def.summonTime;
    e.vx = 0;
    ctx.sound(75, 0.5, 'sawtooth');
  }
  if (e.state === 'summon') {
    if (e.timer <= 0) {
      ctx.summon(b.def.summon);
      e.state = 'recover';
      e.timer = 1.2;
    }
    return;
  }
  const move = b.def.moves[b.move];
  if (e.state === 'idle' && e.timer <= 0) {
    b.move = b.def.pattern[b.turn++ % b.def.pattern.length];
    const next = b.def.moves[b.move];
    e.state = 'wind';
    e.timer = pick(enraged, next.windup, next.windupEnraged);
    e.lock = e.face;
  } else if (e.state === 'wind' && e.timer <= 0) {
    e.state = 'strike';
    e.timer = move.duration;
    STRIKES[b.move]?.start(e, move, ctx, enraged);
    ctx.sound(95, 0.2, 'sawtooth');
  } else if (e.state === 'strike') {
    STRIKES[b.move]?.update(e, move, ctx, enraged);
    if (e.timer <= 0) {
      e.state = 'recover';
      e.timer = pick(enraged, move.recover, move.recoverEnraged);
    }
  } else if (e.state === 'recover' && e.timer <= 0) {
    e.state = 'idle';
    e.timer = 0.35;
  }
}

/** Windup length of the current move, for telegraph animations. */
export function windupLength(e: Enemy): number {
  if (!e.boss) return 1;
  const m = e.boss.def.moves[e.boss.move];
  return pick(isEnraged(e), m.windup, m.windupEnraged);
}
