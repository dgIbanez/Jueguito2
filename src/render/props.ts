import type { Content } from '../content/types.ts';
import { fieldText, type Game } from '../game/game.ts';
import { runesEncode } from '../magic/ciphers.ts';
import type { EntitySpawn } from '../world/ldtk.ts';
import { label, rect, RUNE_FONT, type Ctx } from './draw.ts';

function shrine(ctx: Ctx, x: number, y: number, time: number): void {
  rect(ctx, x - 14, y - 21, 28, 21, '#657363');
  rect(ctx, x - 19, y - 24, 38, 6, '#8e9b7b');
  rect(ctx, x - 7, y - 48, 14, 25, '#789785');
  rect(ctx, x - 3, y - 44, 6, 16, '#bbe3ba');
  ctx.globalAlpha = 0.13 + Math.sin(time * 2) * 0.04;
  ctx.fillStyle = '#a3e9b3';
  ctx.beginPath();
  ctx.arc(x, y - 33, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function item(ctx: Ctx, id: string, x: number, y: number, bob: number): void {
  if (id === 'map') {
    rect(ctx, x - 15, y - 9, 30, 8, '#cfbd85');
    rect(ctx, x - 5, y - 11, 10, 10, '#e3d2a4');
    rect(ctx, x - 10, y - 6, 20, 1, '#836640');
    rect(ctx, x + 7, y - 8, 2, 5, '#9c5739');
  } else {
    rect(ctx, x - 15, y - 24 + bob, 30, 21, '#b09053');
    rect(ctx, x - 12, y - 22 + bob, 24, 16, '#d6ca95');
    rect(ctx, x - 1, y - 22 + bob, 2, 17, '#6f6240');
    label(ctx, 'ᛟ', x, y - 8 + bob, '#676946', 14);
  }
}

function ability(ctx: Ctx, id: string, x: number, y: number, bob: number): void {
  if (id === 'dash') {
    rect(ctx, x - 12, y - 19 + bob, 8, 16, '#a9bc9b');
    rect(ctx, x + 2, y - 19 + bob, 8, 16, '#a9bc9b');
    rect(ctx, x - 12, y - 7 + bob, 13, 5, '#d7c990');
    rect(ctx, x + 2, y - 7 + bob, 13, 5, '#d7c990');
  } else if (id === 'wall_jump') {
    rect(ctx, x - 13, y - 26 + bob, 26, 6, '#6d5a3a');
    for (let i = 0; i < 3; i++) {
      rect(ctx, x - 10 + i * 8, y - 20 + bob, 3, 12, '#c9b98a');
      rect(ctx, x - 8 + i * 8, y - 9 + bob, 3, 4, '#e8dfb8');
    }
  } else {
    for (let i = 0; i < 9; i++) rect(ctx, x - 9 + i * 2, y - 28 + i * 2.5 + bob, 12 - i, 3, i % 2 ? '#2f3542' : '#3d4557');
    rect(ctx, x - 10, y - 29 + bob, 2, 26, '#c9c3a8');
    rect(ctx, x - 6, y - 24 + bob, 3, 2, '#8fa3c7');
  }
  ctx.globalAlpha = 0.12 + Math.sin(bob) * 0.04;
  ctx.fillStyle = '#e8f2c8';
  ctx.beginPath();
  ctx.arc(x, y - 16 + bob, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function page(ctx: Ctx, x: number, y: number, bob: number): void {
  rect(ctx, x - 9, y - 28 + bob, 18, 25, '#d4d2a0');
  for (let i = 0; i < 4; i++) rect(ctx, x - 5, y - 23 + i * 4 + bob, 10 - (i % 2) * 4, 1, '#7b8860');
}

function mural(ctx: Ctx, content: Content, e: EntitySpawn, x: number, y: number): void {
  const clue = content.clues.find((c) => c.id === fieldText(e, 'clue'));
  rect(ctx, x - 24, y - 56, 48, 56, '#4d574a');
  rect(ctx, x - 20, y - 52, 40, 48, '#66705d');
  rect(ctx, x - 20, y - 52, 40, 3, '#7b8570');
  rect(ctx, x - 26, y - 4, 52, 4, '#3a4238');
  if (clue) label(ctx, runesEncode(clue.word, content.scripts[clue.script] ?? ''), x, y - 24, '#2c3527', 12, RUNE_FONT);
  rect(ctx, x - 12, y - 16, 24, 2, '#57614f');
}

/** Burned by fire: a wall of old thorns filling the gate's rectangle. */
export function drawGate(ctx: Ctx, g: { x: number; y: number; w: number; h: number }): void {
  const x = g.x + g.w / 2;
  const bottom = g.y + g.h;
  for (let i = 0; i * 18 < g.h - 10; i++) {
    rect(ctx, x - 7 + (i % 2) * 8, bottom - 20 - i * 18, 12, 25, '#53623a');
    rect(ctx, x - 19, bottom - 16 - i * 18, 35, 5, '#71834a');
    rect(ctx, x - 15 + (i % 3) * 9, bottom - 12 - i * 18, 3, 3, '#d9cf9e');
  }
}

const NAMES: Record<string, string> = { Shrine: 'SANTUARIO', Page: 'PÁGINA PERDIDA', Clue: 'MURAL' };

export function drawProps(ctx: Ctx, game: Game, interactKey: string): void {
  const { content, time } = game;
  const target = game.mode === 'play' ? game.interactTarget() : null;
  const bob = Math.sin(time * 2) * 3;
  for (const e of game.room.entities) {
    const x = e.ax;
    const y = e.ay;
    if (e.type === 'Gate') {
      if (game.closedGates().some((g) => g.id === fieldText(e, 'gateId'))) drawGate(ctx, e);
      continue;
    }
    if (!game.isAvailable(e) || !['Shrine', 'Item', 'Ability', 'Page', 'Clue'].includes(e.type)) continue;
    let name = NAMES[e.type] ?? '';
    if (e.type === 'Shrine') shrine(ctx, x, y, time);
    else if (e.type === 'Item') {
      item(ctx, fieldText(e, 'item'), x, y, bob);
      name = content.items[fieldText(e, 'item')]?.name.toUpperCase() ?? '';
    } else if (e.type === 'Ability') {
      ability(ctx, fieldText(e, 'ability'), x, y, bob);
      name = content.abilities[fieldText(e, 'ability')]?.name.toUpperCase() ?? '';
    } else if (e.type === 'Page') page(ctx, x, y, bob);
    else if (e.type === 'Clue') mural(ctx, content, e, x, y);
    // Only the usable thing within reach is named, so labels never pile up.
    if (target !== e) continue;
    const top = y - Math.max(e.h, 48) - 13;
    label(ctx, name, x, top, '#c0c69a', 8);
    label(ctx, `[ ${interactKey} ]`, x, top - 17, '#efe2ae', 12);
  }
}
