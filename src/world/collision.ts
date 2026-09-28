import { overlap, type Rect } from '../core/math.ts';
import { Tile, tileAt, type RoomData } from './ldtk.ts';

export interface Body extends Rect {
  vx: number;
  vy: number;
  ground: boolean;
  /** Tile value under the feet while grounded. */
  groundTile: number;
  /** Side of the last horizontal collision: -1, 0 or 1. */
  hitWall: number;
  /** While positive, one-way platforms are ignored (dropping through). */
  dropTimer?: number;
}

const EPS = 0.001;

/**
 * Axis-separated movement against the tile grid and dynamic solids (gates).
 * Speeds stay below one tile per step, so checking the leading edge suffices.
 */
export function moveBody(room: RoomData, b: Body, dt: number, solids: Rect[] = []): void {
  const T = room.tile;
  b.hitWall = 0;

  let nx = b.x + b.vx * dt;
  if (b.vx !== 0) {
    const edge = b.vx > 0 ? nx + b.w - EPS : nx;
    const cx = Math.floor(edge / T);
    const top = Math.floor(b.y / T);
    const bottom = Math.floor((b.y + b.h - EPS) / T);
    for (let cy = top; cy <= bottom; cy++) {
      if (tileAt(room, cx, cy) !== Tile.Solid) continue;
      nx = b.vx > 0 ? cx * T - b.w : (cx + 1) * T;
      b.hitWall = Math.sign(b.vx);
      b.vx = 0;
      break;
    }
  }
  for (const s of solids) {
    if (!overlap({ x: nx, y: b.y, w: b.w, h: b.h }, s)) continue;
    const fromLeft = b.x + b.w / 2 < s.x + s.w / 2;
    nx = fromLeft ? s.x - b.w : s.x + s.w;
    b.hitWall = fromLeft ? 1 : -1;
    b.vx = 0;
  }
  b.x = nx;

  let ny = b.y + b.vy * dt;
  b.ground = false;
  b.groundTile = Tile.Empty;
  const left = Math.floor(b.x / T);
  const right = Math.floor((b.x + b.w - EPS) / T);
  if (b.vy > 0) {
    const prevBottom = b.y + b.h;
    const cy = Math.floor((ny + b.h - EPS) / T);
    const top = cy * T;
    for (let cx = left; cx <= right; cx++) {
      const t = tileAt(room, cx, cy);
      const oneWay = t === Tile.OneWay && prevBottom <= top + 0.5 && !((b.dropTimer ?? 0) > 0);
      if (t !== Tile.Solid && !oneWay) continue;
      ny = top - b.h;
      b.vy = 0;
      b.ground = true;
      b.groundTile = t;
      break;
    }
  } else if (b.vy < 0) {
    const cy = Math.floor(ny / T);
    for (let cx = left; cx <= right; cx++) {
      if (tileAt(room, cx, cy) !== Tile.Solid) continue;
      ny = (cy + 1) * T;
      b.vy = 0;
      break;
    }
  }
  for (const s of solids) {
    if (!overlap({ x: b.x, y: ny, w: b.w, h: b.h }, s)) continue;
    if (b.y + b.h / 2 < s.y + s.h / 2) {
      ny = s.y - b.h;
      b.ground = true;
      b.groundTile = Tile.Solid;
    } else ny = s.y + s.h;
    b.vy = 0;
  }
  b.y = ny;
}

/** True when a solid tile touches the body's side `dir` (-1 left, 1 right). */
export function touchingWall(room: RoomData, b: Rect, dir: number): boolean {
  const T = room.tile;
  const cx = Math.floor((dir > 0 ? b.x + b.w + 1 : b.x - 1) / T);
  const top = Math.floor((b.y + 4) / T);
  const bottom = Math.floor((b.y + b.h - 4) / T);
  for (let cy = top; cy <= bottom; cy++) if (tileAt(room, cx, cy) === Tile.Solid) return true;
  return false;
}

/** Whether the point just below `footY` at `x` can be stood on. */
export function supportedAt(room: RoomData, x: number, footY: number): boolean {
  const t = tileAt(room, Math.floor(x / room.tile), Math.floor((footY + 1) / room.tile));
  return t === Tile.Solid || t === Tile.OneWay;
}

/** Overlap test against a tile type, shrinking the rect so grazing does not count. */
export function touchesTile(room: RoomData, r: Rect, type: number, inset = 4): boolean {
  const T = room.tile;
  const x0 = Math.floor((r.x + inset) / T);
  const x1 = Math.floor((r.x + r.w - inset) / T);
  const y0 = Math.floor((r.y + inset) / T);
  const y1 = Math.floor((r.y + r.h - inset) / T);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (tileAt(room, cx, cy) === type) return true;
  return false;
}

/** Whether any solid tile overlaps the rect (used by projectiles). */
export const hitsSolid = (room: RoomData, r: Rect): boolean => touchesTile(room, r, Tile.Solid, 1);

/** Top of the first standable tile at or below `y` in column `x`, or null. */
export function surfaceBelow(room: RoomData, x: number, y: number): number | null {
  const T = room.tile;
  const cx = Math.floor(x / T);
  for (let cy = Math.floor(y / T); cy < room.rows; cy++) {
    const t = tileAt(room, cx, cy);
    if (t === Tile.Solid || t === Tile.OneWay) return cy * T;
  }
  return null;
}
