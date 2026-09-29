import type { Arrow, Enemy } from '../entities/enemies.ts';
import type { Player } from '../entities/player.ts';
import { rect, RUNE_FONT, type Ctx } from './draw.ts';

/** Shared body motion: walk cycle offset and idle/walk bob. */
function motion(a: { vx: number; ground: boolean }, time: number): { walk: number; bob: number; moving: boolean } {
  const moving = Math.abs(a.vx) > 5;
  const walk = a.ground && moving ? Math.sin(time * 15) * 4 : 0;
  const bob = a.ground ? (moving ? Math.abs(Math.sin(time * 15)) * 1.5 : Math.sin(time * 3) * 0.6) : 0;
  return { walk, bob, moving };
}

export function drawHero(ctx: Ctx, p: Player, time: number): void {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const { walk, bob, moving } = motion(p, time);
  ctx.save();
  ctx.translate(x + p.w / 2, y);
  ctx.scale(p.face, 1);
  ctx.translate(0, bob);
  if (p.dash > 0) {
    ctx.translate(0, 7);
    ctx.transform(1, 0, -0.28, 0.8, 0, 0);
  } else if (p.sliding) ctx.rotate(-0.08);
  if (p.inv > 0 && Math.floor(time * 15) % 2 === 0) ctx.globalAlpha = 0.35;
  rect(ctx, -8, 11, 16, 17, '#b7c6b0');
  rect(ctx, -9, 16, 6, 17, '#31524c');
  rect(ctx, -7, 28 + walk, 5, 5, '#273831');
  rect(ctx, 3, 28 - walk, 5, 5, '#273831');
  rect(ctx, -7, 0, 14, 13, '#718d7d');
  rect(ctx, -5, 2, 11, 10, '#d7d7b4');
  rect(ctx, -8, -2, 15, 5, '#bcc9ad');
  rect(ctx, -9, 4, 5, 9, '#8da18d');
  rect(ctx, 1, 5, 5, 2, '#203c34');
  rect(ctx, -10, 13, 19, 5, '#bb724e');
  rect(ctx, -18 - (moving ? 4 : 0), 14 + Math.sin(time * 12) * 2, 12, 4, '#a65c40');
  ctx.save();
  ctx.translate(7, 17);
  const swing = p.attack > 0 ? 1 - p.attack / 0.2 : 0;
  ctx.rotate(p.attack > 0 ? (p.attackDown ? 1.2 + swing * 1.4 : -2.2 + swing * 3.5) : p.ground ? walk * 0.08 : -0.5);
  rect(ctx, 0, 0, 4, 10, '#cec3a1');
  rect(ctx, 3, -19, 3, 26, '#dbdbb3');
  rect(ctx, 0, 3, 9, 3, '#9a8654');
  ctx.restore();
  if (p.attack > 0 && !p.attackDown) {
    const angle = -1.3 + swing * 2.2;
    ctx.strokeStyle = '#eee8b5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(6, 18, 37, angle - 0.8, angle);
    ctx.stroke();
  }
  ctx.restore();

  if (p.attack > 0 && p.attackDown) {
    const t = 1 - p.attack / 0.2;
    ctx.strokeStyle = '#eee8b5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x + p.w / 2, y + p.h - 6, 30, 0.2 + t * 0.6, Math.PI - 0.2 - (1 - t) * 0.6);
    ctx.stroke();
  }
  if (p.shield > 0) drawShield(ctx, x + p.w / 2, y + p.h / 2, p.shield, time, p.shieldBurn > 0);
}

/** Égida: a turning ring of runes around the player. */
function drawShield(ctx: Ctx, cx: number, cy: number, left: number, time: number, fiery: boolean): void {
  ctx.save();
  ctx.globalAlpha = Math.min(1, left * 3) * 0.85;
  ctx.strokeStyle = fiery ? '#f2a35a' : '#b9d7ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = fiery ? '#ffd9a0' : '#dcecff';
  ctx.font = `12px ${RUNE_FONT}`;
  ctx.textAlign = 'center';
  const runes = 'ᛖᛈᚾᛚᛏᛜ';
  for (let i = 0; i < runes.length; i++) {
    const a = time * 3 + (i / runes.length) * Math.PI * 2;
    ctx.fillText(runes[i], cx + Math.cos(a) * 30, cy + Math.sin(a) * 30 + 4);
  }
  ctx.restore();
}

function drawBow(ctx: Ctx, a: Enemy, windup: number): void {
  rect(ctx, -12, 16, 5, 16, '#554b34');
  rect(ctx, -13, 10, 2, 14, '#c6b88a');
  rect(ctx, -9, -1, 19, 5, '#506f46');
  ctx.save();
  ctx.translate(11, 17);
  ctx.rotate(a.aim ? Math.atan2(a.aim.y, a.aim.x * a.face) : 0);
  rect(ctx, -3, -2, 8, 4, '#91aa65');
  ctx.strokeStyle = '#b48b59';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, -13);
  ctx.lineTo(11, -7);
  ctx.lineTo(13, 0);
  ctx.lineTo(11, 7);
  ctx.lineTo(4, 13);
  ctx.stroke();
  const pull = a.state === 'wind' ? Math.min(1, 1 - a.timer / windup) : 0;
  ctx.strokeStyle = '#d5d0a3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, -13);
  ctx.lineTo(4 - pull * 9, 0);
  ctx.lineTo(4, 13);
  ctx.stroke();
  if (a.state === 'wind') {
    rect(ctx, -5 - pull * 5, -1, 22, 2, '#ded4a2');
    rect(ctx, 15, -2, 3, 4, '#d9ddc0');
  }
  ctx.restore();
}

/** Crystal bat: flapping wings, eyes flare during the windup. */
function drawBat(ctx: Ctx, a: Enemy, time: number): void {
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2 + (a.state === 'wind' ? Math.sin(time * 60) * 1.5 : 0);
  const flap = Math.sin(time * (a.state === 'strike' ? 30 : 18)) * 7;
  const body = a.hit > 0 ? '#fff0ca' : '#5d5470';
  ctx.fillStyle = a.hit > 0 ? '#fff0ca' : '#433c55';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * 4, cy - 2);
    ctx.lineTo(cx + side * 16, cy - 6 - flap);
    ctx.lineTo(cx + side * 13, cy + 2);
    ctx.lineTo(cx + side * 8, cy + 1);
    ctx.fill();
  }
  rect(ctx, cx - 5, cy - 5, 10, 10, body);
  rect(ctx, cx - 4, cy - 8, 3, 4, body);
  rect(ctx, cx + 1, cy - 8, 3, 4, body);
  const eye = a.state === 'wind' ? '#ffffff' : '#9fe3ff';
  rect(ctx, cx - 3, cy - 3, 2, 2, eye);
  rect(ctx, cx + 1, cy - 3, 2, 2, eye);
  rect(ctx, cx - 2, cy + 5, 4, 3, '#8fd0e0');
}

/** Crystal crawler: a low beetle with a spiny back. */
function drawCrawler(ctx: Ctx, a: Enemy, time: number): void {
  const moving = Math.abs(a.vx) > 5;
  const step = moving ? Math.sin(time * 20) * 2 : 0;
  ctx.save();
  ctx.translate(a.x + a.w / 2, a.y + a.h);
  ctx.scale(a.face, 1);
  if (a.state === 'wind') ctx.rotate(-0.12);
  else if (a.state === 'strike') ctx.translate(4, 0);
  const shell = a.hit > 0 ? '#fff0ca' : '#3e4868';
  for (let i = 0; i < 3; i++) {
    rect(ctx, -12 + i * 9, -5 + (i % 2 ? step : -step), 3, 5, '#2a3048');
  }
  rect(ctx, -16, -16, 30, 11, shell);
  rect(ctx, 10, -13, 7, 7, a.hit > 0 ? '#fff0ca' : '#56628a');
  rect(ctx, 14, -11, 2, 2, a.state === 'wind' ? '#ffffff' : '#9fe3ff');
  ctx.fillStyle = '#8fd0e0';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-14 + i * 7, -16);
    ctx.lineTo(-11 + i * 7, -24 - (i % 2) * 4);
    ctx.lineTo(-8 + i * 7, -16);
    ctx.fill();
  }
  ctx.restore();
}

/** A translucent block of ice over frozen enemies. */
export function drawIce(ctx: Ctx, a: Enemy): void {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#bfe6ff';
  ctx.fillRect(a.x - 3, a.y - 3, a.w + 6, a.h + 6);
  ctx.globalAlpha = 0.9;
  rect(ctx, a.x - 3, a.y - 3, a.w + 6, 2, '#eaf8ff');
  rect(ctx, a.x + 3, a.y + 2, 2, a.h - 6, '#eaf8ff');
  ctx.restore();
}

/** Ordinary enemies. Bosses are skeletal rigs, drawn by BossAnimator. */
export function drawEnemy(ctx: Ctx, a: Enemy, time: number): void {
  if (a.look === 'bat') drawBat(ctx, a, time);
  else if (a.look === 'crawler') drawCrawler(ctx, a, time);
  else drawGoblinFamily(ctx, a, time);
  if (a.frozen > 0) drawIce(ctx, a);
  if (a.hp < a.max && a.hp > 0) {
    rect(ctx, a.x, a.y - 7, a.w, 3, '#182a22');
    rect(ctx, a.x, a.y - 7, (a.w * a.hp) / a.max, 3, '#b9bb7c');
  }
}

function drawGoblinFamily(ctx: Ctx, a: Enemy, time: number): void {
  const x = Math.round(a.x);
  const y = Math.round(a.y);
  const { walk, bob } = motion(a, time);
  ctx.save();
  ctx.translate(x + a.w / 2, y);
  ctx.scale(a.face, 1);
  ctx.translate(a.hit > 0 ? -2 : 0, bob);
  if (a.state === 'wind') {
    ctx.translate(-2, 3);
    ctx.scale(1.08, 0.92);
  } else if (a.state === 'strike') ctx.translate(3, 0);

  const skin = a.hit > 0 ? '#fff0ca' : a.look === 'hob' ? '#849268' : '#91aa65';
  rect(ctx, -9, 2, 18, 14, skin);
  rect(ctx, -14, 5, 7, 6, skin);
  rect(ctx, 9, 5, 6, 6, skin);
  rect(ctx, 2, 7, 5, 3, '#e6c878');
  rect(ctx, 3, 8, 3, 2, '#18271b');
  rect(ctx, -9, 17, 19, 12, '#554f32');
  rect(ctx, -10, 16, 20, 5, '#827952');
  rect(ctx, -7, 28 + walk, 5, 7, skin);
  rect(ctx, 3, 28 - walk, 5, 7, skin);
  if (a.look === 'archer') drawBow(ctx, a, a.def?.ai === 'archer' ? a.def.windup : 0.85);
  else {
    ctx.save();
    ctx.translate(10, 18);
    ctx.rotate(a.state === 'wind' ? -1.7 : a.state === 'strike' ? 1.2 : a.state === 'recover' ? 0.5 : walk * 0.06);
    rect(ctx, 0, 0, 5, 8, skin);
    rect(ctx, 4, -6, 4, 22, '#8c7046');
    rect(ctx, 2, -8, 10, 8, '#acb39b');
    ctx.restore();
  }
  if (a.look === 'hob') {
    rect(ctx, -10, 14, 8, 24, '#797b62');
    rect(ctx, -7, 17, 2, 18, '#b9af7c');
  }
  ctx.restore();
}

export function drawArrow(ctx: Ctx, a: Arrow, time = 0): void {
  if (a.spin) {
    // A thrown cleaver, spinning.
    ctx.save();
    ctx.translate(a.x + a.w / 2, a.y + a.h / 2);
    ctx.rotate(time * 18);
    rect(ctx, -2, -13, 4, 26, '#8c7046');
    ctx.fillStyle = '#acb39b';
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(14, -6);
    ctx.lineTo(16, 8);
    ctx.lineTo(-2, 11);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (a.shard) {
    // Falling quartz: a sharp crystal pointing down.
    ctx.fillStyle = '#8fd0e0';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + a.w, a.y);
    ctx.lineTo(a.x + a.w / 2, a.y + a.h + 4);
    ctx.fill();
    rect(ctx, a.x + a.w / 2 - 1, a.y + 2, 2, a.h - 4, '#eaf8ff');
    return;
  }
  ctx.save();
  ctx.translate(a.x + 4, a.y + 3);
  ctx.rotate(Math.atan2(a.vy, a.vx));
  const tint = a.friendly ? '#b9d7ff' : '#d4b985';
  rect(ctx, -12, -1, 22, 2, tint);
  rect(ctx, 9, -2, 4, 4, '#e1e2c5');
  rect(ctx, -12, -3, 5, 2, '#b88063');
  rect(ctx, -12, 1, 5, 2, '#b88063');
  ctx.restore();
}
