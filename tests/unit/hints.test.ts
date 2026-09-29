import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/config.ts';
import { idleIntent } from '../../src/entities/player.ts';
import type { Game } from '../../src/game/game.ts';
import { playing, run, stand } from './helpers.ts';

function toasts(game: Game): string[] {
  const seen: string[] = [];
  game.events.on('toast', (t) => seen.push(t));
  return seen;
}

/** Next to the throne thorns, facing them. */
function atThorns() {
  const setup = playing();
  stand(setup.game, 'Trono', 100);
  setup.game.player.face = 1;
  return setup;
}

describe('obstacle hints', () => {
  it('the sword glances off the thorns with a hint, only the first time', () => {
    const { game } = atThorns();
    const seen = toasts(game);
    game.tick(STEP, { ...idleIntent(), attackPressed: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('esperaran una chispa');
    run(game, 30);
    game.tick(STEP, { ...idleIntent(), attackPressed: true });
    expect(seen).toHaveLength(1);
    expect(game.progress.flags.has('gate:thorns_throne')).toBe(false);
  });

  it('a spell that does not fit also gets the hint', () => {
    const { game } = atThorns();
    const seen = toasts(game);
    game.learnSpell('escarcha');
    seen.length = 0;
    game.tick(STEP, { ...idleIntent(), castSlot: 1 });
    run(game, 10);
    expect(seen.some((t) => t.includes('esperaran una chispa'))).toBe(true);
    expect(game.progress.flags.has('gate:thorns_throne')).toBe(false);
  });

  it('a downward strike bounces off the sealed slab', () => {
    const { game } = playing();
    stand(game, 'Trono', 460);
    game.enemies = [];
    Object.assign(game.player, { y: 420, vy: 100, ground: false });
    game.tick(STEP, { ...idleIntent(), down: true, attackPressed: true });
    expect(game.player.vy).toBeLessThan(0);
  });

  it('learning Ascua recalls the thorns already seen', () => {
    const { game } = playing();
    stand(game, 'Trono', 100);
    const seen = toasts(game);
    game.learnSpell('ascua');
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain('Las zarzas secas del trono');
  });

  it('there is nothing to recall before seeing the obstacle, or once it is open', () => {
    const { game } = playing();
    const seen = toasts(game);
    game.learnSpell('ascua');
    expect(seen).toHaveLength(1);

    const other = playing().game;
    stand(other, 'Trono', 100);
    other.progress.flags.add('gate:thorns_throne');
    const later = toasts(other);
    other.learnSpell('ascua');
    expect(later).toHaveLength(1);
  });

  it('learning Céfiro recalls the crystal veil', () => {
    const { game } = playing();
    game.progress.flags.add('boss:groth');
    stand(game, 'Grieta', 400, 648);
    const seen = toasts(game);
    game.learnSpell('cefiro');
    expect(seen[1]).toContain('velo de cristal');
  });
});
