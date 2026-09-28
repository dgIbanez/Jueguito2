import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/index.ts';
import { entitiesOf } from '../../src/world/ldtk.ts';
import { validateWorld } from '../../src/world/validate.ts';
import { playing, run, stand } from './helpers.ts';

describe('world data', () => {
  it('loads every room from the LDtk project', () => {
    const { world } = loadContent();
    expect(world.rooms.map((r) => r.id)).toEqual(expect.arrayContaining(['Umbral', 'Sendero', 'Trono', 'Archivo', 'Copa', 'Vigilia', 'Pozo', 'Nido', 'Galeria']));
    for (const r of world.rooms) expect(r.grid.length).toBe(r.cols * r.rows);
    expect(world.rooms.flatMap((r) => entitiesOf(r, 'PlayerStart'))).toHaveLength(1);
  });

  it('passes validation', () => {
    expect(validateWorld(loadContent()).errors).toEqual([]);
  });

  it('reports broken references', () => {
    const content = loadContent();
    content.world.byId.get('Umbral')!.entities.find((e) => e.type === 'Enemy')!.fields.kind = 'dragon';
    expect(validateWorld(content).errors.join('\n')).toContain('"dragon" no existe');
  });

  it('reports openings that lead nowhere or into a wall', () => {
    const content = loadContent();
    const umbral = content.world.byId.get('Umbral')!;
    umbral.grid[10 * umbral.cols] = 0;
    const trono = content.world.byId.get('Trono')!;
    trono.grid[10 * trono.cols + (trono.cols - 1)] = 0;
    const errors = validateWorld(content).errors.join('\n');
    expect(errors).toContain('Umbral: 1 celda(s) abiertas en el borde izquierda');
    expect(errors).toContain('Trono: la abertura derecha (celda 39,10) choca contra una pared de Pozo');
  });

  it('reports progression locks', () => {
    const content = loadContent();
    content.world.byId.get('Nido')!.requires = ['spell:egida'];
    const errors = validateWorld(content).errors.join('\n');
    expect(errors).toContain('Nido: la sala no se puede alcanzar');
    expect(errors).toContain('Página page_egida');
  });

  it('reports rune pages the clues cannot explain', () => {
    const content = loadContent();
    content.clues = content.clues.filter((c) => c.id !== 'mural_espera');
    expect(validateWorld(content).errors.join('\n')).toContain('no se puede descifrar');
  });

  it('reports a wrong solution hash', () => {
    const content = loadContent();
    content.pages[0] = { ...content.pages[0], solutionHash: '00000000000000' };
    expect(validateWorld(content).errors.join('\n')).toContain('ninguna clave produce');
  });
});

describe('room transitions', () => {
  it('walking off the right edge enters the neighbouring room', () => {
    const { game } = playing();
    stand(game, 'Umbral', 930);
    run(game, 30, { moveX: 1 });
    expect(game.room.id).toBe('Sendero');
    expect(game.player.x).toBeLessThan(100);
  });

  it('jumping through a ceiling opening enters the room above with a boost', () => {
    const { game } = playing();
    stand(game, 'Umbral', 800, 48);
    run(game, 1, { jumpPressed: true, jumpHeld: true });
    run(game, 40, { jumpHeld: true });
    expect(game.room.id).toBe('Archivo');
    run(game, 60, { moveX: -1 });
    expect(game.player.ground).toBe(true);
    expect(game.player.y).toBe(448);
  });

  it('falling through a pit enters the room below', () => {
    const { game } = playing();
    stand(game, 'Copa', 330);
    run(game, 60, { moveX: 1 });
    run(game, 60);
    expect(game.room.id).toBe('Sendero');
  });

  it('a pit without a room below is a hazard', () => {
    const { game } = playing();
    stand(game, 'Umbral', 99);
    const room = game.room;
    game.player.y = room.h + 10;
    run(game, 1);
    expect(game.room.id).toBe('Umbral');
    expect(game.player.hp).toBe(4);
    expect(game.player.y).toBeLessThan(room.h);
  });

  it('records visited rooms', () => {
    const { game } = playing();
    stand(game, 'Sendero', 100);
    expect(game.progress.visited.has('Sendero')).toBe(true);
    expect(game.progress.visited.has('Copa')).toBe(false);
  });
});
