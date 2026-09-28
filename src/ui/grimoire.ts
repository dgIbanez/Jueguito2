import type { Action, Input } from '../core/input.ts';
import type { Game } from '../game/game.ts';
import { runesEncode } from '../magic/ciphers.ts';
import { esc, sentence } from './dom.ts';

/** Page shown on the right when the book opens: the first unread, else the first found. */
export function defaultPage(game: Game): string {
  const { pages } = game.progress;
  const found = game.content.pages.filter((p) => pages.has(p.id));
  return (found.find((p) => !pages.get(p.id)?.solved) ?? found[0] ?? game.content.pages[0])?.id ?? '';
}

function rightPage(game: Game, input: Input, pageId: string): { html: string; cls: string; numeral: string } {
  const page = game.page(pageId);
  const state = page && game.progress.pages.get(page.id);
  if (!page || !state)
    return {
      cls: 'missing',
      numeral: '—',
      html: '<small>HUELLAS DE UNA AUSENCIA</small><div class="missing-leaf" aria-hidden="true"></div><h2>Hojas arrancadas</h2><p>Alguien se llevó las palabras.<br>Solo quedaron sus bordes.</p>',
    };
  if (!state.solved)
    return {
      cls: 'restored',
      numeral: page.numeral,
      html: `<small>PÁGINA RECUPERADA · SIN INVESTIGAR</small><h2>Página ilegible</h2><p>El fragmento encaja entre los restos del lomo. Su escritura todavía oculta el significado.</p><div class="book-runes">${esc(page.ciphertext)}</div>${page.signature ? `<p class="book-note">— ${esc(page.signature)}</p>` : ''}<button id="research" class="primary">INVESTIGAR PÁGINA</button>`,
    };
  const spell = game.content.spells[page.spell];
  const slot = spell.slot === 1 ? 'spell1' : 'spell2';
  const stats = spell.stats.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  return {
    cls: 'restored',
    numeral: page.numeral,
    html: `<small>PÁGINA RECUPERADA · TRADUCIDA</small><h2>${esc(spell.name)}</h2><div class="spell-seal" aria-hidden="true">✦</div><blockquote>${esc(sentence(game.readPage(page, state.key ?? {})))}</blockquote><p>${esc(spell.description)}</p><dl><dt>Invocación</dt><dd>${esc(input.label(slot))}</dd>${stats}</dl><p class="book-note">Los golpes de espada que aciertan recuperan magia.</p>`,
  };
}

export function grimoireHtml(game: Game, input: Input, selected: string): string {
  const { progress, content } = game;
  const abilities = [...progress.abilities]
    .map((id) => content.abilities[id])
    .filter(Boolean)
    .map((a) => `<li>${esc(a.name)} · ${esc(input.label(a.action as Action))}</li>`)
    .join('');
  const index = content.pages
    .map((p) => {
      const state = progress.pages.get(p.id);
      const name = !state ? 'Hoja arrancada' : state.solved ? content.spells[p.spell]?.name : 'Página ilegible';
      return `<button class="page-link${p.id === selected ? ' current' : ''}" data-page="${esc(p.id)}">${esc(p.numeral)} · ${esc(name ?? '')}</button>`;
    })
    .join('');
  const clues = content.clues
    .filter((c) => progress.clues.has(c.id))
    .map((c) => `<li><span class="glyphs">${esc(runesEncode(c.word, content.scripts[c.script] ?? ''))}</span> = ${esc(c.word)}</li>`)
    .join('');
  const missing = content.pages.filter((p) => !progress.pages.has(p.id)).length;
  const right = rightPage(game, input, selected);
  return `<div class="eyebrow">EL GRIMORIO DEL ERRANTE</div>
<div class="grimoire" aria-label="Grimorio abierto con páginas arrancadas">
  <article class="book-page left-page">
    <small>MEMORIA DEL CAMINANTE</small><h2>Entre raíces<br>y cenizas</h2>
    <div class="book-seal" aria-hidden="true">ᛟ</div>
    ${abilities ? `<ul class="book-list">${abilities}</ul>` : '<p class="book-note">El cuero conserva las marcas del tiempo. Junto al lomo quedan hilos sueltos y bordes de hojas arrancadas.</p>'}
    <nav class="page-index" aria-label="Páginas">${index}</nav>
    ${clues ? `<small>SIGNOS ANOTADOS</small><ul class="book-list clue-list">${clues}</ul>` : ''}
    <span class="page-number">I</span>
  </article>
  <div class="torn-stubs" aria-hidden="true">${'<i></i>'.repeat(Math.max(1, missing + 2))}</div>
  <article class="book-page right-page ${right.cls}">${right.html}<span class="page-number">${esc(right.numeral)}</span></article>
</div>
<button id="back" class="secondary">CERRAR EL LIBRO</button>`;
}

/** Travel notes shown before the grimoire is found. */
export function notesHtml(game: Game, input: Input): string {
  const { progress, content } = game;
  const lines = [
    ...[...progress.abilities].map((id) => content.abilities[id]).filter(Boolean).map((a) => `${a.name} · ${input.label(a.action as Action)}`),
    ...content.pages.filter((p) => progress.pages.has(p.id)).map(() => 'Página ilegible · Sin investigar'),
    ...(progress.clues.size ? [`Murales copiados: ${progress.clues.size}`] : []),
  ];
  return `<div class="eyebrow">TU VIAJE</div><h2>Notas del viaje</h2><p>${lines.length ? lines.map(esc).join('<br>') : 'Todavía no registraste ningún hallazgo.'}</p><button id="back" class="secondary">VOLVER AL BOSQUE</button>`;
}
