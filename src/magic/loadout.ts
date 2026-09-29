/**
 * Spell loadout rules: which learned spells are equipped, their levels, and
 * fusions. Pure functions over progress, so the rules are testable alone.
 */
import type { Content, SpellDef, SpellLevel } from '../content/types.ts';
import type { Progress } from '../game/progress.ts';

/** Slots available before any seal is found. */
export const BASE_SLOTS = 2;
/** Level both spells need before they can be fused. */
export const FUSION_LEVEL = 2;

export const slotCount = (content: Content, p: Progress): number =>
  BASE_SLOTS + [...p.items].filter((id) => content.items[id]?.spellSlot).length;

export const levelOf = (p: Progress, id: string): number => p.spellLevels.get(id) ?? 1;

export const maxLevel = (spell: SpellDef): number => spell.levels.length;

export function levelData(content: Content, p: Progress, id: string): SpellLevel {
  const spell = content.spells[id];
  return spell.levels[Math.min(levelOf(p, id), maxLevel(spell)) - 1];
}

/** The spell in a slot (0-based), or '' when empty or beyond the loadout. */
export const spellInSlot = (p: Progress, slot: number): string => p.loadout[slot] ?? '';

export const slotOf = (p: Progress, id: string): number => p.loadout.indexOf(id);

/** Equips into the first free slot. False when every slot is taken. */
export function equip(content: Content, p: Progress, id: string): boolean {
  if (!p.spells.has(id) || slotOf(p, id) >= 0) return false;
  const slots = slotCount(content, p);
  for (let i = 0; i < slots; i++) {
    if (spellInSlot(p, i)) continue;
    while (p.loadout.length <= i) p.loadout.push('');
    p.loadout[i] = id;
    return true;
  }
  return false;
}

export function unequip(p: Progress, id: string): boolean {
  const i = slotOf(p, id);
  if (i < 0) return false;
  p.loadout[i] = '';
  return true;
}

/** Shards needed for the next level, or null at the top level. */
export function upgradeCost(content: Content, p: Progress, id: string): number | null {
  const spell = content.spells[id];
  const level = levelOf(p, id);
  if (level >= maxLevel(spell)) return null;
  return spell.upgrade?.[level - 1] ?? null;
}

export function upgrade(content: Content, p: Progress, id: string): boolean {
  const cost = upgradeCost(content, p, id);
  if (!p.spells.has(id) || cost === null || p.shards < cost) return false;
  p.shards -= cost;
  p.spellLevels.set(id, levelOf(p, id) + 1);
  return true;
}

/** Fusions whose two source spells are learned, not yet fused. */
export function fusionsKnown(content: Content, p: Progress): string[] {
  return Object.entries(content.spells)
    .filter(([id, s]) => s.fusion && !p.spells.has(id) && s.fusion.every((src) => p.spells.has(src)))
    .map(([id]) => id);
}

export function canFuse(content: Content, p: Progress, id: string): boolean {
  const spell = content.spells[id];
  if (!spell?.fusion || p.spells.has(id)) return false;
  return spell.fusion.every((src) => p.spells.has(src) && levelOf(p, src) >= FUSION_LEVEL) && p.shards >= (spell.fuseCost ?? 0);
}

export function fuse(content: Content, p: Progress, id: string): boolean {
  if (!canFuse(content, p, id)) return false;
  p.shards -= content.spells[id].fuseCost ?? 0;
  p.spells.add(id);
  return true;
}

/** Learns a spell and equips it if a slot is free; returns the slot or -1. */
export function learn(content: Content, p: Progress, id: string): number {
  p.spells.add(id);
  return equip(content, p, id) ? slotOf(p, id) : -1;
}
