/**
 * Cipher engine for grimoire pages. Every cipher works on normalized text:
 * uppercase A–Z, spaces and punctuation, without diacritics.
 */

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const UNKNOWN = '·';

export type CipherSpec =
  | { type: 'caesar' }
  | { type: 'atbash' }
  | { type: 'vigenere' }
  | { type: 'runes'; script: string };

export type CipherType = CipherSpec['type'];

/** The player-controlled parameters of each tool. */
export interface CipherKey {
  shift?: number;
  mirror?: boolean;
  word?: string;
  /** Rune glyph → letter. */
  map?: Record<string, string>;
}

export const CIPHER_TYPES: CipherType[] = ['caesar', 'atbash', 'vigenere', 'runes'];

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const mod = (n: number, m: number): number => ((n % m) + m) % m;
const isLetter = (c: string): boolean => c >= 'A' && c <= 'Z';

/** Shifts letters forward by `shift` (negative to decode). */
export function caesar(text: string, shift: number): string {
  return text.replace(/[A-Z]/g, (c) => ALPHABET[mod(c.charCodeAt(0) - 65 + shift, 26)]);
}

export function atbash(text: string): string {
  return text.replace(/[A-Z]/g, (c) => ALPHABET[25 - (c.charCodeAt(0) - 65)]);
}

/** Vigenère over letters only; the key advances only on letters. */
export function vigenere(text: string, word: string, direction: 1 | -1): string {
  const key = normalize(word).replace(/[^A-Z]/g, '');
  if (!key) return text;
  let i = 0;
  return [...text]
    .map((c) => {
      if (!isLetter(c)) return c;
      const k = key.charCodeAt(i++ % key.length) - 65;
      return ALPHABET[mod(c.charCodeAt(0) - 65 + direction * k, 26)];
    })
    .join('');
}

export function runesEncode(text: string, script: string): string {
  const glyphs = [...script];
  return [...text].map((c) => (isLetter(c) ? glyphs[c.charCodeAt(0) - 65] : c)).join('');
}

/** How a clue word looks carved in the world: in runes, or plain for inscriptions. */
export const carved = (word: string, glyphs: string | undefined): string => (glyphs ? runesEncode(word, glyphs) : normalize(word));

/** Replaces each glyph with the letter the player assigned, or UNKNOWN. */
export function runesDecode(text: string, script: string, map: Record<string, string>): string {
  const glyphs = new Set(script);
  return [...text].map((c) => (glyphs.has(c) ? map[c] || UNKNOWN : c)).join('');
}

/** Letters a rune script maps to, for clue words. */
export function runesFor(word: string, script: string): Record<string, string> {
  const glyphs = [...script];
  const found: Record<string, string> = {};
  for (const c of normalize(word)) if (isLetter(c)) found[glyphs[c.charCodeAt(0) - 65]] = c;
  return found;
}

export function distinctGlyphs(text: string, script: string): string[] {
  const glyphs = new Set(script);
  return [...new Set([...text].filter((c) => glyphs.has(c)))];
}

export function defaultKey(spec: CipherSpec): CipherKey {
  switch (spec.type) {
    case 'caesar':
      return { shift: 0 };
    case 'atbash':
      return { mirror: false };
    case 'vigenere':
      return { word: '' };
    case 'runes':
      return { map: {} };
  }
}

/** Applies the player's key to the ciphertext. */
export function decode(spec: CipherSpec, text: string, key: CipherKey, scripts: Record<string, string>): string {
  switch (spec.type) {
    case 'caesar':
      return caesar(text, -(key.shift ?? 0));
    case 'atbash':
      return key.mirror ? atbash(text) : text;
    case 'vigenere':
      return vigenere(text, key.word ?? '', -1);
    case 'runes':
      return runesDecode(text, scripts[spec.script] ?? '', key.map ?? {});
  }
}

/** Authoring helper: turns plaintext into page ciphertext. */
export function encode(spec: CipherSpec, plaintext: string, key: CipherKey, scripts: Record<string, string>): string {
  const text = normalize(plaintext);
  switch (spec.type) {
    case 'caesar':
      return caesar(text, key.shift ?? 0);
    case 'atbash':
      return atbash(text);
    case 'vigenere':
      return vigenere(text, key.word ?? '', 1);
    case 'runes':
      return runesEncode(text, scripts[spec.script] ?? '');
  }
}
