import type { CipherSpec } from '../magic/ciphers.ts';
import type { WorldData } from '../world/ldtk.ts';

export interface MeleeDef {
  ai: 'melee';
  look: 'goblin' | 'hob';
  w: number;
  h: number;
  hp: number;
  speed: number;
  detect: number;
  trigger: number;
  reach: number;
  windup: number;
  strike: number;
  recover: number;
}

export interface ArcherDef {
  ai: 'archer';
  look: 'archer';
  w: number;
  h: number;
  hp: number;
  range: number;
  windup: number;
  recover: number;
  rest: number;
  arrowSpeed: number;
}

export type EnemyDef = MeleeDef | ArcherDef;

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
}

export interface BossDef {
  name: string;
  look: 'goblin-king';
  w: number;
  h: number;
  hp: number;
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
}

export interface SpellDef {
  name: string;
  slot: 1 | 2;
  cost: number;
  effect: 'projectile' | 'shield';
  damage?: number;
  speed?: number;
  duration?: number;
  unlock: string;
  description: string;
  /** Label/value rows shown on the translated page. */
  stats: string[][];
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
}

export interface ClueDef {
  id: string;
  title: string;
  text: string;
  script: string;
  word: string;
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
}
