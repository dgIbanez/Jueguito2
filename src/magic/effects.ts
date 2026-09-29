/**
 * What each spell effect does when cast. Tuning comes from the spell's
 * current level (data/spells.json); behavior lives here, keyed by effect.
 */
import type { SpellDef, SpellLevel } from '../content/types.ts';
import { centerX, centerY, overlap } from '../core/math.ts';
import type { Game } from '../game/game.ts';

function projectile(game: Game, id: string, kind: 'fire' | 'frost', lv: SpellLevel): void {
  const p = game.player;
  game.shots.push({
    x: p.x + 9, y: p.y + 13, w: 12, h: 9, vx: p.face * (lv.speed ?? 430), life: 1.8,
    spell: id, kind, damage: lv.damage ?? 1, pierce: lv.pierce, freeze: lv.freeze, hits: new Map(),
  });
  game.sound(kind === 'fire' ? 'spellFire' : 'spellFrost', p.x);
}

function vortex(game: Game, id: string, lv: SpellLevel): void {
  const p = game.player;
  game.shots.push({
    x: centerX(p) - 18 + p.face * 22, y: p.y - 6, w: 36, h: 42, vx: p.face * (lv.speed ?? 160), life: lv.life ?? 1.6,
    spell: id, kind: 'vortex', damage: lv.damage ?? 1, pierce: true, rehit: lv.rehit ?? 0.25, hits: new Map(),
  });
  game.sound('spellVortex', p.x);
}

function shield(game: Game, lv: SpellLevel): void {
  const p = game.player;
  p.shield = lv.duration ?? 0.7;
  p.shieldBurn = lv.burn ?? 0;
  p.reflectDamage = lv.reflectDamage ?? 1;
  game.burst(centerX(p), centerY(p), p.shieldBurn ? '#f2a35a' : '#b9d7ff', 16);
  game.sound('spellShield', p.x);
}

/** A short cone of wind in front of the player. */
function gust(game: Game, id: string, lv: SpellLevel): void {
  const p = game.player;
  const reach = lv.reach ?? 90;
  const area = { x: p.face > 0 ? p.x + p.w : p.x - reach, y: p.y - 24, w: reach, h: p.h + 48 };
  for (const e of [...game.enemies]) {
    if (e.hp <= 0 || !overlap(area, e)) continue;
    if (lv.freeze) game.freeze(e, lv.freeze);
    if (lv.push && !e.boss) {
      e.knock = 0.25;
      e.knockVx = p.face * lv.push;
    }
    game.hitEnemy(e, lv.damage ?? 1);
  }
  for (const a of game.arrows) {
    if (a.friendly || !overlap(area, a)) continue;
    if (lv.reflect && !a.shard && !a.spin) Object.assign(a, { vx: -a.vx, vy: -a.vy, friendly: true, life: 3, damage: 1 });
    else a.life = 0;
  }
  game.waves = game.waves.filter((w) => !overlap(area, w));
  for (const gate of game.closedGates()) if (overlap(area, gate.rect) && game.spellOpens(gate, id)) game.openGate(gate);
  game.effects.push({ kind: lv.freeze ? 'blizzard' : 'gust', ...area, face: p.face, life: 0.3, max: 0.3 });
  game.sound(lv.freeze ? 'spellBlizzard' : 'spellWind', p.x);
}

export function castEffect(game: Game, id: string, spell: SpellDef, lv: SpellLevel): void {
  switch (spell.effect) {
    case 'fire':
    case 'frost':
      return projectile(game, id, spell.effect, lv);
    case 'vortex':
      return vortex(game, id, lv);
    case 'shield':
      return shield(game, lv);
    case 'gust':
      return gust(game, id, lv);
  }
}
