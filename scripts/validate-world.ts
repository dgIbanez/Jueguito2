/**
 * Checks data/ for broken references, dead-end openings and progression
 * locks. Runs in CI before every deploy: `npm run validate`.
 */
import { readFileSync } from 'node:fs';
import type { Content } from '../src/content/types.ts';
import { parseWorld, type LdtkProject } from '../src/world/ldtk.ts';
import { validateWorld } from '../src/world/validate.ts';

const read = (file: string): unknown => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));

const content = {
  world: parseWorld(read('world.ldtk') as LdtkProject),
  enemies: read('enemies.json'),
  bosses: read('bosses.json'),
  abilities: read('abilities.json'),
  items: read('items.json'),
  spells: read('spells.json'),
  pages: read('pages.json'),
  clues: read('clues.json'),
  scripts: read('scripts.json'),
  story: read('story.json'),
  sfx: read('sfx.json'),
  music: read('music.json'),
  gates: read('gates.json'),
  rigs: read('rigs.json'),
} as Content;

const { errors, warnings } = validateWorld(content);
for (const w of warnings) console.warn(`aviso: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`${content.world.rooms.length} salas · ${errors.length} errores · ${warnings.length} avisos`);
process.exit(errors.length ? 1 : 0);
