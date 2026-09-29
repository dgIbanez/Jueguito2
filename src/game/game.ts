import { PHYS, PLAYER, VIEW_H, VIEW_W } from '../config.ts';
import type { BossDef, BossSummon, Content, PageDef } from '../content/types.ts';
import type { SfxName } from '../audio/names.ts';
import { Emitter } from '../core/events.ts';
import { centerX, centerY, clamp, overlap, type Rect } from '../core/math.ts';
import type { SaveContext, SaveStore } from '../core/save.ts';
import { createBoss, updateBoss, type BossContext, type Hazard, type Wave } from '../entities/boss.ts';
import { createEnemy, guardLedge, updateArcher, updateFlyer, updateMelee, type Arrow, type Enemy } from '../entities/enemies.ts';
import { createPlayer, pogo, swordBox, updatePlayer, type Intent, type Player } from '../entities/player.ts';
import { decode, type CipherKey } from '../magic/ciphers.ts';
import { castEffect } from '../magic/effects.ts';
import { solutionHash } from '../magic/hash.ts';
import * as loadout from '../magic/loadout.ts';
import { hitsSolid, moveBody, surfaceBelow, touchesTile } from '../world/collision.ts';
import { entitiesOf, roomAt, Tile, type EntitySpawn, type RoomData } from '../world/ldtk.ts';
import { hasToken, newProgress, type Checkpoint, type Progress } from './progress.ts';

export type Mode = 'title' | 'prologue' | 'play' | 'pause' | 'journal' | 'cipher' | 'map' | 'reading' | 'shrine' | 'interlude' | 'dead' | 'win';

/** A Pantheon run: one boss (duel) or all of them in a row (rush). */
export interface Trial {
  kind: 'duel' | 'rush';
  queue: string[];
  /** Index of the boss being fought. */
  index: number;
  /** Seconds of fighting so far. */
  time: number;
}

export interface Shot extends Rect {
  vx: number;
  life: number;
  spell: string;
  kind: 'fire' | 'frost' | 'vortex';
  damage: number;
  pierce?: boolean;
  freeze?: number;
  /** Seconds between hits on the same enemy; absent means once. */
  rehit?: number;
  /** Enemy → time when it can be hit again by this shot. */
  hits: Map<Enemy, number>;
}

/** Short-lived visual of an area spell. */
export interface Effect extends Rect {
  kind: 'gust' | 'blizzard';
  face: number;
  life: number;
  max: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Stain extends Rect {
  color: string;
}

export interface Corpse {
  enemy: Enemy;
  life: number;
}

export interface Gate {
  id: string;
  opensWith: string;
  rect: Rect;
}

export interface GameEvents {
  /** Notification text; `{action}` placeholders are resolved by the UI. */
  toast: string;
  /** A sound effect; x (world) places it left or right. */
  sound: { name: SfxName; x?: number };
  room: RoomData;
  dead: undefined;
  victory: BossDef;
  openPage: string;
  readClue: string;
  /** The player rested; the UI opens the spell preparation screen. */
  shrine: undefined;
  /** A Pantheon boss fell: `done` when it was the last of the run. */
  trialCleared: { boss: BossDef; done: boolean; time: number };
}

/** Entities the player can use with the interact key. */
const INTERACTIVE = new Set(['Shrine', 'Item', 'Ability', 'Page', 'Clue']);

/** v1 saved rooms by index; this is that order. */
const LEGACY_ROOMS = ['Umbral', 'Sendero', 'Trono', 'Archivo', 'Copa', 'Vigilia'];

export const fieldText = (e: EntitySpawn, key: string): string => (typeof e.fields[key] === 'string' ? (e.fields[key] as string) : '');

const standOn = (e: EntitySpawn): { x: number; y: number } => ({ x: e.ax - PLAYER.w / 2, y: e.ay - PLAYER.h });

export function startCheckpoint(content: Content): Checkpoint {
  for (const room of content.world.rooms) {
    const start = entitiesOf(room, 'PlayerStart')[0];
    if (start) return { room: room.id, ...standOn(start) };
  }
  const first = content.world.rooms[0];
  return { room: first.id, x: 48, y: first.h / 2 };
}

export function saveContext(content: Content): SaveContext {
  return {
    roomIds: new Set(content.world.byId.keys()),
    legacyRooms: LEGACY_ROOMS,
    checkpointFor(roomId) {
      const room = content.world.byId.get(roomId);
      const spot = room && (entitiesOf(room, 'Shrine')[0] ?? entitiesOf(room, 'PlayerStart')[0]);
      return spot ? { room: roomId, ...standOn(spot) } : startCheckpoint(content);
    },
  };
}

export class Game {
  readonly events = new Emitter<GameEvents>();
  mode: Mode = 'title';
  time = 0;
  room: RoomData;
  player: Player;
  progress: Progress;
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  arrows: Arrow[] = [];
  waves: Wave[] = [];
  hazards: Hazard[] = [];
  particles: Particle[] = [];
  effects: Effect[] = [];
  corpses: Corpse[] = [];
  blood = new Map<string, Stain[]>();
  camera = { x: 0, y: 0 };
  shake = 0;
  fade = 0;
  /** Increments with each sword swing. */
  serial = 0;
  private pogoSerial = -1;
  private saveWarned = false;
  private readonly ctx: BossContext;
  readonly content: Content;
  readonly store: SaveStore;

  constructor(content: Content, store: SaveStore) {
    this.content = content;
    this.store = store;
    const start = startCheckpoint(content);
    this.progress = newProgress(start);
    this.room = content.world.byId.get(start.room)!;
    this.player = createPlayer(start.x, start.y);
    const self = this;
    this.ctx = {
      get player() {
        return self.player;
      },
      get room() {
        return self.room;
      },
      hurtPlayer: (x) => this.hurtPlayer(x),
      fireArrow: (a) => this.arrows.push(a),
      sound: (name, x) => this.sound(name, x),
      spawnWave: (w) => this.waves.push(w),
      addHazard: (h) => this.hazards.push(h),
      summon: (list) => this.summon(list),
      shake: (s) => (this.shake = s),
    };
  }

  // ------------------------------------------------------------ lifecycle

  newGame(): void {
    this.progress = newProgress(startCheckpoint(this.content));
    this.spawnAtCheckpoint();
    this.save();
  }

  continueGame(): void {
    const loaded = this.store.load();
    if (!loaded) return this.newGame();
    this.progress = loaded;
    this.spawnAtCheckpoint();
    this.save();
  }

  private spawnAtCheckpoint(): void {
    const cp = this.progress.checkpoint;
    this.player = createPlayer(cp.x, cp.y);
    this.blood.clear();
    this.enterRoom(cp.room, cp.x, cp.y);
    this.mode = 'play';
  }

  retry(): void {
    const p = this.player;
    p.hp = PLAYER.maxHp;
    p.mana = PLAYER.maxMana;
    this.resetEncounters();
    this.save();
    const cp = this.progress.checkpoint;
    this.enterRoom(cp.room, cp.x, cp.y);
    p.inv = 1;
    this.mode = 'play';
  }

  /** Ordinary enemies return after resting or dying; bosses stay defeated. */
  resetEncounters(): void {
    this.progress.defeated.clear();
    this.blood.clear();
    this.corpses = [];
  }

  // ------------------------------------------------------------ pantheon

  /** The Pantheon run in progress, or null during the journey. */
  trial: Trial | null = null;

  /** Bosses defeated in the saved journey: the only ones the Pantheon offers. */
  pantheonBosses(): string[] {
    const saved = this.store.load();
    return Object.keys(this.content.bosses).filter((id) => this.content.bosses[id].arena && saved?.flags.has(`boss:${id}`));
  }

  /**
   * Starts a Pantheon run with the saved abilities, spells and loadout. It
   * plays on a copy of the progress and never saves, so the journey is untouched.
   */
  startTrial(kind: Trial['kind'], queue: string[]): boolean {
    const saved = this.store.load();
    const beaten = this.pantheonBosses();
    if (!saved || !queue.length || !queue.every((id) => beaten.includes(id))) return false;
    this.trial = { kind, queue, index: 0, time: 0 };
    this.progress = saved;
    this.player = createPlayer(0, 0);
    this.blood.clear();
    this.enterArena(queue[0]);
    this.mode = 'play';
    return true;
  }

  /** Stages a boss's arena: only the flags its fight needs, so the boss appears. */
  private enterArena(id: string): void {
    const arena = this.content.bosses[id].arena!;
    const T = this.content.world.tile;
    this.progress.flags = new Set(arena.flags);
    this.progress.defeated.clear();
    this.enterRoom(arena.room, arena.spawn[0] * T + T / 2 - PLAYER.w / 2, (arena.spawn[1] + 1) * T - PLAYER.h);
    this.enemies = this.enemies.filter((e) => e.boss);
    this.player.inv = 1;
  }

  /** In a rush: on to the next boss. Health carries over; magic refills. */
  nextTrialBoss(): void {
    const t = this.trial;
    if (!t || t.index >= t.queue.length) return;
    this.player.mana = PLAYER.maxMana;
    this.enterArena(t.queue[t.index]);
    this.mode = 'play';
  }

  retryTrial(): void {
    if (this.trial) this.startTrial(this.trial.kind, this.trial.queue);
  }

  /** Leaves the Pantheon, restoring the journey exactly as saved. */
  endTrial(): void {
    this.trial = null;
    this.progress = this.store.load() ?? newProgress(startCheckpoint(this.content));
    this.enemies = [];
    this.mode = 'title';
  }

  save(): void {
    if (this.trial) return;
    if (this.store.write(this.progress) || this.saveWarned) return;
    this.saveWarned = true;
    this.toast('Guardado no disponible en este navegador. Podés continuar en esta sesión.');
  }

  toast(text: string): void {
    this.events.emit('toast', text);
  }

  sound(name: SfxName, x?: number): void {
    this.events.emit('sound', { name, x });
  }

  // ------------------------------------------------------------ rooms

  enterRoom(id: string, x: number, y: number, opts: { keepVelocity?: boolean; boost?: boolean } = {}): void {
    const room = this.content.world.byId.get(id);
    if (!room) throw new Error(`Sala desconocida: ${id}`);
    this.room = room;
    const p = this.player;
    Object.assign(p, { x, y, dash: 0, ground: false, coyote: 0, safe: { x, y } });
    if (!opts.keepVelocity) Object.assign(p, { vx: 0, vy: 0 });
    if (opts.boost) {
      p.vy = Math.min(p.vy, -PHYS.upBoost);
      // The boost is not a jump: releasing the button must not cut it.
      p.jumping = false;
    }
    this.shots = [];
    this.arrows = [];
    this.waves = [];
    this.hazards = [];
    this.particles = [];
    this.effects = [];
    this.corpses = [];
    this.enemies = [];
    for (const spawn of entitiesOf(room, 'Enemy')) {
      const kind = fieldText(spawn, 'kind');
      const def = this.content.enemies[kind];
      if (def && !this.progress.defeated.has(spawn.iid)) this.enemies.push(createEnemy(kind, def, spawn.ax, spawn.ay, spawn.iid));
    }
    this.spawnBosses();
    if (!this.progress.visited.has(id)) {
      this.progress.visited.add(id);
      this.save();
    }
    this.updateCamera(0, true);
    this.fade = 0.25;
    this.events.emit('room', room);
  }

  private spawnBosses(): void {
    for (const spawn of entitiesOf(this.room, 'Boss')) {
      const id = fieldText(spawn, 'boss');
      const def = this.content.bosses[id];
      const trigger = fieldText(spawn, 'trigger');
      if (!def || this.progress.flags.has(`boss:${id}`) || (trigger && !this.progress.flags.has(trigger))) continue;
      if (this.enemies.some((e) => e.boss?.id === id)) continue;
      this.enemies.push(createBoss(id, def, spawn.ax, spawn.ay));
    }
  }

  /**
   * Gates opened by a spell stay open once hit; gates tied to any other
   * token (a defeated boss, a flag) open by themselves while it is held.
   */
  closedGates(): Gate[] {
    return entitiesOf(this.room, 'Gate')
      .map((g) => ({ id: fieldText(g, 'gateId'), opensWith: fieldText(g, 'opensWith'), rect: { x: g.x, y: g.y, w: g.w, h: g.h } }))
      .filter((g) => !this.progress.flags.has(`gate:${g.id}`) && (g.opensWith.startsWith('spell:') || !this.has(g.opensWith)));
  }

  /** Whether casting `spellId` opens a gate; fusions count as their sources. */
  spellOpens(gate: Gate, spellId: string): boolean {
    const wanted = gate.opensWith.startsWith('spell:') ? gate.opensWith.slice(6) : '';
    return !!wanted && (spellId === wanted || !!this.content.spells[spellId]?.fusion?.includes(wanted));
  }

  openGate(gate: Gate): void {
    this.progress.flags.add(`gate:${gate.id}`);
    this.burst(centerX(gate.rect), gate.rect.y + gate.rect.h - 45, '#e9a44c', 35);
    this.sound('gateOpen', centerX(gate.rect));
    this.save();
    this.spawnBosses();
  }

  bossActive(): boolean {
    return this.enemies.some((e) => e.boss && e.hp > 0);
  }

  /** Crossing a room edge enters whichever room lies beyond it in world space. */
  private checkExits(): boolean {
    const p = this.player;
    const r = this.room;
    const cx = centerX(p);
    const cy = centerY(p);
    if (cx >= 0 && cx < r.w && cy >= 0 && cy < r.h) return false;
    const target = this.bossActive() ? undefined : roomAt(this.content.world, r.x + cx, r.y + cy);
    if (!target) {
      if (cy >= r.h) this.hazard();
      else {
        p.x = clamp(p.x, 0, r.w - p.w);
        p.y = Math.max(p.y, -p.h / 2);
      }
      return false;
    }
    let x = r.x + p.x - target.x;
    let y = r.y + p.y - target.y;
    if (cx >= r.w) x = 2;
    else if (cx < 0) x = target.w - p.w - 2;
    else if (cy >= r.h) y = 2;
    else y = target.h - p.h - 2;
    this.enterRoom(target.id, x, y, { keepVelocity: true, boost: cy < 0 });
    return true;
  }

  // ------------------------------------------------------------ simulation

  /** Falling corpses and particles, which keep settling behind victory screens. */
  private settle(dt: number): void {
    for (const c of this.corpses) c.life -= dt;
    this.corpses = this.corpses.filter((c) => c.life > 0);
    for (const a of this.particles) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.vy += 230 * dt;
      a.life -= dt;
    }
    this.particles = this.particles.filter((a) => a.life > 0).slice(-250);
  }

  tick(dt: number, intent: Intent): void {
    this.time += dt;
    this.fade = Math.max(0, this.fade - dt);
    if (this.mode === 'win' || this.mode === 'interlude') this.settle(dt);
    if (this.mode !== 'play') return;
    if (this.trial) this.trial.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    const p = this.player;
    const room = this.room;
    const gates = this.closedGates();
    const solids = gates.map((g) => g.rect);

    const falling = !p.ground && p.vy > 320;
    const ev = updatePlayer(p, intent, this.progress.abilities, room, dt, solids);
    if (falling && p.ground) this.sound('land', p.x);
    if (ev.jumped || ev.wallJumped) this.sound('jump', p.x);
    if (ev.doubleJumped) this.sound('doubleJump', p.x);
    if (ev.dashed) this.sound('dash', p.x);
    if (ev.attacked) {
      this.serial++;
      this.sound('swing', p.x);
    }
    if (p.dash > 0) this.burst(p.x + 9, p.y + 18, '#82b6a2', 1);
    if (ev.doubleJumped) this.burst(p.x + 9, p.y + p.h, '#d9dcc0', 8);
    if (p.sliding && Math.random() < 0.3) this.burst(p.wallDir > 0 ? p.x + p.w : p.x, p.y + 10, '#8c9a78', 1);
    if (intent.castSlot) this.cast(intent.castSlot);

    if (this.bossActive()) p.x = clamp(p.x, 8, room.w - p.w - 8);
    if (this.checkExits()) return;
    if (intent.interactPressed) this.interact();
    if (touchesTile(room, p, Tile.Spikes)) this.hazard();
    if (this.mode !== 'play') return;

    const sword = p.attack > 0 ? swordBox(p) : null;
    this.updateEnemies(dt, sword, solids);
    if (sword && p.attackDown && this.pogoSerial !== this.serial && touchesTile(room, sword, Tile.Spikes, 0)) this.bounce();
    if (sword) this.swordOnGates(sword, gates);
    this.updateShots(dt, gates);
    this.updateArrows(dt, solids);
    this.updateWaves(dt);
    this.updateHazards(dt);
    this.burnAround();
    for (const fx of this.effects) fx.life -= dt;
    this.effects = this.effects.filter((fx) => fx.life > 0);
    this.settle(dt);
    this.updateCamera(dt);
  }

  private bounce(): void {
    this.pogoSerial = this.serial;
    pogo(this.player, this.progress.abilities.has('double_jump') ? 1 : 0);
    this.sound('pogo', this.player.x);
  }

  private updateEnemies(dt: number, sword: Rect | null, solids: Rect[]): void {
    const p = this.player;
    const room = this.room;
    // Copy: summons and boss defeat modify the list mid-loop.
    for (const e of [...this.enemies]) {
      if (e.hp <= 0) continue;
      e.hit = Math.max(0, e.hit - dt);
      e.burnCd = Math.max(0, e.burnCd - dt);
      const flying = e.def?.ai === 'flyer';
      if (e.frozen > 0) {
        // Frozen: everything stops, including the attack timers.
        e.frozen = Math.max(0, e.frozen - dt);
        e.vx = 0;
        if (flying) e.vy = 0;
      } else if (e.knock > 0) {
        e.knock = Math.max(0, e.knock - dt);
        e.vx = e.knockVx;
        if (flying) e.vy = 0;
      } else {
        e.timer -= dt;
        e.face = centerX(p) < centerX(e) ? -1 : 1;
        e.vx = 0;
        if (e.boss) updateBoss(e, this.ctx);
        else if (e.def?.ai === 'archer') updateArcher(e, e.def, this.ctx);
        else if (e.def?.ai === 'melee') updateMelee(e, e.def, this.ctx);
        else if (e.def?.ai === 'flyer') updateFlyer(e, e.def, this.ctx, this.time);
        if (this.mode !== 'play') return;
        guardLedge(e, room, dt, solids);
      }
      if (!flying) e.vy = Math.min(PHYS.maxFall, e.vy + PHYS.gravity * dt);
      moveBody(room, e, dt, solids);
      e.x = clamp(e.x, 0, room.w - e.w);
      if (e.y > room.h + 40) {
        e.hp = 0;
        this.killEnemy(e);
        continue;
      }
      if (sword && e.attackId !== this.serial && overlap(sword, e)) {
        e.attackId = this.serial;
        this.hitEnemy(e, 1);
        p.mana = Math.min(PLAYER.maxMana, p.mana + 1);
        if (p.attackDown && this.pogoSerial !== this.serial) this.bounce();
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  private summon(list: BossSummon[]): void {
    const T = this.room.tile;
    for (const s of list) {
      const def = this.content.enemies[s.kind];
      if (!def) continue;
      const e = createEnemy(s.kind, def, s.x * T + T / 2, (s.y + 1) * T, null);
      Object.assign(e, { summoned: true, state: 'recover', timer: 1.4, face: s.x * T < this.room.w / 2 ? 1 : -1 });
      this.enemies.push(e);
    }
  }

  /** Casts whatever is equipped in slot 1..n; empty slots do nothing. */
  private cast(slot: number): void {
    const p = this.player;
    const id = loadout.spellInSlot(this.progress, slot - 1);
    const spell = id && this.content.spells[id];
    if (!spell || p.magicCool > 0) return;
    if (p.mana < spell.cost) {
      this.sound('noMana');
      return;
    }
    p.mana -= spell.cost;
    p.magicCool = PLAYER.magicCool;
    castEffect(this, id, spell, loadout.levelData(this.content, this.progress, id));
  }

  /** Frost holds bosses for a shorter time. */
  freeze(e: Enemy, seconds: number): void {
    e.frozen = Math.max(e.frozen, e.boss ? seconds * 0.4 : seconds);
    this.burst(centerX(e), centerY(e), '#bfe6ff', 10);
  }

  private static readonly SHOT_COLORS: Record<Shot['kind'], string> = { fire: '#e6af64', frost: '#bfe6ff', vortex: '#f08a3c' };

  private updateShots(dt: number, gates: Gate[]): void {
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.life -= dt;
      this.burst(s.x + s.w / 2, s.y + s.h / 2, Game.SHOT_COLORS[s.kind], s.kind === 'vortex' ? 3 : 1);
      for (const gate of gates) {
        if (s.life <= 0 || !overlap(s, gate.rect)) continue;
        if (this.spellOpens(gate, s.spell)) this.openGate(gate);
        else this.gateResists(gate, s);
        s.life = 0;
      }
      // A vortex rolls along the floor: only its core collides with walls.
      const core = s.kind === 'vortex' ? { x: s.x + 8, y: s.y + 8, w: s.w - 16, h: s.h - 16 } : s;
      if (hitsSolid(this.room, core)) s.life = 0;
      for (const e of [...this.enemies]) {
        if (s.life <= 0 || e.hp <= 0 || !overlap(s, e) || (s.hits.get(e) ?? -1) > this.time) continue;
        s.hits.set(e, s.rehit ? this.time + s.rehit : Infinity);
        if (s.freeze) this.freeze(e, s.freeze);
        this.hitEnemy(e, s.damage);
        if (!s.pierce) s.life = 0;
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  /** A fiery shield burns enemies that touch it. */
  private burnAround(): void {
    const p = this.player;
    if (p.shield <= 0 || !p.shieldBurn) return;
    const ring = { x: centerX(p) - 42, y: centerY(p) - 42, w: 84, h: 84 };
    for (const e of [...this.enemies]) {
      if (e.hp <= 0 || e.burnCd > 0 || !overlap(ring, e)) continue;
      e.burnCd = 0.35;
      this.hitEnemy(e, p.shieldBurn);
    }
  }

  private updateArrows(dt: number, solids: Rect[]): void {
    const p = this.player;
    for (const a of this.arrows) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
      // One-way platforms are not solid, so arrows fly through them.
      if (a.ax) a.vx += a.ax * dt;
      if (!a.pass && (hitsSolid(this.room, a) || solids.some((s) => overlap(a, s)))) {
        a.life = 0;
        continue;
      }
      if (a.friendly) {
        const target = this.enemies.find((e) => e.hp > 0 && overlap(a, e));
        if (target) {
          this.hitEnemy(target, a.damage ?? 1);
          a.life = 0;
        }
      } else if (overlap(p, a)) {
        if (p.shield > 0 && (a.shard || a.spin)) a.life = 0;
        else if (p.shield > 0) {
          Object.assign(a, { vx: -a.vx, vy: -a.vy, friendly: true, life: 3, damage: p.reflectDamage });
          this.sound('reflect', a.x);
        } else if (p.dash <= 0) {
          this.hurtPlayer(a.x);
          a.life = 0;
        }
      }
    }
    const r = this.room;
    this.arrows = this.arrows.filter((a) => a.life > 0 && a.x > -25 && a.x < r.w + 25 && a.y > -25 && a.y < r.h + 25);
  }

  /** Warned areas: harmless while delayed, then they hurt until they expire. */
  private updateHazards(dt: number): void {
    const p = this.player;
    for (const h of this.hazards) {
      if (h.delay > 0) {
        h.delay -= dt;
        if (h.delay <= 0 && h.kind === 'pillar') {
          this.burst(h.x + h.w / 2, h.y + h.h, '#8fd0e0', 6);
          this.sound('pillar', h.x);
        }
        continue;
      }
      h.life -= dt;
      if (overlap(p, h)) this.hurtPlayer(h.x);
    }
    this.hazards = this.hazards.filter((h) => h.life > 0);
  }

  private updateWaves(dt: number): void {
    const p = this.player;
    for (const w of this.waves) {
      w.x += w.vx * dt;
      w.life -= dt;
      if (!overlap(p, w)) continue;
      if (p.shield > 0) w.life = 0;
      else this.hurtPlayer(w.x);
    }
    this.waves = this.waves.filter((w) => w.life > 0);
  }

  updateCamera(dt: number, snap = false): void {
    const r = this.room;
    const p = this.player;
    const tx = r.w <= VIEW_W ? (r.w - VIEW_W) / 2 : clamp(centerX(p) - VIEW_W / 2, 0, r.w - VIEW_W);
    const ty = r.h <= VIEW_H ? (r.h - VIEW_H) / 2 : clamp(centerY(p) - VIEW_H / 2, 0, r.h - VIEW_H);
    const k = snap ? 1 : Math.min(1, dt * 8);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
  }

  burst(x: number, y: number, color: string, n = 12): void {
    for (let i = 0; i < n; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 180, vy: -Math.random() * 150, life: 0.3 + Math.random() * 0.5, color });
  }

  // ------------------------------------------------------------ combat

  hurtPlayer(_sourceX: number): void {
    const p = this.player;
    if (p.inv > 0 || p.dash > 0 || p.shield > 0 || this.mode !== 'play') return;
    this.damagePlayer();
  }

  private damagePlayer(): void {
    const p = this.player;
    p.hp--;
    p.inv = PLAYER.invuln;
    p.vy = -220;
    this.shake = 0.2;
    this.burst(p.x + 9, p.y + 12, '#dc8b75');
    this.sound('hurt', p.x);
    if (p.hp <= 0) {
      this.mode = 'dead';
      this.events.emit('dead', undefined);
    }
  }

  /** Spikes and bottomless pits: lose a heart and return to the last safe footing. */
  hazard(): void {
    const p = this.player;
    if (p.inv <= 0 && p.shield <= 0) {
      this.damagePlayer();
      if (this.mode !== 'play') return;
    }
    Object.assign(p, { x: p.safe.x, y: p.safe.y, vx: 0, vy: 0, dash: 0, inv: Math.max(p.inv, 0.8) });
    this.fade = 0.3;
  }

  hitEnemy(e: Enemy, amount: number): void {
    if (e.hp <= 0) return;
    if (e.boss?.guard) {
      // Roaring into a new phase: blows glance off.
      this.burst(centerX(e), centerY(e), '#eaf8ff', 6);
      this.sound('guard', centerX(e));
      return;
    }
    e.hp -= amount;
    e.hit = 0.16;
    this.burst(centerX(e), centerY(e), '#a52d35');
    this.sound(e.hp <= 0 ? 'kill' : 'enemyHit', centerX(e));
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e: Enemy): void {
    if (e.id) this.progress.defeated.add(e.id);
    this.burst(centerX(e), centerY(e), '#bc303c', e.boss ? 65 : 32);
    this.burst(centerX(e), centerY(e), '#681b29', 18);
    this.corpses.push({ enemy: { ...e, state: 'idle', hit: 0, frozen: 0 }, life: 0.65 });
    this.stain(e);
    const shards = e.boss ? e.boss.def.shards : (e.def?.shards ?? 0);
    // Nothing is earned in the Pantheon.
    if (shards && !this.trial) {
      this.progress.shards += shards;
      this.burst(centerX(e), centerY(e), '#9fe3ff', Math.min(24, shards * 3));
    }
    if (e.boss && this.trial) {
      // A Pantheon boss: nothing is earned or saved; the run moves on.
      const t = this.trial;
      this.enemies = this.enemies.filter((x) => !x.summoned);
      this.arrows = [];
      this.waves = [];
      this.hazards = [];
      t.index++;
      const done = t.index >= t.queue.length;
      this.mode = done ? 'win' : 'interlude';
      this.events.emit('trialCleared', { boss: e.boss.def, done, time: t.time });
      return;
    }
    if (e.boss) {
      const { def, id } = e.boss;
      this.progress.flags.add(`boss:${id}`);
      if (def.reward) this.progress.items.add(def.reward);
      this.enemies = this.enemies.filter((x) => !x.summoned);
      this.arrows = [];
      this.waves = [];
      this.hazards = [];
      this.save();
      this.mode = 'win';
      this.events.emit('victory', def);
      return;
    }
    this.save();
  }

  private stain(e: Enemy): void {
    const surface = surfaceBelow(this.room, centerX(e), e.y + e.h - 4);
    if (surface === null) return;
    const stains = this.blood.get(this.room.id) ?? [];
    for (let i = 0; i < 12; i++) {
      const x = centerX(e) + (Math.random() - 0.5) * 40;
      if (surfaceBelow(this.room, x, e.y + e.h - 4) !== surface) continue;
      stains.push({ x, y: surface - 2 + Math.random() * 5, w: 3 + Math.random() * 8, h: 2 + Math.random() * 3, color: i % 3 ? '#771e2d' : '#a32c37' });
    }
    this.blood.set(this.room.id, stains.slice(-240));
  }

  // ------------------------------------------------------------ interaction

  isAvailable(e: EntitySpawn): boolean {
    switch (e.type) {
      case 'Item':
        return !this.progress.items.has(fieldText(e, 'item'));
      case 'Ability':
        return !this.progress.abilities.has(fieldText(e, 'ability'));
      case 'Page':
        return !this.progress.pages.has(fieldText(e, 'page'));
      default:
        return INTERACTIVE.has(e.type);
    }
  }

  /** The closest usable entity within reach, for prompts and the interact key. */
  interactTarget(): EntitySpawn | null {
    const p = this.player;
    const fx = centerX(p);
    const fy = p.y + p.h;
    let best: EntitySpawn | null = null;
    let bestDist: number = PLAYER.interactRange;
    for (const e of this.room.entities) {
      if (!INTERACTIVE.has(e.type) || !this.isAvailable(e)) continue;
      const d = Math.hypot(fx - e.ax, fy - e.ay);
      if (d <= bestDist) [best, bestDist] = [e, d];
    }
    return best;
  }

  interact(): void {
    const e = this.interactTarget();
    if (!e) return;
    const pr = this.progress;
    if (e.type === 'Shrine') return this.rest(e);
    if (e.type === 'Item') {
      const id = fieldText(e, 'item');
      pr.items.add(id);
      this.save();
      this.toast(this.content.items[id]?.pickup ?? id);
      this.sound('item');
    } else if (e.type === 'Ability') {
      const id = fieldText(e, 'ability');
      pr.abilities.add(id);
      this.save();
      this.toast(this.content.abilities[id]?.pickup ?? id);
      this.sound('ability');
    } else if (e.type === 'Page') {
      const id = fieldText(e, 'page');
      if (!pr.pages.has(id)) {
        pr.pages.set(id, { solved: false });
        this.save();
        this.sound('page');
        this.toast(pr.items.has('grimoire') ? 'PÁGINA ENCONTRADA · Se incorporó al grimorio.' : 'PÁGINA ENCONTRADA · Su escritura es extraña. Quizá un libro antiguo ayude a comprenderla.');
      }
      if (pr.items.has('grimoire') && !pr.pages.get(id)?.solved) this.events.emit('openPage', id);
    } else if (e.type === 'Clue') {
      const id = fieldText(e, 'clue');
      if (!pr.clues.has(id)) {
        pr.clues.add(id);
        this.save();
      }
      this.events.emit('readClue', id);
    }
  }

  private rest(shrine: EntitySpawn): void {
    const spot = standOn(shrine);
    this.progress.checkpoint = { room: this.room.id, ...spot };
    const p = this.player;
    p.hp = PLAYER.maxHp;
    p.mana = PLAYER.maxMana;
    this.resetEncounters();
    this.enterRoom(this.room.id, p.x, p.y);
    p.inv = PLAYER.invuln;
    this.save();
    this.sound('shrine');
    this.mode = 'shrine';
    this.events.emit('shrine', undefined);
  }

  // ------------------------------------------------------------ spells

  /** Learns a spell, equipping it when a slot is free, and announces it. */
  learnSpell(id: string): void {
    const spell = this.content.spells[id];
    if (!spell) return;
    const slot = loadout.learn(this.content, this.progress, id);
    this.save();
    this.toast(`${spell.unlock} · ${slot >= 0 ? `{spell${slot + 1}} para lanzarla.` : 'Equipala descansando en un santuario.'}`);
    // Connect the new spell with obstacles already seen that it can open.
    for (const gate of this.gatesOpenedBy(id)) {
      const recall = this.content.gates[gate.id]?.recall;
      if (recall) this.toast(recall);
    }
  }

  /** Still-closed gates this spell opens, in rooms the player has visited. */
  gatesOpenedBy(spellId: string): Gate[] {
    return this.content.world.rooms
      .filter((r) => this.progress.visited.has(r.id))
      .flatMap((r) => entitiesOf(r, 'Gate'))
      .map((g) => ({ id: fieldText(g, 'gateId'), opensWith: fieldText(g, 'opensWith'), rect: { x: g.x, y: g.y, w: g.w, h: g.h } }))
      .filter((g) => g.opensWith === `spell:${spellId}` && !this.progress.flags.has(`gate:${g.id}`));
  }

  // ------------------------------------------------------------ obstacles

  private gateSerial = -1;

  /** Sword blows glance off gates; a downward strike bounces off them. */
  private swordOnGates(sword: Rect, gates: Gate[]): void {
    if (this.gateSerial === this.serial) return;
    const gate = gates.find((g) => overlap(sword, g.rect));
    if (!gate) return;
    this.gateSerial = this.serial;
    if (this.player.attackDown && this.pogoSerial !== this.serial) this.bounce();
    this.gateResists(gate, sword);
  }

  /**
   * Something that doesn't open a gate hit it: sparks, a dull sound and,
   * the first time, the player's thought hinting at what might work.
   */
  gateResists(gate: Gate, by: Rect): void {
    const x = clamp(centerX(by), gate.rect.x, gate.rect.x + gate.rect.w);
    const y = clamp(centerY(by), gate.rect.y, gate.rect.y + gate.rect.h);
    this.burst(x, y, '#f2e3a6', 6);
    this.sound('gateBlock', x);
    const noted = `noted:${gate.id}`;
    const hit = this.content.gates[gate.id]?.hit;
    if (!hit || this.progress.flags.has(noted)) return;
    this.progress.flags.add(noted);
    this.save();
    this.toast(hit);
  }

  /** Loadout changes only happen while resting at a shrine. */
  private preparing(): boolean {
    return this.mode === 'shrine';
  }

  equipSpell(id: string): boolean {
    return this.preparing() && loadout.equip(this.content, this.progress, id) && (this.save(), true);
  }

  unequipSpell(id: string): boolean {
    return this.preparing() && loadout.unequip(this.progress, id) && (this.save(), true);
  }

  upgradeSpell(id: string): boolean {
    if (!this.preparing() || !loadout.upgrade(this.content, this.progress, id)) return false;
    this.save();
    this.sound('upgrade');
    return true;
  }

  fuseSpells(id: string): boolean {
    if (!this.preparing() || !loadout.fuse(this.content, this.progress, id)) return false;
    loadout.equip(this.content, this.progress, id);
    this.save();
    this.sound('fuse');
    return true;
  }

  // ------------------------------------------------------------ grimoire

  page(id: string): PageDef | undefined {
    return this.content.pages.find((p) => p.id === id);
  }

  /** Current reading of a page with a candidate key. */
  readPage(page: PageDef, key: CipherKey, text = page.ciphertext): string {
    return decode(page.cipher, text, key, this.content.scripts);
  }

  /** Checks a translation against the stored hash and teaches the page's spell. */
  solvePage(id: string, key: CipherKey): boolean {
    const page = this.page(id);
    if (!page || !this.progress.pages.has(id)) return false;
    if (solutionHash(page.id, this.readPage(page, key)) !== page.solutionHash) return false;
    this.progress.pages.set(id, { solved: true, key });
    this.player.mana = PLAYER.maxMana;
    this.learnSpell(page.spell);
    this.sound('solve');
    return true;
  }

  /** Glyph → letter pairs revealed by the clues read so far. */
  knownGlyphs(script: string): Record<string, string> {
    const glyphs = [...(this.content.scripts[script] ?? '')];
    const known: Record<string, string> = {};
    for (const clue of this.content.clues) {
      if (!clue.script || clue.script !== script || !this.progress.clues.has(clue.id)) continue;
      for (const c of clue.word) {
        const i = c.charCodeAt(0) - 65;
        if (i >= 0 && i < 26) known[glyphs[i]] = c;
      }
    }
    return known;
  }

  has(token: string): boolean {
    return hasToken(this.progress, token);
  }
}
