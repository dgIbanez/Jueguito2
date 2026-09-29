import type { ArcherDef, BossDef, EnemyDef, FlyerDef, MeleeDef } from '../content/types.ts';
import { centerX, centerY, overlap, type Rect } from '../core/math.ts';
import { supportedAt, type Body } from '../world/collision.ts';
import { Tile, type RoomData } from '../world/ldtk.ts';
import type { Player } from './player.ts';

export type EnemyState = 'idle' | 'wind' | 'strike' | 'recover' | 'summon';

export interface BossState {
  id: string;
  def: BossDef;
  turn: number;
  move: string;
  hordeCalled: boolean;
  target: number;
}

export interface Enemy extends Body {
  /** Stable LDtk iid for persistent kills; null for summoned or boss units. */
  id: string | null;
  kind: string;
  look: string;
  def: EnemyDef | null;
  hp: number;
  max: number;
  face: 1 | -1;
  state: EnemyState;
  timer: number;
  hit: number;
  /** Sword swing that last hit this enemy, so each swing hits once. */
  attackId: number;
  lock: 1 | -1;
  aim?: { x: number; y: number };
  summoned?: boolean;
  boss?: BossState;
  /** Where the enemy spawned; flyers return here between swoops. */
  home: { x: number; y: number };
  /** Seconds left frozen by frost magic: no movement, no attacks. */
  frozen: number;
  /** Seconds left being pushed by wind; the AI waits meanwhile. */
  knock: number;
  knockVx: number;
  /** Cooldown between burns from a fiery shield. */
  burnCd: number;
}

export interface Arrow extends Rect {
  vx: number;
  vy: number;
  life: number;
  friendly?: boolean;
  /** Damage when reflected back at enemies. */
  damage?: number;
  /** Falling crystal instead of an arrow (drawn differently). */
  shard?: boolean;
}

/** What enemy behaviors may read or trigger in the game. */
export interface EnemyContext {
  player: Player;
  room: RoomData;
  hurtPlayer(sourceX: number): void;
  fireArrow(arrow: Arrow): void;
  sound(freq: number, duration: number, type?: OscillatorType): void;
}

export function createEnemy(kind: string, def: EnemyDef, ax: number, ay: number, id: string | null): Enemy {
  return {
    id, kind, def, look: def.look,
    x: ax - def.w / 2, y: ay - def.h, w: def.w, h: def.h, vx: 0, vy: 0,
    ground: false, groundTile: Tile.Empty, hitWall: 0,
    hp: def.hp, max: def.hp, face: -1, state: 'idle', timer: 0.7, hit: 0, attackId: -1, lock: -1,
    home: { x: ax - def.w / 2, y: ay - def.h }, frozen: 0, knock: 0, knockVx: 0, burnCd: 0,
  };
}

/**
 * Flyers drift around their roost, lock onto the player during a visible
 * windup, then dive in a straight line and glide back home.
 */
export function updateFlyer(e: Enemy, def: FlyerDef, ctx: EnemyContext, time: number): void {
  const p = ctx.player;
  const dx = centerX(p) - centerX(e);
  const dy = centerY(p) - centerY(e);
  e.vx = 0;
  e.vy = 0;
  if (e.state === 'idle') {
    e.vx = Math.cos(time * 1.7 + e.home.x) * 40 + (e.home.x - e.x) * 1.5;
    e.vy = Math.sin(time * 2.3 + e.home.y) * 30 + (e.home.y - e.y) * 1.5;
    if (e.timer <= 0 && Math.hypot(dx, dy) < def.range) {
      e.state = 'wind';
      e.timer = def.windup;
      const length = Math.max(1, Math.hypot(dx, dy));
      e.aim = { x: dx / length, y: dy / length };
      e.lock = dx < 0 ? -1 : 1;
    }
  } else if (e.state === 'wind') {
    e.face = e.lock;
    if (e.timer <= 0) {
      e.state = 'strike';
      e.timer = def.swoop;
      ctx.sound(640, 0.1, 'square');
    }
  } else if (e.state === 'strike') {
    e.face = e.lock;
    e.vx = (e.aim?.x ?? 0) * def.speed;
    e.vy = (e.aim?.y ?? 0) * def.speed;
    if (overlap(p, e)) ctx.hurtPlayer(centerX(e));
    if (e.timer <= 0 || e.hitWall) {
      e.state = 'recover';
      e.timer = def.recover;
    }
  } else if (e.state === 'recover') {
    const hx = e.home.x - e.x;
    const hy = e.home.y - e.y;
    const length = Math.max(1, Math.hypot(hx, hy));
    const speed = Math.min(def.speed * 0.45, length * 4);
    e.vx = (hx / length) * speed;
    e.vy = (hy / length) * speed;
    if (e.timer <= 0) {
      e.state = 'idle';
      e.timer = 0.6;
    }
  }
}

export function updateMelee(e: Enemy, def: MeleeDef, ctx: EnemyContext): void {
  const p = ctx.player;
  const dx = centerX(p) - centerX(e);
  const dy = p.y + p.h - (e.y + e.h);
  if (e.state === 'idle') {
    if (Math.abs(dx) < def.trigger && Math.abs(dy) < 55) {
      e.state = 'wind';
      e.timer = def.windup;
      e.lock = e.face;
    } else if (Math.abs(dx) < def.detect && Math.abs(dy) < 240) e.vx = e.face * def.speed;
  } else if (e.state === 'wind' && e.timer <= 0) {
    e.state = 'strike';
    e.timer = def.strike;
  } else if (e.state === 'strike') {
    // The lunge keeps the direction chosen during the windup.
    e.face = e.lock;
    e.vx = e.lock * def.speed;
    const box = { x: e.face > 0 ? e.x + e.w : e.x - def.reach, y: e.y, w: def.reach, h: e.h };
    if (overlap(p, box)) ctx.hurtPlayer(centerX(e));
    if (e.timer <= 0) {
      e.state = 'recover';
      e.timer = def.recover;
    }
  } else if (e.state === 'recover' && e.timer <= 0) e.state = 'idle';
}

/** Archers lock their aim during the windup, leaving time to dodge. */
export function updateArcher(e: Enemy, def: ArcherDef, ctx: EnemyContext): void {
  const p = ctx.player;
  if (e.state === 'idle' && e.timer <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < def.range) {
    e.state = 'wind';
    e.timer = def.windup;
    const dx = centerX(p) - centerX(e);
    const dy = centerY(p) - (e.y + 16);
    const length = Math.max(1, Math.hypot(dx, dy));
    e.aim = { x: dx / length, y: dy / length };
    e.lock = e.face;
  } else if (e.state === 'wind') {
    e.face = e.lock;
    if (e.timer <= 0 && e.aim) {
      ctx.fireArrow({ x: centerX(e) + e.aim.x * 18, y: e.y + 16 + e.aim.y * 18, w: 8, h: 6, vx: e.aim.x * def.arrowSpeed, vy: e.aim.y * def.arrowSpeed, life: 3 });
      e.state = 'recover';
      e.timer = def.recover;
      ctx.sound(460, 0.08);
    }
  } else if (e.state === 'recover' && e.timer <= 0) {
    e.state = 'idle';
    e.timer = def.rest;
  }
}

/** Keeps grounded walkers on connected footing, including during lunges. */
export function guardLedge(e: Enemy, room: RoomData, dt: number, solids: Rect[] = []): void {
  if (!e.ground || e.vx === 0 || e.def?.ai !== 'melee') return;
  const dir = Math.sign(e.vx);
  const probe = centerX(e) + e.vx * dt + dir * (e.w / 2 + 3);
  const foot = e.y + e.h + 1;
  // Closed gates (like a floor hatch) are footing too.
  const onGate = solids.some((s) => probe >= s.x && probe <= s.x + s.w && foot >= s.y && foot <= s.y + s.h);
  if (!onGate && !supportedAt(room, probe, e.y + e.h)) e.vx = 0;
}
