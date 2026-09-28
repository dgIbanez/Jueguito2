import { STORAGE } from '../config.ts';
import type { CipherKey } from '../magic/ciphers.ts';
import { newProgress, type Checkpoint, type PageState, type Progress } from '../game/progress.ts';

export const SAVE_VERSION = 2;

export interface SaveDataV2 {
  version: 2;
  abilities: string[];
  spells: string[];
  items: string[];
  pages: Record<string, PageState>;
  clues: string[];
  flags: string[];
  visited: string[];
  defeated: string[];
  checkpoint: Checkpoint;
}

/** What the loader needs to know about the current content to validate a save. */
export interface SaveContext {
  roomIds: Set<string>;
  /** v1 stored rooms by index, in this order. */
  legacyRooms: string[];
  /** Safe spawn point for a room when an old save points to changed geometry. */
  checkpointFor(room: string): Checkpoint;
}

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Migrates the single-file v1 save (boolean flags and room indexes). */
export function migrateV1(d: Record<string, unknown>, ctx: SaveContext): SaveDataV2 | null {
  const progress = isRecord(d.progress) ? d.progress : {};
  const checkpoint = isRecord(d.checkpoint) ? d.checkpoint : {};
  const room = typeof checkpoint.room === 'number' ? ctx.legacyRooms[checkpoint.room] : undefined;
  if (!room || !ctx.roomIds.has(room)) return null;
  const on = (key: string) => progress[key] === true;
  const pages: Record<string, PageState> = {};
  if (on('page')) pages.page_ascua = on('spell') ? { solved: true, key: { shift: 3 } } : { solved: false };
  return {
    version: 2,
    abilities: on('dash') ? ['dash'] : [],
    spells: on('spell') ? ['ascua'] : [],
    items: [...(on('map') ? ['map'] : []), ...(on('book') ? ['grimoire'] : [])],
    pages,
    clues: [],
    flags: [...(on('thorns') ? ['gate:thorns_throne'] : []), ...(on('boss') ? ['boss:groth'] : [])],
    visited: (Array.isArray(progress.visited) ? progress.visited : []).map((n) => ctx.legacyRooms[n as number]).filter((id): id is string => !!id),
    defeated: [],
    checkpoint: ctx.checkpointFor(room),
  };
}

function sanitizeKey(value: unknown): CipherKey | undefined {
  if (!isRecord(value)) return undefined;
  const key: CipherKey = {};
  if (typeof value.shift === 'number') key.shift = value.shift;
  if (typeof value.mirror === 'boolean') key.mirror = value.mirror;
  if (typeof value.word === 'string') key.word = value.word;
  if (isRecord(value.map)) key.map = Object.fromEntries(Object.entries(value.map).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  return key;
}

/** Validates any known save version and returns in-memory progress, or null. */
export function deserialize(raw: unknown, ctx: SaveContext): Progress | null {
  if (!isRecord(raw)) return null;
  let data: SaveDataV2 | null;
  if (raw.version === 1) data = migrateV1(raw, ctx);
  else if (raw.version === SAVE_VERSION) data = raw as unknown as SaveDataV2;
  else return null;
  if (!data) return null;
  const cp = isRecord(data.checkpoint) ? data.checkpoint : null;
  if (!cp || typeof cp.room !== 'string' || !ctx.roomIds.has(cp.room) || !Number.isFinite(cp.x) || !Number.isFinite(cp.y)) return null;

  const progress = newProgress({ room: cp.room, x: cp.x, y: cp.y });
  for (const id of strings(data.abilities)) progress.abilities.add(id);
  for (const id of strings(data.spells)) progress.spells.add(id);
  for (const id of strings(data.items)) progress.items.add(id);
  for (const id of strings(data.clues)) progress.clues.add(id);
  for (const id of strings(data.flags)) progress.flags.add(id);
  for (const id of strings(data.visited)) if (ctx.roomIds.has(id)) progress.visited.add(id);
  for (const id of strings(data.defeated)) progress.defeated.add(id);
  if (isRecord(data.pages))
    for (const [id, state] of Object.entries(data.pages))
      if (isRecord(state)) progress.pages.set(id, { solved: state.solved === true, key: sanitizeKey(state.key) });
  return progress;
}

export function serialize(p: Progress): SaveDataV2 {
  return {
    version: SAVE_VERSION,
    abilities: [...p.abilities],
    spells: [...p.spells],
    items: [...p.items],
    pages: Object.fromEntries(p.pages),
    clues: [...p.clues],
    flags: [...p.flags],
    visited: [...p.visited],
    defeated: [...p.defeated],
    checkpoint: { ...p.checkpoint },
  };
}

/** localStorage-backed save slot. Every access tolerates blocked storage. */
export class SaveStore {
  private readonly storage: KeyValueStorage | null;
  private readonly ctx: SaveContext;

  constructor(storage: KeyValueStorage | null, ctx: SaveContext) {
    this.storage = storage;
    this.ctx = ctx;
  }

  private read(key: string): unknown {
    try {
      const text = this.storage?.getItem(key);
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  load(): Progress | null {
    return deserialize(this.read(STORAGE.save), this.ctx) ?? deserialize(this.read(STORAGE.legacySave), this.ctx);
  }

  hasSave(): boolean {
    return this.load() !== null;
  }

  write(p: Progress): boolean {
    try {
      if (!this.storage) return false;
      this.storage.setItem(STORAGE.save, JSON.stringify(serialize(p)));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(STORAGE.save);
      this.storage?.removeItem(STORAGE.legacySave);
    } catch {
      /* storage blocked: nothing to clear */
    }
  }
}

export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
