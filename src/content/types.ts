import type { CipherSpec } from '../magic/ciphers.ts';
import type { WorldData } from '../world/ldtk.ts';

interface EnemyBase {
  w: number;
  h: number;
  hp: number;
  /** Mana shards the player collects on the kill. */
  shards: number;
}

export interface MeleeDef extends EnemyBase {
  ai: 'melee';
  look: 'goblin' | 'hob' | 'crawler';
  speed: number;
  detect: number;
  trigger: number;
  reach: number;
  windup: number;
  strike: number;
  recover: number;
}

export interface ArcherDef extends EnemyBase {
  ai: 'archer';
  look: 'archer';
  range: number;
  windup: number;
  recover: number;
  rest: number;
  arrowSpeed: number;
}

/** Hovers near its roost, then swoops at where the player was. */
export interface FlyerDef extends EnemyBase {
  ai: 'flyer';
  look: 'bat';
  range: number;
  windup: number;
  swoop: number;
  recover: number;
  speed: number;
}

export type EnemyDef = MeleeDef | ArcherDef | FlyerDef;

export interface BossMoveDef {
  windup: number;
  windupEnraged: number;
  duration: number;
  recover: number;
  recoverEnraged: number;
  reach?: number;
  jump?: number;
  wave?: number;
  waveEnraged?: number;
  speed?: number;
  speedEnraged?: number;
  count?: number;
}

export interface BossDef {
  name: string;
  look: 'goblin-king' | 'golem';
  w: number;
  h: number;
  hp: number;
  shards: number;
  /** Item granted on victory (a seal). */
  reward?: string;
  enrageAt: number;
  pattern: string[];
  moves: Record<string, BossMoveDef>;
  summonTime: number;
  /** Reinforcements in tile coordinates of the arena (feet cell). */
  summon: { x: number; y: number; kind: string }[];
  victory: { eyebrow: string; title: string; text: string };
}

export interface AbilityDef {
  name: string;
  action: string;
  pickup: string;
  description: string;
}

export interface ItemDef {
  name: string;
  pickup: string;
  /** Seals widen the spell loadout by one slot. */
  spellSlot?: boolean;
}

/** Tuning of one spell level; each effect reads the fields it needs. */
export interface SpellLevel {
  summary: string;
  damage?: number;
  speed?: number;
  pierce?: boolean;
  duration?: number;
  reflectDamage?: number;
  burn?: number;
  reach?: number;
  push?: number;
  reflect?: boolean;
  freeze?: number;
  life?: number;
  rehit?: number;
}

export type SpellEffect = 'fire' | 'frost' | 'vortex' | 'shield' | 'gust';

export interface SpellDef {
  name: string;
  cost: number;
  effect: SpellEffect;
  levels: SpellLevel[];
  /** Shard cost to reach level 2, 3... */
  upgrade?: number[];
  /** Fusions are learned by combining two spells at level 2 or more. */
  fusion?: [string, string];
  fuseCost?: number;
  unlock: string;
  description: string;
}

export interface PageDef {
  id: string;
  numeral: string;
  title: string;
  cipher: CipherSpec;
  ciphertext: string;
  signature?: string;
  solutionHash: string;
  spell: string;
  note: string;
  failHint: string;
  /** Rune pages: glyphs the clues may leave unrevealed. */
  maxUnknown?: number;
  /** Vigenère pages: the clue whose word is the key. */
  keyClue?: string;
}

export interface ClueDef {
  id: string;
  title: string;
  text: string;
  /** Rune script the word is carved in; plain inscriptions have none. */
  script?: string;
  word: string;
}

export interface StoryDef {
  prologue: { eyebrow: string; title: string; paragraphs: string[] };
}

export interface Content {
  world: WorldData;
  enemies: Record<string, EnemyDef>;
  bosses: Record<string, BossDef>;
  abilities: Record<string, AbilityDef>;
  items: Record<string, ItemDef>;
  spells: Record<string, SpellDef>;
  pages: PageDef[];
  clues: ClueDef[];
  scripts: Record<string, string>;
  story: StoryDef;
}
