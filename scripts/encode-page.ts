/**
 * Authoring tool: prints the ciphertext and solution hash for a grimoire page.
 *
 *   npm run encode-page -- <pageId> caesar "LA LLAMA ABRE EL CAMINO" 3
 *   npm run encode-page -- <pageId> atbash "TEXTO"
 *   npm run encode-page -- <pageId> vigenere "TEXTO" CLAVE
 *   npm run encode-page -- <pageId> runes "TEXTO" iulin
 *
 * Copy both values into data/pages.json. The plaintext itself is never stored.
 */
import { readFileSync } from 'node:fs';
import { CIPHER_TYPES, encode, normalize, type CipherKey, type CipherSpec, type CipherType } from '../src/magic/ciphers.ts';
import { solutionHash } from '../src/magic/hash.ts';

const [pageId, type, plaintext, param = ''] = process.argv.slice(2);
if (!pageId || !CIPHER_TYPES.includes(type as CipherType) || !plaintext) {
  console.error('Uso: npm run encode-page -- <pageId> <caesar|atbash|vigenere|runes> "<texto>" [desplazamiento|clave|escritura]');
  process.exit(1);
}

const scripts = JSON.parse(readFileSync(new URL('../data/scripts.json', import.meta.url), 'utf8')) as Record<string, string>;
const spec = (type === 'runes' ? { type, script: param || 'iulin' } : { type }) as CipherSpec;
const key: CipherKey = type === 'caesar' ? { shift: Number(param) || 0 } : type === 'vigenere' ? { word: param } : {};

console.log(JSON.stringify({ cipher: spec, ciphertext: encode(spec, plaintext, key, scripts), solutionHash: solutionHash(pageId, normalize(plaintext)) }, null, 2));
