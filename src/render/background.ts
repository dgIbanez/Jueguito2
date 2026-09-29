import { VIEW_H, VIEW_W } from '../config.ts';
import { rect, type Ctx } from './draw.ts';

const SKY: Record<string, string> = { forest: '#24473d', canopy: '#42654f', ruins: '#233f37', boss: '#2b3d31' };
const wrap = (n: number, m: number): number => ((n % m) + m) % m;

/** Underground backdrop: layered stalactites and glowing crystal clusters. */
function caves(ctx: Ctx, time: number, camX: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#1d2439');
  g.addColorStop(1, '#0a0d18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let layer = 0; layer < 3; layer++) {
    const col = ['#232b44', '#1a2135', '#141a2a'][layer];
    const shift = camX * (0.12 + layer * 0.12);
    for (let i = 0; i < 12; i++) {
      const x = wrap(i * 97 + layer * 41 - shift, 1160) - 100;
      const len = 60 + ((i * 53 + layer * 29) % 140);
      const w = 22 + layer * 10;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + w, 0);
      ctx.lineTo(x + w / 2, len);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 30, VIEW_H);
      ctx.lineTo(x + 30 + w, VIEW_H);
      ctx.lineTo(x + 30 + w / 2, VIEW_H - len * 0.7);
      ctx.fill();
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = wrap(i * 131 - camX * 0.45, 1100) - 70;
    const y = 120 + ((i * 71) % 300);
    ctx.globalAlpha = 0.25 + Math.sin(time * 1.3 + i) * 0.12;
    ctx.fillStyle = i % 2 ? '#7fd3e6' : '#a88be0';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 7, y - 26);
    ctx.lineTo(x + 14, y);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 10, y);
    ctx.lineTo(x + 18, y - 16);
    ctx.lineTo(x + 24, y);
    ctx.fill();
  }
  for (let i = 0; i < 30; i++) {
    ctx.globalAlpha = 0.2 + Math.sin(time * 1.1 + i * 2) * 0.15;
    rect(ctx, wrap(i * 89 - camX * 0.6, VIEW_W), (i * 53 + Math.sin(time * 0.4 + i) * 12) % 500, 2, 2, '#bfe6ff');
  }
  ctx.globalAlpha = 1;
}

/** Screen-space forest backdrop; layers drift with the camera for parallax. */
export function drawBackground(ctx: Ctx, biome: string, time: number, camX: number): void {
  if (biome === 'caves') return caves(ctx, time, camX);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, SKY[biome] ?? SKY.forest);
  g.addColorStop(1, '#0b231e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 5; i++) {
    const x = wrap(170 + i * 185 - camX * 0.05, 1100) - 60;
    ctx.fillStyle = '#e1efb5';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 50, 0);
    ctx.lineTo(x - 105, 490);
    ctx.lineTo(x - 200, 490);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (let layer = 0; layer < 3; layer++) {
    const col = ['#2c5040', '#1d3d30', '#142f25'][layer];
    const shift = camX * (0.15 + layer * 0.12);
    for (let i = 0; i < 9; i++) {
      const x = wrap(i * 151 + layer * 63 - shift, 1080) - 60;
      const w = 18 + layer * 15;
      rect(ctx, x, 0, w, 490, col);
      rect(ctx, x - w * 0.5, 115 + (i % 3) * 70, w * 2, 11, col);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, 290);
      ctx.lineTo(x - 65, 180);
      ctx.lineTo(x - 58, 174);
      ctx.lineTo(x + w, 295);
      ctx.fill();
      for (let j = 0; j < 5; j++) rect(ctx, x - 70 + j * 17, (i % 3) * 35 + (j % 2) * 18, 110, 30, col);
    }
  }

  if (biome === 'ruins' || biome === 'boss') {
    for (let i = 0; i < 7; i++) {
      const x = wrap(70 + i * 170 - camX * 0.5, 1190) - 60;
      rect(ctx, x, 270, 45, 210, '#314638');
      rect(ctx, x - 7, 267, 59, 13, '#4b5b44');
      rect(ctx, x + 7, 286, 6, 185, '#3a5140');
      for (let j = 0; j < 5; j++) rect(ctx, x, 300 + j * 34, 45, 2, '#21372b');
    }
    if (biome === 'boss') {
      const x = 430 - camX * 0.3;
      rect(ctx, x, 334, 110, 146, '#474932');
      rect(ctx, x + 18, 290, 74, 160, '#5a5639');
      rect(ctx, x + 30, 308, 50, 128, '#293a29');
    }
  }

  for (let i = 0; i < 36; i++) {
    ctx.globalAlpha = 0.25 + Math.sin(time * 1.5 + i) * 0.18;
    rect(ctx, wrap(i * 83 + Math.sin(time * 0.5 + i) * 14 - camX * 0.6, VIEW_W), (i * 47 + Math.sin(time * 0.7 + i) * 18) % 475, 2, 2, '#d5e39a');
  }
  ctx.globalAlpha = 1;
}

/** Foreground grass and vignette drawn over the world. */
export function drawForeground(ctx: Ctx): void {
  for (let i = 0; i < 22; i++) {
    rect(ctx, i * 47, 529, 8, 11, '#0a1c18');
    rect(ctx, i * 47 + 5, 521 + (i % 3) * 4, 4, 19, '#0a1c18');
  }
  const v = ctx.createRadialGradient(480, 240, 140, 480, 270, 570);
  v.addColorStop(0, '#06110d00');
  v.addColorStop(1, '#06110da8');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
