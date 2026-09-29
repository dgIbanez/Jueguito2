import { Tile, tileAt, type RoomData } from '../world/ldtk.ts';
import { cellHash, rect, type Ctx } from './draw.ts';

interface Palette {
  soil: string;
  top: string;
  top2: string;
  tuft: string;
  speck: string;
  edge: string;
  line?: string;
}

const EARTH: Palette = { soil: '#29372a', top: '#839552', top2: '#4e673b', tuft: '#6c8448', speck: '#1a2b22', edge: '#1d2a20' };
const CRYSTAL: Palette = { soil: '#262b3d', top: '#6f7fa6', top2: '#3e4868', tuft: '#8fd0e0', speck: '#161a28', edge: '#121524', line: '#1e2334' };
const STONE: Palette = { soil: '#2c3530', top: '#7f8a67', top2: '#4d5844', tuft: '#6c8448', speck: '#1c241f', edge: '#1a211c', line: '#222b24' };

const paletteFor = (biome: string): Palette => (biome === 'caves' ? CRYSTAL : biome === 'ruins' || biome === 'boss' ? STONE : EARTH);

function solidCell(ctx: Ctx, room: RoomData, pal: Palette, cx: number, cy: number): void {
  const T = room.tile;
  const x = cx * T;
  const y = cy * T;
  const h = cellHash(cx, cy);
  const solid = (dx: number, dy: number) => tileAt(room, cx + dx, cy + dy) === Tile.Solid || cx + dx < 0 || cx + dx >= room.cols || cy + dy < 0 || cy + dy >= room.rows;
  rect(ctx, x, y, T, T, pal.soil);
  if (pal.line) {
    rect(ctx, x, y + 11, T, 1, pal.line);
    rect(ctx, x + (cy % 2 ? 6 : 17), y, 1, 11, pal.line);
    rect(ctx, x + (cy % 2 ? 17 : 6), y + 12, 1, 12, pal.line);
  }
  rect(ctx, x + (h % 18), y + 6 + ((h >> 5) % 14), 4, 3, pal.speck);
  if (h % 3 === 0) rect(ctx, x + ((h >> 9) % 16), y + 3 + ((h >> 13) % 16), 5, 5, pal.speck);
  if (!solid(-1, 0)) rect(ctx, x, y, 3, T, pal.edge);
  if (!solid(1, 0)) rect(ctx, x + T - 3, y, 3, T, pal.edge);
  if (!solid(0, 1)) rect(ctx, x, y + T - 3, T, 3, pal.edge);
  if (!solid(0, -1)) {
    rect(ctx, x, y, T, 5, pal.top);
    rect(ctx, x, y + 5, T, 6, pal.top2);
    rect(ctx, x + (h % 14), y - 3 - (h % 3), 9, 5, pal.tuft);
  }
}

function oneWayCell(ctx: Ctx, room: RoomData, pal: Palette, cx: number, cy: number): void {
  const T = room.tile;
  const x = cx * T;
  const y = cy * T;
  const h = cellHash(cx, cy);
  rect(ctx, x, y, T, 14, pal.soil);
  rect(ctx, x, y, T, 5, pal === STONE ? '#8b8a68' : pal === CRYSTAL ? '#8a97bd' : '#839552');
  rect(ctx, x, y + 5, T, 5, pal === STONE ? '#5a5a45' : pal === CRYSTAL ? '#4a5577' : '#4e673b');
  rect(ctx, x + (h % 14), y - 3 - (h % 3), 9, 5, pal.tuft);
  rect(ctx, x + 3 + (h % 9), y + 12, 9, 4, '#39462e');
  if (h % 3 === 0) {
    rect(ctx, x + 8, y + 14, 3, 12 + (h % 11), pal === CRYSTAL ? pal.top2 : '#3d5635');
    rect(ctx, x + 5, y + 20, 6, 3, pal === CRYSTAL ? pal.tuft : '#5c7040');
  }
}

/** Brambles pointing away from the surface they grow on. */
function spikeCell(ctx: Ctx, room: RoomData, cx: number, cy: number): void {
  const T = room.tile;
  const x = cx * T;
  const y = cy * T;
  const solid = (dx: number, dy: number) => tileAt(room, cx + dx, cy + dy) === Tile.Solid;
  const [dx, dy] = solid(0, 1) ? [0, -1] : solid(-1, 0) ? [1, 0] : solid(1, 0) ? [-1, 0] : [0, 1];
  ctx.save();
  ctx.translate(x + T / 2, y + T / 2);
  ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
  const ice = room.biome === 'caves';
  rect(ctx, -12, 8, 24, 4, ice ? '#2a3048' : '#3f4a2b');
  for (let i = 0; i < 3; i++) {
    const bx = -11 + i * 8;
    ctx.fillStyle = ice ? (i % 2 ? '#8fd0e0' : '#6fa9c2') : i % 2 ? '#6d7a45' : '#56633a';
    ctx.beginPath();
    ctx.moveTo(bx, 10);
    ctx.lineTo(bx + 3.5, -11);
    ctx.lineTo(bx + 7, 10);
    ctx.fill();
    rect(ctx, bx + 3, -11, 2, 4, ice ? '#eaf8ff' : '#e0d5a4');
    if (!ice) rect(ctx, bx + 1, -2, 2, 2, '#9b3b2c');
  }
  ctx.restore();
}

/** Pre-renders a room's terrain once, so frames only blit an image. */
export function renderTiles(room: RoomData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = room.w;
  canvas.height = room.h;
  const ctx = canvas.getContext('2d')!;
  const pal = paletteFor(room.biome);
  for (let cy = 0; cy < room.rows; cy++)
    for (let cx = 0; cx < room.cols; cx++) {
      const t = tileAt(room, cx, cy);
      if (t === Tile.Solid) solidCell(ctx, room, pal, cx, cy);
      else if (t === Tile.OneWay) oneWayCell(ctx, room, pal, cx, cy);
      else if (t === Tile.Spikes) spikeCell(ctx, room, cx, cy);
    }
  return canvas;
}
