import type { ArcherDef, BossDef, EnemyDef, MeleeDef } from '../content/types.ts';
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
}

export interface Arrow extends Rect {
  vx: number;
  vy: number;
  life: number;
  friendly?: boolean;
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
  };
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
export function guardLedge(e: Enemy, room: RoomData, dt: number): void {
  if (!e.ground || e.vx === 0 || e.def?.ai !== 'melee') return;
  const dir = Math.sign(e.vx);
  const probe = centerX(e) + e.vx * dt + dir * (e.w / 2 + 3);
  if (!supportedAt(room, probe, e.y + e.h)) e.vx = 0;
}
