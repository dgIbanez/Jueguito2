import { SPELL_ACTIONS, type Input } from '../core/input.ts';
import type { Game } from '../game/game.ts';
import { canFuse, FUSION_LEVEL, fusionsKnown, levelData, slotCount, slotOf, spellInSlot, upgradeCost } from '../magic/loadout.ts';
import { esc } from './dom.ts';
import { levelDots } from './grimoire.ts';

/** Learned spells: base spells in page order, then fusions. */
function learnedSpells(game: Game): string[] {
  const { content, progress } = game;
  const base = content.pages.map((p) => p.spell).filter((id) => progress.spells.has(id));
  const fused = Object.keys(content.spells).filter((id) => content.spells[id].fusion && progress.spells.has(id));
  return [...new Set([...base, ...fused])];
}

/** Resting screen: equip spells into slots, upgrade them with shards, fuse pairs. */
export function shrineHtml(game: Game, input: Input): string {
  const { content, progress } = game;
  const slots = slotCount(content, progress);
  const slotRow = Array.from({ length: slots }, (_, i) => {
    const id = spellInSlot(progress, i);
    return `<div class="slot${id ? '' : ' empty'}"><small>${esc(input.label(SPELL_ACTIONS[i]))}</small><strong>${esc(id ? content.spells[id].name : 'Vacía')}</strong></div>`;
  }).join('');
  const full = Array.from({ length: slots }, (_, i) => spellInSlot(progress, i)).every(Boolean);

  const rows = learnedSpells(game)
    .map((id) => {
      const spell = content.spells[id];
      const equipped = slotOf(progress, id) >= 0;
      const cost = upgradeCost(content, progress, id);
      const equip = equipped
        ? `<button class="secondary" data-unequip="${id}">QUITAR</button>`
        : `<button class="secondary" data-equip="${id}"${full ? ' disabled' : ''}>${full ? 'SIN RANURAS' : 'EQUIPAR'}</button>`;
      const upgrade =
        cost === null
          ? '<button class="secondary" disabled>NIVEL MÁXIMO</button>'
          : `<button class="secondary" data-upgrade="${id}"${progress.shards < cost ? ' disabled' : ''}>MEJORAR · ${cost} ✦</button>`;
      return `<div class="spell-row${equipped ? ' equipped' : ''}"><div><strong>${esc(spell.name)}</strong> <span class="dots">${levelDots(game, id)}</span><small>${esc(levelData(content, progress, id).summary)}</small></div><div class="actions">${equip}${spell.fusion ? '' : upgrade}</div></div>`;
    })
    .join('');

  const fusions = fusionsKnown(content, progress)
    .map((id) => {
      const spell = content.spells[id];
      const [a, b] = spell.fusion!;
      const ready = canFuse(content, progress, id);
      return `<div class="spell-row fusion"><div><strong>${esc(content.spells[a].name)} + ${esc(content.spells[b].name)} → ${esc(spell.name)}</strong><small>${esc(spell.levels[0].summary)} Requiere ambas en nivel ${FUSION_LEVEL}.</small></div><div class="actions"><button class="secondary" data-fuse="${id}"${ready ? '' : ' disabled'}>FUSIONAR · ${spell.fuseCost ?? 0} ✦</button></div></div>`;
    })
    .join('');

  const body = rows
    ? `<div class="slots">${slotRow}</div><div class="spell-list">${rows}${fusions ? `<small class="list-title">FUSIONES POSIBLES</small>${fusions}` : ''}</div>`
    : '<p>Todavía no aprendiste ninguna magia. Descifrá las páginas del grimorio para despertarla.</p>';
  return `<div class="eyebrow">SANTUARIO · ${esc(game.room.name.toUpperCase())}</div><h2>Preparar magias</h2>
<p class="shrine-status">Salud y magia restauradas · Progreso guardado · <strong>${progress.shards} ✦</strong> esquirlas de maná</p>
${body}
<p class="keys">LAS MAGIAS SOLO SE CAMBIAN DESCANSANDO EN UN SANTUARIO</p>
<button id="back" class="primary">LEVANTARSE</button>`;
}
