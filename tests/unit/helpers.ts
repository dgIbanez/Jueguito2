import { STEP } from '../../src/config.ts';
import { loadContent } from '../../src/content/index.ts';
import { SaveStore, type KeyValueStorage } from '../../src/core/save.ts';
import { idleIntent, type Intent } from '../../src/entities/player.ts';
import { Game, saveContext } from '../../src/game/game.ts';
import type { RoomData } from '../../src/world/ldtk.ts';

export function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

export function makeGame(storage = memoryStorage()) {
  const content = loadContent();
  const game = new Game(content, new SaveStore(storage, saveContext(content)));
  return { game, content, storage };
}

/** A new game already in play mode at the start shrine. */
export function playing() {
  const setup = makeGame();
  setup.game.newGame();
  return setup;
}

export function run(game: Game, frames: number, intent: Partial<Intent> = {}): void {
  for (let i = 0; i < frames; i++) game.tick(STEP, { ...idleIntent(), ...intent });
}

/** Places the player standing on the floor of a room (feet at y). */
export function stand(game: Game, room: string, x: number, feetY = 480): void {
  game.enterRoom(room, x, feetY - game.player.h);
  game.player.ground = true;
}

/** Builds a room from ASCII rows: # solid, - one-way, ^ spikes. */
export function asciiRoom(rows: string[], tile = 24): RoomData {
  const cols = rows[0].length;
  const grid = Uint8Array.from(rows.join('').split('').map((c) => ({ '#': 1, '-': 2, '^': 3 })[c] ?? 0));
  return { id: 'Test', name: 'Test', biome: 'forest', requires: [], x: 0, y: 0, w: cols * tile, h: rows.length * tile, cols, rows: rows.length, tile, grid, entities: [] };
}
