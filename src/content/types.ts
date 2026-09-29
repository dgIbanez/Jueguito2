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
  /** Music track per phase (the last one repeats). */
  music?: string[];
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
  sfx: Record<string, SfxDef>;
  music: MusicDef;
  /** Obstacle texts keyed by gateId. */
  gates: Record<string, GateText>;
  /** Skeletal rigs keyed by boss look. */
  rigs: Record<string, RigDef>;
}

/** One synthesized layer of a sound effect: a tone or filtered noise with an envelope. */
export interface SfxLayer {
  wave: OscillatorType | 'noise';
  /** Tone pitch in Hz (for noise, the default filter frequency). */
  freq: number;
  /** Pitch at the end of the sound, for sweeps. */
  to?: number;
  dur: number;
  gain: number;
  attack?: number;
  delay?: number;
  filter?: { type: BiquadFilterType; freq: number; to?: number; q?: number };
  /** Share sent to the reverb, 0-1. */
  reverb?: number;
}

export interface SfxDef {
  /** Random pitch variation (±fraction) so repeated sounds don't feel robotic. */
  vary?: number;
  layers: SfxLayer[];
}

interface MusicVoice {
  gain: number;
  wave: OscillatorType;
  /** Octaves above (or below) the track root. */
  octave: number;
}

/** A generative track: a chord per bar, 16 steps per bar, layered voices. */
export interface MusicTrack {
  bpm: number;
  /** MIDI note of the scale root. */
  root: number;
  scale: number[];
  /** Scale degrees of each bar's chord (7 and up wrap to the next octave). */
  chords: number[][];
  layers: {
    pad?: MusicVoice & { cutoff: number };
    /** Pattern values: 1 root, 2 fifth, 3 octave, 0 rest. */
    bass?: MusicVoice & { cutoff: number; pattern: number[] };
    /** Plays the next chord tone on each 1. */
    arp?: MusicVoice & { decay: number; echo: number; pattern: number[] };
    /** Sparse melody wandering the scale; density is the chance per eighth note. */
    bells?: { gain: number; octave: number; density: number; decay: number; echo: number };
    drums?: { gain: number; kick: number[]; snare: number[]; hat: number[] };
  };
}

export interface MusicDef {
  title: string;
  /** Track for each room biome. */
  biomes: Record<string, string>;
  tracks: Record<string, MusicTrack>;
}

/** What the player thinks about an obstacle: on hitting it, and on learning what opens it. */
export interface GateText {
  name: string;
  hit: string;
  recall?: string;
}
