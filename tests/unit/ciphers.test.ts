import { describe, expect, it } from 'vitest';
import scripts from '../../data/scripts.json';
import { atbash, caesar, decode, encode, normalize, runesDecode, runesEncode, runesFor, vigenere } from '../../src/magic/ciphers.ts';
import { cyrb53, solutionHash } from '../../src/magic/hash.ts';

describe('ciphers', () => {
  it('normalizes accents, case and spacing', () => {
    expect(normalize('  Égida   de  runas ')).toBe('EGIDA DE RUNAS');
  });

  it('caesar shifts letters and keeps spaces', () => {
    expect(caesar('LA LLAMA ABRE EL CAMINO', 3)).toBe('OD OODPD DEUH HO FDPLQR');
    expect(caesar('OD OODPD', -3)).toBe('LA LLAMA');
    expect(caesar('XYZ', 3)).toBe('ABC');
  });

  it('atbash is its own inverse', () => {
    expect(atbash('ABC XYZ')).toBe('ZYX CBA');
    expect(atbash(atbash('GRIMORIO'))).toBe('GRIMORIO');
  });

  it('vigenere round-trips and skips non-letters in the key stream', () => {
    const coded = vigenere('LA TORRE GRIS', 'IULIN', 1);
    expect(coded).not.toBe('LA TORRE GRIS');
    expect(vigenere(coded, 'iulin', -1)).toBe('LA TORRE GRIS');
    expect(vigenere('HOLA', '', 1)).toBe('HOLA');
  });

  it('rune script maps every letter to a distinct glyph', () => {
    const script = scripts.iulin;
    expect([...script]).toHaveLength(26);
    expect(new Set(script).size).toBe(26);
    const coded = runesEncode('LA RUNA', script);
    expect(runesDecode(coded, script, runesFor('LARUN', script))).toBe('LA RUNA');
    expect(runesDecode(coded, script, runesFor('RUNA', script))).toBe('·A RUNA');
  });

  it('encode and decode agree for every cipher type', () => {
    const plain = 'EL ESCRIBA ESPERA';
    for (const [spec, key] of [
      [{ type: 'caesar' }, { shift: 7 }],
      [{ type: 'atbash' }, { mirror: true }],
      [{ type: 'vigenere' }, { word: 'SAERH' }],
    ] as const) {
      expect(decode(spec, encode(spec, plain, key, scripts), key, scripts)).toBe(plain);
    }
  });

  it('solution hashes are stable and page-specific', () => {
    expect(cyrb53('abc')).toBe(cyrb53('abc'));
    expect(solutionHash('a', 'la llama')).toBe(solutionHash('a', 'LA  LLAMA'));
    expect(solutionHash('a', 'LA LLAMA')).not.toBe(solutionHash('b', 'LA LLAMA'));
  });
});
