import abilities from '../../data/abilities.json';
import bosses from '../../data/bosses.json';
import clues from '../../data/clues.json';
import enemies from '../../data/enemies.json';
import items from '../../data/items.json';
import pages from '../../data/pages.json';
import rigs from '../../data/rigs.json';
import scripts from '../../data/scripts.json';
import spells from '../../data/spells.json';
import story from '../../data/story.json';
import worldSource from '../../data/world.ldtk?raw';
import { parseWorld, type LdtkProject } from '../world/ldtk.ts';
import type { Content } from './types.ts';

/** Builds the game content from the files in data/. */
export function loadContent(): Content {
  return {
    world: parseWorld(JSON.parse(worldSource) as LdtkProject),
    enemies: enemies as Content['enemies'],
    bosses: bosses as Content['bosses'],
    abilities,
    items,
    spells: spells as unknown as Content['spells'],
    pages: pages as Content['pages'],
    clues,
    scripts,
    story,
    rigs: rigs as unknown as Content['rigs'],
  };
}
