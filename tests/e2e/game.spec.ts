import { expect, test, type Page } from '@playwright/test';

/** Reads live game state through the ?debug handle. */
const state = <T>(page: Page, fn: string): Promise<T> => page.evaluate(`(() => { const { game, ui, input } = window.runas; return ${fn}; })()`) as Promise<T>;

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?debug');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Starts a new journey and skips the prologue. */
async function startGame(page: Page) {
  await page.locator('#start').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#begin')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page, 'game.mode')).toBe('play');
}

test('title screen works with the keyboard only', async ({ page }) => {
  await expect(page.locator('h1')).toContainText('RUNAS');
  await expect(page.locator('#start')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#help')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#controls')).toBeVisible();
  await expect(page.locator('#audio')).toHaveText('AUDIO');
  await page.keyboard.press('Escape');
  await expect(page.locator('#start')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/title.png' });
});

test('the stage keeps 16:9 inside the window', async ({ page }) => {
  const box = (await page.locator('#game').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.01);
  expect(box.width <= viewport.width + 1 && box.height <= viewport.height + 1).toBe(true);
});

test('the player walks, jumps and changes rooms', async ({ page }) => {
  await startGame(page);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#zone')).toHaveText('El umbral verde');
  const x0 = await state<number>(page, 'game.player.x');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  expect(await state<number>(page, 'game.player.x')).toBeGreaterThan(x0 + 40);
  await page.keyboard.press('Space');
  await expect.poll(() => state<boolean>(page, 'game.player.ground')).toBe(false);
  await page.screenshot({ path: 'test-results/screens/umbral.png' });

  await page.evaluate(() => (window as any).runas.game.enterRoom('Umbral', 900, 448));
  await page.keyboard.down('KeyD');
  await expect.poll(() => state(page, 'game.room.id')).toBe('Sendero');
  await page.keyboard.up('KeyD');
  await expect(page.locator('#zone')).toHaveText('Sendero de los exiliados');
});

test('notes, map pickup and map view', async ({ page }) => {
  await startGame(page);
  await page.keyboard.press('KeyQ');
  await expect(page.locator('#overlay')).toContainText('Notas del viaje');
  await expect(page.locator('#overlay')).not.toContainText('Ascua');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#toast')).toContainText('Todavía no tenés un mapa');

  await page.evaluate(() => (window as any).runas.game.enterRoom('Umbral', 159, 448));
  await page.keyboard.press('KeyE');
  await expect(page.locator('#toast')).toContainText('MAPA RECUPERADO');
  await page.keyboard.press('KeyM');
  await expect(page.locator('.map-room')).toHaveCount(1);
  await expect(page.locator('.map-room.current')).toContainText('El umbral verde');
  await page.screenshot({ path: 'test-results/screens/map.png' });
  await page.keyboard.press('KeyM');
  expect(await state(page, 'game.mode')).toBe('play');
});

test('grimoire research teaches Ascua', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.progress.items.add('grimoire');
    game.progress.pages.set('page_ascua', { solved: false });
  });
  await page.keyboard.press('KeyQ');
  await expect(page.locator('.grimoire')).toBeVisible();
  await expect(page.locator('.right-page')).toContainText('Página ilegible');
  await expect(page.locator('.grimoire')).not.toContainText('Ascua');
  await page.screenshot({ path: 'test-results/screens/grimoire.png' });

  await page.locator('#research').click();
  await expect(page.locator('.cipher')).toContainText('OD OODPD');
  await page.locator('#solve').click();
  await expect(page.locator('#feedback')).toContainText('sigue siendo extraña');
  for (let i = 0; i < 3; i++) await page.locator('#plus').click();
  await expect(page.locator('.decoded')).toHaveText('LA LLAMA ABRE EL CAMINO');
  await expect(page.locator('.signature')).toHaveText('— IULIN SAERH');
  await page.screenshot({ path: 'test-results/screens/cipher-caesar.png' });
  await page.locator('#solve').click();
  await expect(page.locator('#toast')).toContainText('ASCUA DESBLOQUEADA');
  await expect(page.locator('#toast')).toContainText('K para lanzarla');
  expect(await state(page, 'game.mode')).toBe('play');

  await page.keyboard.press('KeyQ');
  await expect(page.locator('.right-page')).toContainText('Ascua');
  await expect(page.locator('.right-page')).toContainText('La llama abre el camino.');
});

test('rune page: murals fill in glyphs and the player deduces the rest', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.progress.items.add('grimoire');
    game.progress.pages.set('page_egida', { solved: false });
    for (const id of ['mural_runa', 'mural_guarda', 'mural_espera']) game.progress.clues.add(id);
  });
  await page.keyboard.press('KeyQ');
  await page.locator('.page-link[data-page="page_egida"]').click();
  await page.locator('#research').click();
  await expect(page.locator('.rune-grid label.known')).toHaveCount(9);
  await expect(page.locator('.decoded')).toHaveText('·A RUNA GUARDA A· ·UE ESPERA');
  const glyphs = await page.locator('.rune-grid input[data-glyph]').evaluateAll((els) => els.filter((e) => !(e as HTMLInputElement).value).map((e) => (e as HTMLInputElement).dataset.glyph));
  expect(glyphs.length).toBeGreaterThanOrEqual(2);
  const script = await state<string>(page, 'game.content.scripts.iulin');
  await page.locator(`input[data-glyph="${script[11]}"]`).fill('L');
  await page.locator(`input[data-glyph="${script[16]}"]`).fill('q');
  await expect(page.locator('.decoded')).toHaveText('LA RUNA GUARDA AL QUE ESPERA');
  await page.screenshot({ path: 'test-results/screens/cipher-runes.png' });
  await page.locator('#solve').click();
  await expect(page.locator('#toast')).toContainText('ÉGIDA DE RUNAS');
});

test('the grimoire only lists pages already found', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => (window as any).runas.game.progress.items.add('grimoire'));
  await page.keyboard.press('KeyQ');
  await expect(page.locator('.page-link')).toHaveCount(0);
  await expect(page.locator('.grimoire')).not.toContainText('III');
  await page.keyboard.press('Escape');

  await page.evaluate(() => (window as any).runas.game.progress.pages.set('page_ascua', { solved: false }));
  await page.keyboard.press('KeyQ');
  await expect(page.locator('.page-link')).toHaveCount(1);
  await expect(page.locator('.page-link')).toHaveText('II · Página ilegible');
  await expect(page.locator('.grimoire')).not.toContainText('Hoja arrancada');
  await page.screenshot({ path: 'test-results/screens/grimoire-one-page.png' });
});

test('the rune research screen has no sidebar', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.progress.items.add('grimoire');
    game.progress.pages.set('page_egida', { solved: false });
    game.progress.clues.add('mural_runa');
  });
  await page.keyboard.press('KeyQ');
  await page.locator('#research').click();
  await expect(page.locator('.rune-grid')).toBeVisible();
  await expect(page.locator('.cipher-aside')).toHaveCount(0);
});

test('a solved page keeps its discovery note and signature in the grimoire', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.progress.items.add('grimoire');
    game.progress.pages.set('page_ascua', { solved: true, key: { shift: 3 } });
  });
  await page.keyboard.press('KeyQ');
  await expect(page.locator('.right-page')).toContainText('Ascua');
  await expect(page.locator('.right-page')).toContainText('Iulin Saerh');
  await expect(page.locator('.right-page')).toContainText('IULIN SAERH');
  await page.screenshot({ path: 'test-results/screens/grimoire-solved-page.png' });
});

test('keys can be rebound and are remembered', async ({ page }) => {
  await startGame(page);
  await page.keyboard.press('Escape');
  await page.locator('#controls').click();
  await page.locator('.bind[data-action="jump"]').click();
  await expect(page.locator('.bind[data-action="jump"]')).toHaveText('PRESIONÁ UNA TECLA…');
  await page.keyboard.press('KeyI');
  await expect(page.locator('.bind[data-action="jump"]')).toHaveText('I');
  await page.screenshot({ path: 'test-results/screens/controls.png' });
  await page.locator('#back').click();
  expect(await state(page, 'game.mode')).toBe('play');
  await page.keyboard.press('KeyI');
  await expect.poll(() => state<boolean>(page, 'game.player.ground')).toBe(false);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('runas-rotas-settings')!).bindings.jump)).toEqual(['KeyI']);
});

test('boss fight renders with the health bar', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.learnSpell('ascua');
    game.enterRoom('Trono', 60, 448);
    game.player.face = 1;
  });
  await page.keyboard.press('KeyK');
  await expect(page.locator('#bossbar')).toBeVisible();
  await expect(page.locator('#boss-name')).toHaveText('GROTH, EL REY GOBLIN');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/screens/boss.png' });
});

test('every room renders', async ({ page }) => {
  await startGame(page);
  const rooms = await state<string[]>(page, 'game.content.world.rooms.map((r) => r.id)');
  for (const id of rooms) {
    await page.evaluate((room) => {
      const { game } = (window as any).runas;
      const r = game.content.world.byId.get(room);
      const start = r.entities.find((e: any) => e.type === 'Shrine' || e.type === 'Ability' || e.type === 'Enemy');
      game.player.inv = 99;
      game.enterRoom(room, start ? start.ax - 9 : r.w / 2, start ? start.ay - 60 : r.h / 2);
    }, id);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `test-results/screens/room-${id}.png` });
  }
});

test('a new journey opens with the summoning prologue', async ({ page }) => {
  await page.locator('#start').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay')).toContainText('Del otro lado del círculo');
  await page.screenshot({ path: 'test-results/screens/prologue.png' });
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page, 'game.mode')).toBe('play');
  // Continuing an existing journey skips it.
  await page.reload();
  await page.locator('#start').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => state(page, 'game.mode')).toBe('play');
});

test('resting at a shrine prepares, upgrades and fuses spells', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    for (const id of ['ascua', 'egida', 'cefiro']) game.learnSpell(id);
    game.progress.shards = 60;
    game.enterRoom('Umbral', 99, 448);
    game.enemies = [];
  });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.shrine-panel')).toBeVisible();
  await expect(page.locator('.slot')).toHaveCount(2);
  await expect(page.locator('[data-equip="cefiro"]')).toBeDisabled();

  await page.locator('[data-unequip="egida"]').click();
  await page.locator('[data-equip="cefiro"]').click();
  await expect(page.locator('.slot').nth(1)).toContainText('Céfiro');

  await page.locator('[data-upgrade="ascua"]').click();
  await page.locator('[data-upgrade="cefiro"]').click();
  await expect(page.locator('[data-fuse="torbellino"]')).toBeEnabled();
  await page.screenshot({ path: 'test-results/screens/shrine.png' });
  await page.locator('[data-fuse="torbellino"]').click();
  await expect(page.locator('.shrine-panel')).toContainText('Torbellino ígneo');

  await page.locator('#back').click();
  expect(await state(page, 'game.mode')).toBe('play');
  await expect(page.locator('#spells')).toContainText('K ASCUA');
  await expect(page.locator('#spells')).toContainText('L CÉFIRO');
});

test('chapter II: the caverns and Vharn render', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.progress.flags.add('boss:groth');
    game.progress.spells.add('escarcha');
    game.progress.loadout = ['escarcha'];
    game.enterRoom('Cavernas', 900, 472);
    game.player.inv = 99;
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/screens/cavernas.png' });
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.enterRoom('Corazon', 200, 448);
    game.player.inv = 99;
    const vharn = game.enemies.find((e: any) => e.boss);
    vharn.boss.move = 'rain';
    Object.assign(vharn, { state: 'wind', timer: 0 });
  });
  await expect(page.locator('#boss-name')).toHaveText('VHARN, EL CENTINELA DE CUARZO');
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/screens/vharn.png' });
});

test('boss rigs animate every attack', async ({ page }) => {
  await startGame(page);
  const shoot = async (room: string, move: string, state: string, progress: number, name: string, phase = 0) => {
    await page.evaluate(
      ({ room, move, state, progress, phase }) => {
        const { game } = (window as any).runas;
        if (game.room.id !== room) {
          game.progress.flags.add('gate:thorns_throne');
          game.enterRoom(room, 120, 448);
        }
        game.player.inv = 99;
        game.enemies = game.enemies.filter((e: any) => e.boss);
        const b = game.enemies[0];
        b.boss.phase = phase;
        b.boss.move = move;
        Object.assign(b, { state, timer: 10 * (1 - progress), face: -1, lock: -1, ground: true, vx: 0 });
        b.boss.span = 10;
        game.mode = 'pause';
      },
      { room, move, state, progress, phase },
    );
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/screens/rig-${name}.png`, clip: { x: 640, y: 380, width: 480, height: 300 } });
  };
  for (const [move, state, t] of [['slash', 'wind', 1], ['slash', 'strike', 0.3], ['throw', 'wind', 1], ['charge', 'strike', 0.5], ['leap', 'wind', 1]] as const)
    await shoot('Trono', move, state, t, `groth-${move}-${state}`);
  await shoot('Trono', 'slash', 'transition', 0.5, 'groth-summon', 1);
  for (const [move, state, t] of [['eruption', 'wind', 1], ['eruption', 'strike', 0.5], ['rain', 'wind', 1], ['beam', 'wind', 1], ['roll', 'strike', 0.3], ['shatter', 'wind', 1]] as const)
    await shoot('Corazon', move, state, t, `vharn-${move}-${state}`);
  await shoot('Corazon', 'beam', 'transition', 0.6, 'vharn-roar', 1);
});

test('hitting the thorns shows the player\'s thought', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.enterRoom('Trono', 100, 448);
    game.player.face = 1;
  });
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#toast')).toHaveClass(/thought/);
  await expect(page.locator('#toast')).toContainText('esperaran una chispa');
  await page.screenshot({ path: 'test-results/screens/thorns-thought.png' });
});

test('audio: music follows the game and volumes are set with the keyboard', async ({ page }) => {
  const track = () => page.evaluate(() => (window as any).runas.audio.playing?.name ?? null);
  // The first key press unlocks audio; the title theme starts.
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => (window as any).runas.audio.ctx?.state)).toBe('running');
  await expect.poll(track).toBe('title');

  await page.locator('#audio').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#overlay')).toContainText('Sonido y música');
  await page.locator('#music-down').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#music-down')).toBeFocused();
  await expect(page.locator('#overlay')).toContainText('50%');
  await page.screenshot({ path: 'test-results/screens/audio.png' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('runas-rotas-settings')!).audio.music)).toBe(0.5);
  await page.locator('#back').click();

  await startGame(page);
  await expect.poll(track).toBe('forest');
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.progress.flags.add('gate:thorns_throne');
    game.enterRoom('Trono', 120, 448);
    game.player.inv = 99;
  });
  await expect.poll(track).toBe('groth');
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(500);
});

test('Q opens the grimoire and Tab never takes focus out of the game', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => (window as any).runas.game.progress.items.add('grimoire'));
  await page.keyboard.press('KeyQ');
  await expect(page.locator('.grimoire')).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#overlay'))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('#overlay'))).toBe(true);
  await page.keyboard.press('KeyQ');
  await expect.poll(() => state(page, 'game.mode')).toBe('play');
  // During play Tab does nothing, and focus stays on the game.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('canvas');
});

test('pantheon: duel a defeated boss and keep the best time', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game, ui } = (window as any).runas;
    game.progress.flags.add('boss:groth');
    game.save();
    ui.title();
  });
  await page.locator('#pantheon').click();
  await expect(page.locator('#overlay')).toContainText('Ecos de batalla');
  await expect(page.locator('[data-duel]')).toHaveCount(1);
  await expect(page.locator('#overlay')).toContainText('???');
  await expect(page.locator('#rush')).toBeDisabled();
  await page.screenshot({ path: 'test-results/screens/pantheon.png' });

  await page.locator('[data-duel="groth"]').click();
  await expect.poll(() => state(page, 'game.room.id')).toBe('Trono');
  await expect(page.locator('#region')).toContainText('PANTEÓN ·');
  await expect(page.locator('#bossbar')).toBeVisible();
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.hitEnemy(game.enemies.find((e: any) => e.boss), 99);
  });
  await expect(page.locator('#overlay')).toContainText('Duelo superado');
  await expect(page.locator('#overlay')).toContainText('¡Nuevo mejor tiempo!');
  await page.screenshot({ path: 'test-results/screens/pantheon-win.png' });
  await page.locator('#leave').click();
  await expect(page.locator('#overlay')).toContainText('Mejor tiempo: 0:');
  // The journey is untouched.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('runas-rotas-save')!).flags)).toEqual(['boss:groth']);
});
