import type { Intent } from '../entities/player.ts';

export type Action = 'left' | 'right' | 'down' | 'jump' | 'attack' | 'dash' | 'spell1' | 'spell2' | 'interact' | 'grimoire' | 'map';
export type Bindings = Record<Action, string[]>;

export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'left', label: 'Izquierda' },
  { id: 'right', label: 'Derecha' },
  { id: 'down', label: 'Abajo / golpe descendente' },
  { id: 'jump', label: 'Saltar' },
  { id: 'attack', label: 'Espada' },
  { id: 'dash', label: 'Impulso' },
  { id: 'spell1', label: 'Hechizo I' },
  { id: 'spell2', label: 'Hechizo II' },
  { id: 'interact', label: 'Interactuar' },
  { id: 'grimoire', label: 'Grimorio' },
  { id: 'map', label: 'Mapa' },
];

export const DEFAULT_BINDINGS: Bindings = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  attack: ['KeyJ'],
  dash: ['ShiftLeft', 'ShiftRight'],
  spell1: ['KeyK'],
  spell2: ['KeyL'],
  interact: ['KeyE'],
  grimoire: ['Tab'],
  map: ['KeyM'],
};

/** Keys the game never lets the player rebind. */
export const RESERVED = new Set(['Escape', 'KeyF', 'Enter']);

const NAMES: Record<string, string> = {
  Space: 'Espacio',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift der.',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl der.',
  AltLeft: 'Alt',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Tab: 'Tab',
  Backspace: 'Retroceso',
};

export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** Tracks held keys and keys pressed since the last simulation step. */
export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  bindings: Bindings;

  constructor(bindings: Bindings) {
    this.bindings = bindings;
  }

  keyDown(code: string): void {
    if (!this.held.has(code)) this.pressed.add(code);
    this.held.add(code);
  }

  keyUp(code: string): void {
    this.held.delete(code);
  }

  clear(): void {
    this.held.clear();
    this.pressed.clear();
  }

  isHeld(action: Action): boolean {
    return this.bindings[action].some((k) => this.held.has(k));
  }

  wasPressed(action: Action): boolean {
    return this.bindings[action].some((k) => this.pressed.has(k));
  }

  matches(action: Action, code: string): boolean {
    return this.bindings[action].includes(code);
  }

  /** Whether a key belongs to any gameplay action (its default is suppressed). */
  isBound(code: string): boolean {
    return Object.values(this.bindings).some((keys) => keys.includes(code));
  }

  label(action: Action): string {
    return this.bindings[action].map(keyLabel).join(' / ') || '—';
  }

  intent(): Intent {
    return {
      moveX: (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0),
      down: this.isHeld('down'),
      jumpPressed: this.wasPressed('jump'),
      jumpHeld: this.isHeld('jump'),
      attackPressed: this.wasPressed('attack'),
      dashPressed: this.wasPressed('dash'),
      interactPressed: this.wasPressed('interact'),
      castSlot: this.wasPressed('spell1') ? 1 : this.wasPressed('spell2') ? 2 : 0,
    };
  }

  /** Called after each simulation step consumes the presses. */
  endStep(): void {
    this.pressed.clear();
  }
}
