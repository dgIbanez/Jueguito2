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

/**
 * Tuning of one boss attack. Fields ending in "Enraged" replace their base
 * value from the second phase on.
 */
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
  accel?: number;
  count?: number;
  countEnraged?: number;
  spacing?: number;
  delay?: number;
  step?: number;
  life?: number;
  height?: number;
  bounces?: number;
  bouncesEnraged?: number;
}

export interface BossSummon {
  /** Tile coordinates of the arena (feet cell). */
  x: number;
  y: number;
  kind: string;
}

export interface BossPhase {
  /** Health fraction at which this phase starts (1 for the first). */
  at: number;
  pattern: string[];
  /** How the boss enters the phase: calling reinforcements or a roar (invulnerable). */
  transition?: { kind: 'summon' | 'roar'; time: number; summon?: BossSummon[] };
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
  phases: BossPhase[];
  moves: Record<string, BossMoveDef>;
  victory: { eyebrow: string; title: string; text: string };
}

/** One drawn piece of a bone, in the bone's local space (y grows downward). */
export interface RigPart {
  shape: 'rect' | 'poly' | 'circle';
  color: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  points?: [number, number][];
  /** Pulses with the pose's "glow" value. */
  glow?: boolean;
  /** Only drawn from this boss phase on (1-based). */
  phase?: number;
}

export interface RigBone {
  id: string;
  parent?: string;
  /** Attachment point in the parent's space (the root's is relative to the feet). */
  x: number;
  y: number;
  /** Draw order: lower first. */
  z?: number;
  parts: RigPart[];
}

/**
 * Pose values: bone rotations in degrees keyed by bone id, plus rootX, rootY,
 * rootRot (degrees), scaleX, scaleY, glow (0-1) and hide_<bone> (hidden when > 0.5).
 */
export type Pose = Record<string, number>;

export interface RigClip {
  /** Looping clips play on wall time; the others follow the boss state's progress. */
  loop?: boolean;
  duration?: number;
  /** Values held for the whole clip unless a keyframe overrides them. */
  base?: Pose;
  /** t from 0 to 1. */
  keys: { t: number; pose: Pose }[];
}

export interface RigDef {
  /** Pivot for rootRot, relative to the feet. */
  center: [number, number];
  bones: RigBone[];
  clips: Record<string, RigClip>;
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
  /** Skeletal rigs keyed by boss look. */
  rigs: Record<string, RigDef>;
}
