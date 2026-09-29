import { PLAYER } from '../config.ts';
import type { BossDef } from '../content/types.ts';
import type { Sound } from '../core/audio.ts';
import { ACTIONS, RESERVED, SPELL_ACTIONS, type Action, type Input } from '../core/input.ts';
import type { KeyValueStorage } from '../core/save.ts';
import { defaultBindings, saveSettings, type Settings } from '../core/settings.ts';
import type { Game, Mode } from '../game/game.ts';
import { carved, type CipherKey } from '../magic/ciphers.ts';
import { cipherHtml, startingKey } from './cipherTool.ts';
import { $, esc, focusables } from './dom.ts';
import { defaultPage, grimoireHtml, notesHtml } from './grimoire.ts';
import { mapHtml } from './mapView.ts';
import { shrineHtml } from './shrine.ts';

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const OVERLAY_MODES: Mode[] = ['journal', 'cipher', 'map', 'reading', 'shrine', 'prologue'];

/** DOM layer: menus, grimoire, research tools, map, HUD and notifications. */
export class Ui {
  private readonly overlay = $('#overlay')!;
  private readonly toastEl = $('#toast')!;
  private toastTimer = 0;
  private hudCache = '';
  private rebinding: Action | null = null;
  private rebindBack: () => void = () => this.resume();
  private selectedPage = '';
  private cipherKey: CipherKey = {};
  private cipherFrom: 'world' | 'grimoire' = 'world';
  private readonly game: Game;
  private readonly input: Input;
  private readonly settings: Settings;
  private readonly sound: Sound;
  private readonly storage: KeyValueStorage | null;
  private readonly canvas: HTMLCanvasElement;

  constructor(game: Game, input: Input, settings: Settings, sound: Sound, storage: KeyValueStorage | null, canvas: HTMLCanvasElement) {
    this.game = game;
    this.input = input;
    this.settings = settings;
    this.sound = sound;
    this.storage = storage;
    this.canvas = canvas;
    game.events.on('toast', (text) => this.toast(text));
    game.events.on('sound', ({ freq, duration, type }) => sound.beep(freq, duration, type));
    game.events.on('room', (room) => {
      $('#zone')!.textContent = room.name;
      $('#region')!.textContent = room.biome === 'caves' ? 'CAVERNAS DEL ECO' : 'BOSQUE DE LAS RUNAS ROTAS';
      this.hideToast();
    });
    game.events.on('dead', () => this.death());
    game.events.on('victory', (def) => this.victory(def));
    game.events.on('openPage', (id) => this.research(id, 'world'));
    game.events.on('readClue', (id) => this.clue(id));
    game.events.on('shrine', () => this.shrine());
  }

  // ------------------------------------------------------------ helpers

  /** Replaces {action} placeholders with the current key bindings. */
  keys(text: string): string {
    return text.replace(/\{(\w+)\}/g, (_, action: string) => (action in this.input.bindings ? this.input.label(action as Action) : action));
  }

  private panel(html: string, extraClass = '', focus = true): void {
    this.overlay.innerHTML = `<div class="panel ${extraClass}">${html}</div>`;
    if (focus) this.overlay.querySelector<HTMLElement>('button, input')?.focus();
  }

  private on(selector: string, handler: () => void): void {
    const el = $(selector, this.overlay);
    if (el) el.onclick = handler;
  }

  toast(text: string): void {
    this.toastEl.textContent = this.keys(text);
    this.toastEl.classList.add('show');
    this.toastTimer = 5;
  }

  private hideToast(): void {
    this.toastTimer = 0;
    this.toastEl.classList.remove('show');
  }

  resume(): void {
    this.game.mode = 'play';
    this.overlay.innerHTML = '';
    this.input.clear();
    this.canvas.focus();
  }

  private bindOptions(): void {
    const sound = $('#sound', this.overlay);
    if (sound) {
      sound.textContent = `SONIDO: ${this.settings.sound ? 'ON' : 'OFF'}`;
      sound.onclick = () => {
        this.settings.sound = this.sound.enabled = !this.settings.sound;
        saveSettings(this.storage, this.settings);
        sound.textContent = `SONIDO: ${this.settings.sound ? 'ON' : 'OFF'}`;
        this.sound.beep(650);
      };
    }
    this.on('#fullscreen', () => void this.toggleFullscreen());
  }

  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      this.toast('Usá F11 para activar la pantalla completa del navegador.');
    }
  }

  // ------------------------------------------------------------ screens

  title(): void {
    this.game.mode = 'title';
    $('#hud')!.hidden = true;
    $('#bossbar')!.hidden = true;
    const saved = this.game.store.hasSave();
    this.panel(`<div class="eyebrow">UNA AVENTURA DE ESPADA Y CONOCIMIENTO</div><h1>RUNAS<br>ROTAS</h1><div class="subtitle">EL BOSQUE OLVIDADO</div><div class="ornament">─ ◇ ─</div>
<p>Bajo las raíces duerme un lenguaje perdido.<br>Encontrá sus páginas. Despertá su magia.</p>
<button class="primary" id="start">${saved ? 'CONTINUAR EL VIAJE' : 'ENTRAR AL BOSQUE'} →</button>${saved ? '<button class="secondary" id="new">NUEVA PARTIDA</button>' : ''}
<div class="menu-options"><button class="secondary" id="help">CONTROLES</button><button class="secondary" id="sound"></button><button class="secondary" id="fullscreen">F · PANTALLA COMPLETA</button></div>
<p class="keys">↑ ↓ / TAB · ELEGIR &nbsp; ENTER · CONFIRMAR</p><p class="credits">CAPÍTULOS I–II · VERSIÓN 3.0 · SOLO TECLADO</p>`);
    this.bindOptions();
    this.on('#help', () => this.help());
    this.on('#start', () => this.start(false));
    this.on('#new', () => {
      this.panel('<h2>Un nuevo viaje</h2><p>Se reemplazará el progreso guardado de este navegador.</p><button id="confirm" class="primary">COMENZAR DE NUEVO</button><button id="back" class="secondary">VOLVER</button>');
      this.on('#confirm', () => this.start(true));
      this.on('#back', () => this.title());
    });
  }

  private start(fresh: boolean): void {
    const newJourney = fresh || !this.game.store.hasSave();
    if (fresh) this.game.newGame();
    else this.game.continueGame();
    $('#hud')!.hidden = false;
    if (newJourney) this.prologue();
    else this.resume();
  }

  /** The summoning, told once at the start of a new journey. */
  private prologue(): void {
    const { eyebrow, title, paragraphs } = this.game.content.story.prologue;
    this.game.mode = 'prologue';
    this.panel(`<div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2>${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}<div class="ornament">─ ◇ ─</div><button class="primary" id="begin">DESPERTAR</button>`, 'prologue-panel');
    this.on('#begin', () => this.resume());
  }

  /** Resting at a shrine: equip, upgrade and fuse spells. */
  private shrine(focus?: string): void {
    this.game.mode = 'shrine';
    this.panel(shrineHtml(this.game, this.input), 'shrine-panel', !focus);
    if (focus) {
      const target = $<HTMLButtonElement>(focus, this.overlay);
      (target && !target.disabled ? target : this.overlay.querySelector<HTMLElement>('#back'))?.focus();
    }
    this.on('#back', () => this.resume());
    const act = (attr: string, run: (id: string) => boolean) => {
      for (const button of this.overlay.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`)) {
        const id = button.dataset[attr]!;
        button.onclick = () => {
          run(id);
          // Keep keyboard focus on the same spell's row after re-rendering.
          this.shrine(`[data-${attr === 'equip' ? 'unequip' : attr === 'unequip' ? 'equip' : attr}="${id}"]`);
        };
      }
    };
    act('equip', (id) => this.game.equipSpell(id));
    act('unequip', (id) => this.game.unequipSpell(id));
    act('upgrade', (id) => this.game.upgradeSpell(id));
    act('fuse', (id) => this.game.fuseSpells(id));
  }

  help(): void {
    const from = this.game.mode;
    if (from !== 'play' && from !== 'title' && from !== 'pause') return;
    this.game.mode = 'pause';
    const k = (a: Action) => esc(this.input.label(a));
    this.panel(`<div class="eyebrow">UN RESPIRO ENTRE LAS RAÍCES</div><h2>El bosque puede esperar</h2>
<p>${k('left')} / ${k('right')} · Moverse &nbsp; ${k('jump')} · Saltar (mantener para más altura)<br>${k('attack')} · Espada &nbsp; ${k('down')} + ${k('attack')} en el aire · Golpe descendente<br>${k('down')} + ${k('jump')} · Bajar de una plataforma &nbsp; ${k('dash')} · Impulso<br>${SPELL_ACTIONS.map(k).join(' / ')} · Magias equipadas &nbsp; ${k('interact')} · Interactuar<br>${k('grimoire')} · Grimorio &nbsp; ${k('map')} · Mapa &nbsp; Esc · Pausa</p>
<p>La espada restaura magia al acertar. El golpe descendente rebota sobre enemigos y zarzas. Los santuarios curan, guardan y permiten preparar, mejorar y fusionar tus magias.</p>
<button class="primary" id="back">VOLVER</button><div class="menu-options"><button class="secondary" id="controls">REASIGNAR TECLAS</button><button class="secondary" id="sound"></button><button class="secondary" id="fullscreen">F · PANTALLA COMPLETA</button></div>`);
    this.bindOptions();
    const back = from === 'title' ? () => this.title() : () => this.resume();
    this.on('#back', back);
    this.on('#controls', () => this.controls(back));
  }

  /** Rebinding: pick an action, then press the new key. */
  controls(back: () => void, focusAction?: Action): void {
    this.game.mode = 'pause';
    const rows = ACTIONS.map(
      ({ id, label }) =>
        `<div class="bind-row"><span>${esc(label)}</span><button class="secondary bind" data-action="${id}">${this.rebinding === id ? 'PRESIONÁ UNA TECLA…' : esc(this.input.label(id))}</button></div>`,
    ).join('');
    this.panel(`<div class="eyebrow">CONTROLES</div><h2>Tus teclas</h2><div class="bindings">${rows}</div><p class="keys">ENTER · CAMBIAR &nbsp; ESC · CANCELAR &nbsp; ESC, F Y ENTER ESTÁN RESERVADAS</p><button class="secondary" id="reset">RESTAURAR</button><button class="primary" id="back">VOLVER</button>`);
    for (const button of this.overlay.querySelectorAll<HTMLButtonElement>('.bind')) {
      button.onclick = () => {
        this.rebinding = button.dataset.action as Action;
        this.controls(back, this.rebinding);
      };
    }
    this.on('#reset', () => {
      this.input.bindings = this.settings.bindings = defaultBindings();
      saveSettings(this.storage, this.settings);
      this.controls(back);
    });
    this.on('#back', () => {
      this.rebinding = null;
      back();
    });
    if (focusAction) $<HTMLElement>(`.bind[data-action="${focusAction}"]`, this.overlay)?.focus();
    this.rebindBack = back;
  }

  private finishRebind(code: string | null): void {
    const action = this.rebinding!;
    this.rebinding = null;
    if (code && !RESERVED.has(code)) {
      for (const keys of Object.values(this.input.bindings)) {
        const i = keys.indexOf(code);
        if (i >= 0) keys.splice(i, 1);
      }
      this.input.bindings[action] = [code];
      this.settings.bindings = this.input.bindings;
      saveSettings(this.storage, this.settings);
    }
    this.controls(this.rebindBack, action);
  }

  journal(): void {
    if (this.game.mode !== 'play' && this.game.mode !== 'journal' && this.game.mode !== 'cipher') return;
    this.game.mode = 'journal';
    if (!this.game.progress.items.has('grimoire')) {
      this.panel(notesHtml(this.game, this.input));
      this.on('#back', () => this.resume());
      return;
    }
    if (!this.game.page(this.selectedPage)) this.selectedPage = defaultPage(this.game);
    this.panel(grimoireHtml(this.game, this.input, this.selectedPage), 'book-panel');
    this.on('#back', () => this.resume());
    this.on('#research', () => this.research(this.selectedPage, 'grimoire'));
    for (const link of this.overlay.querySelectorAll<HTMLButtonElement>('.page-link')) {
      link.onclick = () => {
        this.selectedPage = link.dataset.page ?? '';
        this.journal();
        $<HTMLElement>(`.page-link[data-page="${this.selectedPage}"]`, this.overlay)?.focus();
      };
    }
  }

  openGrimoireAt(pageId: string): void {
    this.selectedPage = pageId;
    this.journal();
  }

  research(pageId: string, from: 'world' | 'grimoire'): void {
    const page = this.game.page(pageId);
    if (!page) return;
    this.cipherFrom = from;
    this.selectedPage = pageId;
    this.cipherKey = startingKey(this.game, page);
    this.renderCipher();
  }

  private renderCipher(focus?: string): void {
    const page = this.game.page(this.selectedPage)!;
    this.game.mode = 'cipher';
    this.panel(cipherHtml(this.game, page, this.cipherKey), 'cipher-panel', !focus);
    if (focus) $<HTMLElement>(focus, this.overlay)?.focus();
    const key = this.cipherKey;
    this.on('#minus', () => {
      key.shift = ((key.shift ?? 0) + 25) % 26;
      this.renderCipher('#minus');
    });
    this.on('#plus', () => {
      key.shift = ((key.shift ?? 0) + 1) % 26;
      this.renderCipher('#plus');
    });
    this.on('#mirror', () => {
      key.mirror = !key.mirror;
      this.renderCipher('#mirror');
    });
    const refresh = () => {
      $('.decoded', this.overlay)!.textContent = this.game.readPage(page, key);
      const sig = $('.signature', this.overlay);
      if (sig && page.signature) sig.textContent = `— ${this.game.readPage(page, key, page.signature)}`;
      $('#feedback', this.overlay)!.textContent = '';
    };
    const word = $<HTMLInputElement>('#keyword', this.overlay);
    if (word)
      word.oninput = () => {
        key.word = word.value;
        refresh();
      };
    for (const box of this.overlay.querySelectorAll<HTMLInputElement>('input[data-glyph]')) {
      box.oninput = () => {
        box.value = box.value.toUpperCase().replace(/[^A-ZÑ]/g, '');
        key.map = { ...key.map, [box.dataset.glyph!]: box.value };
        refresh();
        if (box.value) {
          const boxes = [...this.overlay.querySelectorAll<HTMLInputElement>('input[data-glyph]')];
          boxes[boxes.indexOf(box) + 1]?.focus();
        }
      };
    }
    this.on('#back', () => this.leaveCipher());
    this.on('#solve', () => {
      if (this.game.solvePage(page.id, { ...key, map: key.map && { ...key.map } })) {
        this.resume();
        return;
      }
      $('#feedback', this.overlay)!.textContent = page.failHint;
    });
  }

  private leaveCipher(): void {
    if (this.cipherFrom === 'grimoire') this.openGrimoireAt(this.selectedPage);
    else this.resume();
  }

  map(): void {
    if (this.game.mode !== 'play') return;
    if (!this.game.progress.items.has('map')) {
      this.toast('Todavía no tenés un mapa.');
      return;
    }
    this.game.mode = 'map';
    this.panel(mapHtml(this.game), 'map-panel');
    $('#back', this.overlay)!.textContent = `${this.input.label('map')} · GUARDAR MAPA`;
    this.on('#back', () => this.resume());
  }

  private clue(id: string): void {
    const clue = this.game.content.clues.find((c) => c.id === id);
    if (!clue) return;
    this.game.mode = 'reading';
    const note = this.game.progress.items.has('grimoire') ? 'Quedó anotado en el grimorio.' : 'Lo copiás en tus notas. Quizá algún día sirva.';
    const glyphs = clue.script ? `<div class="mural-glyphs">${esc(carved(clue.word, this.game.content.scripts[clue.script]))}</div>` : '';
    this.panel(`<div class="eyebrow">${clue.script ? 'MURAL · SIGNOS ANTIGUOS' : 'INSCRIPCIÓN'}</div><h2>${esc(clue.title)}</h2>${glyphs}<p>${esc(clue.text)}</p><p class="decoded">${esc(clue.word)}</p><p class="book-note">${note}</p><button id="back" class="primary">CONTINUAR</button>`);
    this.on('#back', () => this.resume());
  }

  private death(): void {
    this.panel('<div class="eyebrow">LAS RAÍCES RECUERDAN TUS PASOS</div><h2>La llama no se apaga</h2><p>Conservás tus descubrimientos. Volvé al último santuario y observá las señales antes de atacar.</p><button class="primary" id="retry">VOLVER A INTENTAR</button>');
    this.on('#retry', () => {
      this.game.retry();
      this.resume();
    });
  }

  private victory(def: BossDef): void {
    this.panel(`<div class="eyebrow">${esc(def.victory.eyebrow)}</div><h2>${esc(def.victory.title)}</h2><div class="ornament">─ ᛟ ─</div><p>${def.victory.text}</p><button class="primary" id="explore">SEGUIR EXPLORANDO</button>`);
    this.on('#explore', () => this.resume());
  }

  // ------------------------------------------------------------ keyboard

  onKeyDown(e: KeyboardEvent): void {
    if (this.rebinding) {
      e.preventDefault();
      if (!e.repeat) this.finishRebind(e.code === 'Escape' ? null : e.code);
      return;
    }
    const mode = this.game.mode;
    const typing = e.target instanceof HTMLInputElement;
    if (typing && e.code !== 'Escape' && e.code !== 'Enter') return;
    if (e.code === 'KeyF' && !typing) {
      e.preventDefault();
      if (!e.repeat) void this.toggleFullscreen();
      return;
    }
    if (this.input.matches('map', e.code) && (mode === 'play' || mode === 'map')) {
      e.preventDefault();
      if (!e.repeat) mode === 'map' ? this.resume() : this.map();
      return;
    }
    if (this.input.matches('grimoire', e.code) && (mode === 'play' || (mode === 'journal' && e.code !== 'Tab'))) {
      e.preventDefault();
      if (!e.repeat) mode === 'journal' ? this.resume() : this.journal();
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (mode === 'play') this.help();
      else if (mode === 'cipher') this.leaveCipher();
      else if (OVERLAY_MODES.includes(mode)) this.resume();
      else if (mode === 'pause') $('#back', this.overlay)?.click();
      return;
    }
    if (mode !== 'play') {
      if (ARROWS.includes(e.code) && !typing) {
        e.preventDefault();
        const items = focusables(this.overlay);
        const i = items.indexOf(document.activeElement as HTMLElement);
        const d = e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1;
        items[(i + d + items.length) % items.length]?.focus();
      }
      return;
    }
    if (this.input.isBound(e.code) || ARROWS.includes(e.code) || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    this.input.keyDown(e.code);
  }

  onBlur(): void {
    this.input.clear();
    if (this.game.mode === 'play') this.help();
  }

  // ------------------------------------------------------------ per frame

  frame(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.hideToast();
    }
    if (this.game.mode === 'title') return;
    const { player: p, progress } = this.game;
    const boss = this.game.enemies.find((e) => e.boss && e.hp > 0);
    const mana = progress.spells.size ? '◆'.repeat(Math.max(0, p.mana)) + '◇'.repeat(Math.max(0, PLAYER.maxMana - p.mana)) : '— MAGIA DORMIDA —';
    const spells = progress.loadout
      .map((id, i) => (id ? `${this.input.label(SPELL_ACTIONS[i]).split(' / ')[0]} ${this.game.content.spells[id]?.name ?? id}` : ''))
      .filter(Boolean)
      .join(' · ');
    const hud = `${p.hp}|${mana}|${boss?.hp ?? ''}|${this.input.label('grimoire')}|${this.input.label('map')}|${spells}|${progress.shards}`;
    if (hud === this.hudCache) return;
    this.hudCache = hud;
    $('#health')!.textContent = '♥'.repeat(Math.max(0, p.hp)) + '♡'.repeat(Math.max(0, PLAYER.maxHp - p.hp));
    $('#mana')!.textContent = mana;
    $('#spells')!.textContent = spells.toUpperCase();
    $('#shards')!.textContent = progress.shards ? `${progress.shards} ✦` : '';
    $('#hud-keys')!.innerHTML = `${esc(this.input.label('grimoire').toUpperCase())} · GRIMORIO<br>${esc(this.input.label('map').toUpperCase())} · MAPA<br>ESC · MENÚ`;
    const bar = $('#bossbar')!;
    bar.hidden = !boss;
    if (boss?.boss) {
      $('#boss-name')!.textContent = boss.boss.def.name;
      $<HTMLElement>('#bossbar i')!.style.width = `${Math.max(0, (boss.hp / boss.max) * 100)}%`;
    }
  }
}
