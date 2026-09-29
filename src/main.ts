import './styles.css';
import { AudioEngine } from './audio/engine.ts';
import { chooseTrack } from './audio/music.ts';
import { STEP } from './config.ts';
import { loadContent } from './content/index.ts';
import { Input } from './core/input.ts';
import { browserStorage, SaveStore } from './core/save.ts';
import { loadSettings } from './core/settings.ts';
import { idleIntent } from './entities/player.ts';
import { Game, saveContext } from './game/game.ts';
import { Renderer } from './render/renderer.ts';
import { $ } from './ui/dom.ts';
import { Ui } from './ui/ui.ts';

const content = loadContent();
const storage = browserStorage();
const settings = loadSettings(storage);
const game = new Game(content, new SaveStore(storage, saveContext(content)));
const input = new Input(settings.bindings);
const audio = new AudioEngine(content, settings.audio);
const canvas = $<HTMLCanvasElement>('#canvas')!;
const renderer = new Renderer(canvas.getContext('2d')!, game, input);
const ui = new Ui(game, input, settings, audio, storage, canvas);

// Browsers only start audio after a user gesture.
window.addEventListener('keydown', (e) => {
  audio.unlock();
  ui.onKeyDown(e);
});
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keyup', (e) => input.keyUp(e.code));
window.addEventListener('blur', () => ui.onBlur());

// Fixed-step simulation; rendering runs once per animation frame.
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min(Math.max(0, now - last) / 1000, 0.05);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    if (game.mode === 'play') {
      game.tick(STEP, input.intent());
      input.endStep();
    } else game.tick(STEP, idleIntent());
    acc -= STEP;
  }
  audio.setTrack(chooseTrack(game, content.music));
  ui.frame(dt);
  renderer.draw();
  requestAnimationFrame(frame);
}

ui.title();
requestAnimationFrame(frame);

// Test and debugging handle: available in dev builds or with ?debug in the URL.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) Object.assign(window, { runas: { game, ui, input, audio } });
