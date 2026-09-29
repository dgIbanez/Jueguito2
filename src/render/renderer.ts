import { VIEW_H, VIEW_W } from '../config.ts';
import type { Input } from '../core/input.ts';
import type { Enemy } from '../entities/enemies.ts';
import type { Game } from '../game/game.ts';
import { drawBackground, drawForeground } from './background.ts';
import { rect, type Ctx } from './draw.ts';
import { drawProps } from './props.ts';
import { BossAnimator, drawHazard } from './bossRender.ts';
import { drawArrow, drawEnemy, drawHero } from './sprites.ts';
import { renderTiles } from './tiles.ts';

export class Renderer {
  private tiles = new Map<string, HTMLCanvasElement>();
  private bosses = new BossAnimator();
  private readonly ctx: Ctx;
  private readonly game: Game;
  private readonly input: Input;

  constructor(ctx: Ctx, game: Game, input: Input) {
    this.ctx = ctx;
    this.game = game;
    this.input = input;
    ctx.imageSmoothingEnabled = false;
  }

  /** Bosses animate as skeletal rigs; everything else uses its sprite. */
  private enemy(e: Enemy): void {
    const rig = e.boss && this.game.content.rigs[e.look];
    if (rig) this.bosses.draw(this.ctx, e, rig, this.game.time);
    else drawEnemy(this.ctx, e, this.game.time);
  }

  private tileLayer(): HTMLCanvasElement {
    const room = this.game.room;
    let layer = this.tiles.get(room.id);
    if (!layer) this.tiles.set(room.id, (layer = renderTiles(room)));
    return layer;
  }

  draw(): void {
    const { ctx, game } = this;
    const { room, time, camera } = game;
    drawBackground(ctx, room.biome, time, camera.x);

    ctx.save();
    const sx = game.shake > 0 ? Math.sin(time * 90) * 4 : 0;
    const sy = game.shake > 0 ? Math.cos(time * 80) * 3 : 0;
    ctx.translate(Math.round(-camera.x + sx), Math.round(-camera.y + sy));

    // Rooms narrower or shorter than the view sit inside solid rock.
    if (room.w < VIEW_W || room.h < VIEW_H) {
      const rock = '#0b1712';
      const [left, top] = [camera.x - 10, camera.y - 10];
      const [right, bottom] = [camera.x + VIEW_W + 10, camera.y + VIEW_H + 10];
      if (left < 0) rect(ctx, left, top, -left, bottom - top, rock);
      if (right > room.w) rect(ctx, room.w, top, right - room.w, bottom - top, rock);
      if (top < 0) rect(ctx, left, top, right - left, -top, rock);
      if (bottom > room.h) rect(ctx, left, room.h, right - left, bottom - room.h, rock);
    }

    ctx.drawImage(this.tileLayer(), 0, 0);
    for (const s of game.blood.get(room.id) ?? []) rect(ctx, s.x, s.y, s.w, s.h, s.color);
    drawProps(ctx, game, this.input.label('interact').split(' / ')[0]);

    for (const corpse of game.corpses) {
      const e = corpse.enemy;
      ctx.save();
      ctx.globalAlpha = Math.min(1, corpse.life * 2);
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      ctx.rotate((1 - corpse.life / 0.65) * e.face * 1.5);
      ctx.translate(-e.x - e.w / 2, -e.y - e.h);
      this.enemy(e);
      ctx.restore();
    }
    for (const h of game.hazards) drawHazard(ctx, h, time);
    for (const e of game.enemies) if (e.hp > 0) this.enemy(e);
    if (game.mode !== 'title') drawHero(ctx, game.player, time);
    for (const a of game.arrows) drawArrow(ctx, a, time);
    for (const s of game.shots) {
      if (s.kind === 'vortex') {
        ctx.save();
        ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
        for (let i = 0; i < 3; i++) {
          ctx.rotate(time * 9 + i * 2.1);
          ctx.strokeStyle = ['#f08a3c', '#f2d091', '#c4552f'][i];
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, 10 + i * 5, 0, Math.PI * 1.2);
          ctx.stroke();
        }
        ctx.restore();
      } else if (s.kind === 'frost') {
        rect(ctx, s.x, s.y, 12, 8, '#8fd0e0');
        rect(ctx, s.x + 3, s.y + 2, 6, 4, '#eaf8ff');
      } else {
        rect(ctx, s.x, s.y, 12, 8, '#f2d091');
        rect(ctx, s.x + 3, s.y + 2, 6, 4, '#fff1b1');
      }
    }
    for (const fx of game.effects) {
      // Wind streaks sweeping away from the player.
      const k = 1 - fx.life / fx.max;
      ctx.globalAlpha = 1 - k;
      const color = fx.kind === 'blizzard' ? '#dff4ff' : '#d8e8d0';
      for (let i = 0; i < 6; i++) {
        const len = fx.w * (0.3 + 0.1 * (i % 3));
        const sx = fx.face > 0 ? fx.x + k * (fx.w - len) : fx.x + fx.w - len - k * (fx.w - len);
        rect(ctx, sx, fx.y + 8 + i * ((fx.h - 16) / 5), len, 2, color);
      }
      ctx.globalAlpha = 1;
    }
    for (const w of game.waves) {
      rect(ctx, w.x, w.y, w.w, w.h, '#c8b37b');
      rect(ctx, w.x + 5, w.y - 7, 8, 10, '#8eab7a');
    }
    for (const a of game.particles) {
      ctx.globalAlpha = Math.min(1, a.life * 2);
      rect(ctx, a.x, a.y, 3, 3, a.color);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    drawForeground(ctx);
    if (game.fade > 0) {
      ctx.globalAlpha = Math.min(1, game.fade / 0.25);
      rect(ctx, 0, 0, VIEW_W, VIEW_H, '#050e0a');
      ctx.globalAlpha = 1;
    }
  }
}
