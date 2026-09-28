import type { CipherKey } from '../magic/ciphers.ts';

export interface Checkpoint {
  room: string;
  x: number;
  y: number;
}

export interface PageState {
  solved: boolean;
  key?: CipherKey;
}

/**
 * Everything a save file remembers. Tokens use the form "kind:id"
 * (for example "ability:dash") when requirements are checked.
 */
export interface Progress {
  abilities: Set<string>;
  spells: Set<string>;
  items: Set<string>;
  pages: Map<string, PageState>;
  clues: Set<string>;
  flags: Set<string>;
  visited: Set<string>;
  defeated: Set<string>;
  checkpoint: Checkpoint;
}

export function newProgress(checkpoint: Checkpoint): Progress {
  return {
    abilities: new Set(),
    spells: new Set(),
    items: new Set(),
    pages: new Map(),
    clues: new Set(),
    flags: new Set(),
    visited: new Set(),
    defeated: new Set(),
    checkpoint: { ...checkpoint },
  };
}

/** Whether a requirement token ("ability:dash", "spell:ascua", "flag:x"...) is met. */
export function hasToken(p: Progress, token: string): boolean {
  const [kind, id] = token.split(':');
  switch (kind) {
    case 'ability':
      return p.abilities.has(id);
    case 'spell':
      return p.spells.has(id);
    case 'item':
      return p.items.has(id);
    case 'page':
      return p.pages.has(id);
    case 'clue':
      return p.clues.has(id);
    default:
      return p.flags.has(token);
  }
}
