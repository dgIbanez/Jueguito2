import type { PageDef } from '../content/types.ts';
import type { Game } from '../game/game.ts';
import { ALPHABET, atbash, caesar, distinctGlyphs, type CipherKey } from '../magic/ciphers.ts';
import { esc } from './dom.ts';

/** The interactive part of the research panel, one per cipher type. */
function toolHtml(game: Game, page: PageDef, key: CipherKey): string {
  switch (page.cipher.type) {
    case 'caesar': {
      const shift = key.shift ?? 0;
      return `<p class="alphabet">${ALPHABET}<br>${caesar(ALPHABET, -shift)}</p><div class="tool"><button id="minus" aria-label="Reducir desplazamiento">−</button><span>DESPLAZAMIENTO: ${shift}</span><button id="plus" aria-label="Aumentar desplazamiento">+</button></div>`;
    }
    case 'atbash':
      return `<p class="alphabet">${ALPHABET}<br>${key.mirror ? atbash(ALPHABET) : ALPHABET}</p><div class="tool"><button id="mirror">ESPEJO: ${key.mirror ? 'SÍ' : 'NO'}</button></div>`;
    case 'vigenere':
      return `<div class="tool"><label>PALABRA CLAVE <input id="keyword" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(key.word ?? '')}"></label></div>`;
    case 'runes': {
      const script = game.content.scripts[page.cipher.script] ?? '';
      const known = game.knownGlyphs(page.cipher.script);
      const glyphs = distinctGlyphs(page.ciphertext + (page.signature ?? ''), script);
      return `<div class="rune-grid">${glyphs
        .map((g) => `<label class="${known[g] ? 'known' : ''}"><span class="glyph">${g}</span><input data-glyph="${g}" maxlength="1" autocomplete="off" spellcheck="false" aria-label="Letra para el signo ${g}" value="${esc(key.map?.[g] ?? '')}"></label>`)
        .join('')}</div><p class="book-note">Los signos copiados de los murales ya están anotados. Escribí una letra en cada casilla.</p>`;
    }
  }
}

/**
 * Sidebar of words the player already earned from murals, so investigating a
 * rune page doesn't require leaving the screen to go check the grimoire.
 * It never reveals a solution the player hasn't read themselves elsewhere:
 * comparing this page's signature against another page's is left to the
 * player's own memory, by visiting that page's grimoire entry.
 */
function referenceHtml(game: Game, current: PageDef): string {
  if (current.cipher.type !== 'runes') return '';
  const script = current.cipher.script;
  const learned = game.content.clues.filter((c) => c.script === script && game.progress.clues.has(c.id));
  if (!learned.length) return '';
  const rows = learned.map((c) => `<li>${esc(c.title)}: <strong>${esc(c.word)}</strong></li>`).join('');
  return `<aside class="cipher-aside"><section><h3>SIGNOS APRENDIDOS</h3><ul>${rows}</ul></section></aside>`;
}

export function cipherHtml(game: Game, page: PageDef, key: CipherKey): string {
  const reading = game.readPage(page, key);
  const signature = page.signature ? game.readPage(page, key, page.signature) : '';
  const aside = referenceHtml(game, page);
  return `<div class="eyebrow">GRIMORIO / PÁGINA ${esc(page.numeral)}</div><h2>${esc(page.title)}</h2>
<div class="cipher-layout${aside ? ' with-aside' : ''}">
  <div class="cipher-main">
    <p><em>${esc(page.note)}</em></p>
    <div class="cipher ${page.cipher.type}">${esc(page.ciphertext)}${page.signature ? `<small>— ${esc(page.signature)}</small>` : ''}</div>
    ${toolHtml(game, page, key)}
    <p class="decoded">${esc(reading)}</p>${signature ? `<p class="signature">— ${esc(signature)}</p>` : ''}
  </div>
  ${aside}
</div>
<button class="primary" id="solve">INSCRIBIR TRADUCCIÓN</button><button class="secondary" id="back">MÁS TARDE</button><p id="feedback" role="status"></p>`;
}

/** Starting key: rune pages come pre-filled with every glyph the clues revealed. */
export function startingKey(game: Game, page: PageDef): CipherKey {
  const saved = game.progress.pages.get(page.id)?.key;
  switch (page.cipher.type) {
    case 'caesar':
      return { shift: saved?.shift ?? 0 };
    case 'atbash':
      return { mirror: saved?.mirror ?? false };
    case 'vigenere':
      return { word: saved?.word ?? '' };
    case 'runes':
      return { map: { ...game.knownGlyphs(page.cipher.script), ...saved?.map } };
  }
}
