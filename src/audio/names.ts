/** Every sound effect the code can trigger; each one needs a recipe in data/sfx.json. */
export const SFX_NAMES = [
  'jump', 'doubleJump', 'land', 'dash', 'swing', 'pogo', 'enemyHit', 'kill', 'hurt', 'noMana', 'reflect', 'guard',
  'gateBlock', 'gateOpen', 'item', 'ability', 'page', 'shrine', 'solve', 'upgrade', 'fuse',
  'spellFire', 'spellFrost', 'spellVortex', 'spellShield', 'spellWind', 'spellBlizzard', 'learn',
  'bowShot', 'batSwoop', 'bossWind', 'bossStrike', 'slam', 'roar', 'summon', 'crystalRain', 'eruption', 'pillar',
  'beamCharge', 'beam', 'victory', 'death', 'menu',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];
