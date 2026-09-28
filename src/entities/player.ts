import { PHYS, PLAYER } from '../config.ts';
import type { Rect } from '../core/math.ts';
import { moveBody, supportedAt, touchesTile, touchingWall, type Body } from '../world/collision.ts';
import { Tile, type RoomData } from '../world/ldtk.ts';

/** One simulation step of player input, independent of key bindings. */
export interface Intent {
  moveX: number;
  down: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  attackPressed: boolean;
  dashPressed: boolean;
  interactPressed: boolean;
  castSlot: 0 | 1 | 2;
}

export const idleIntent = (): Intent => ({
  moveX: 0,
  down: false,
  jumpPressed: false,
  jumpHeld: false,
  attackPressed: false,
  dashPressed: false,
  interactPressed: false,
  castSlot: 0,
});

export interface Player extends Body {
  face: 1 | -1;
  hp: number;
  mana: number;
  inv: number;
  attack: number;
  attackDown: boolean;
  cool: number;
  dash: number;
  dashCool: number;
  airDash: boolean;
  airJumps: number;
  coyote: number;
  jumpBuffer: number;
  /** A jump in progress that can still be cut short by releasing the button. */
  jumping: boolean;
  sliding: boolean;
  wallDir: number;
  wallCoyote: number;
  wallLock: number;
  magicCool: number;
  shield: number;
  /** Last solid footing, where hazards send the player back. */
  safe: { x: number; y: number };
}

export interface PlayerEvents {
  jumped: boolean;
  doubleJumped: boolean;
  wallJumped: boolean;
  dashed: boolean;
  attacked: boolean;
}

export function createPlayer(x: number, y: number): Player {
  return {
    x, y, w: PLAYER.w, h: PLAYER.h, vx: 0, vy: 0, ground: false, groundTile: Tile.Empty, hitWall: 0, dropTimer: 0,
    face: 1, hp: PLAYER.maxHp, mana: PLAYER.maxMana, inv: 0, attack: 0, attackDown: false, cool: 0,
    dash: 0, dashCool: 0, airDash: true, airJumps: 0, coyote: 0, jumpBuffer: 0, jumping: false,
    sliding: false, wallDir: 0, wallCoyote: 0, wallLock: 0, magicCool: 0, shield: 0, safe: { x, y },
  };
}

const TIMERS = ['inv', 'attack', 'cool', 'dash', 'dashCool', 'magicCool', 'shield', 'wallLock', 'dropTimer', 'jumpBuffer', 'wallCoyote'] as const;

export function updatePlayer(p: Player, intent: Intent, abilities: ReadonlySet<string>, room: RoomData, dt: number, solids: Rect[] = []): PlayerEvents {
  const ev: PlayerEvents = { jumped: false, doubleJumped: false, wallJumped: false, dashed: false, attacked: false };
  for (const k of TIMERS) p[k] = Math.max(0, (p[k] ?? 0) - dt);
  const canWall = abilities.has('wall_jump');
  const extraJumps = abilities.has('double_jump') ? 1 : 0;

  if (intent.jumpPressed) p.jumpBuffer = PHYS.buffer;
  if (p.ground) {
    p.coyote = PHYS.coyote;
    p.airJumps = extraJumps;
    p.airDash = true;
  } else p.coyote = Math.max(0, p.coyote - dt);

  // Wall contact: hold toward a wall while airborne to cling and slide.
  p.sliding = false;
  if (canWall && !p.ground && p.dash <= 0 && intent.moveX !== 0 && touchingWall(room, p, intent.moveX)) {
    p.wallDir = intent.moveX;
    p.wallCoyote = PHYS.wallCoyote;
    p.sliding = p.vy > 0;
    p.airJumps = extraJumps;
    p.airDash = true;
  }

  if (p.dash > 0) p.vx = p.face * PHYS.dashSpeed;
  else if (p.wallLock <= 0) {
    p.vx = intent.moveX * PHYS.run;
    if (intent.moveX) p.face = intent.moveX > 0 ? 1 : -1;
  }

  if (p.jumpBuffer > 0) {
    if (intent.down && p.ground && p.groundTile === Tile.OneWay) {
      p.dropTimer = PHYS.dropThrough;
      p.jumpBuffer = 0;
    } else if (p.coyote > 0) {
      p.vy = -PHYS.jump;
      p.coyote = 0;
      ev.jumped = true;
    } else if (canWall && p.wallCoyote > 0) {
      p.vy = -PHYS.wallJumpY;
      p.vx = -p.wallDir * PHYS.wallJumpX;
      p.face = p.wallDir > 0 ? -1 : 1;
      p.wallLock = PHYS.wallLock;
      p.wallCoyote = 0;
      ev.wallJumped = true;
    } else if (intent.jumpPressed && p.airJumps > 0) {
      p.airJumps--;
      p.vy = -PHYS.doubleJump;
      ev.doubleJumped = true;
    }
    if (ev.jumped || ev.wallJumped || ev.doubleJumped) {
      p.jumpBuffer = 0;
      p.jumping = true;
      p.ground = false;
      p.dash = 0;
    }
  }

  // Variable height: releasing the button early cuts the ascent.
  if (p.jumping && !intent.jumpHeld && p.vy < 0) {
    p.vy *= PHYS.jumpCut;
    p.jumping = false;
  }
  if (p.vy >= 0) p.jumping = false;

  if (intent.dashPressed && abilities.has('dash') && p.dashCool <= 0 && (p.ground || p.airDash)) {
    if (p.sliding) p.face = p.wallDir > 0 ? -1 : 1;
    if (!p.ground) p.airDash = false;
    p.dash = PHYS.dashTime;
    p.dashCool = PHYS.dashCool;
    p.vx = p.face * PHYS.dashSpeed;
    p.vy = 0;
    p.jumping = false;
    ev.dashed = true;
  }

  if (p.dash > 0) p.vy = 0;
  else p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.gravity * dt);
  if (p.sliding) p.vy = Math.min(p.vy, PHYS.wallSlide);

  moveBody(room, p, dt, solids);

  if (intent.attackPressed && p.cool <= 0) {
    p.attack = PLAYER.attackTime;
    p.cool = PLAYER.attackCool;
    p.attackDown = intent.down && !p.ground;
    ev.attacked = true;
  }

  if (p.ground && p.groundTile === Tile.Solid && supportedAt(room, p.x, p.y + p.h) && supportedAt(room, p.x + p.w, p.y + p.h) && !touchesTile(room, p, Tile.Spikes, 0))
    p.safe = { x: p.x, y: p.y };
  return ev;
}

/** The sword's reach for the current swing. */
export function swordBox(p: Player): Rect {
  if (p.attackDown) return { x: p.x - 14, y: p.y + p.h - 4, w: p.w + 28, h: 44 };
  return { x: p.face > 0 ? p.x + p.w : p.x - 46, y: p.y - 2, w: 46, h: 39 };
}

/** Downward strikes bounce the player off whatever they hit. */
export function pogo(p: Player, extraJumps: number): void {
  p.vy = -PHYS.pogo;
  p.jumping = false;
  p.airDash = true;
  p.airJumps = extraJumps;
}
