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

async function startGame(page: Page) {
  await page.locator('#start').focus();
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
  await expect(page.locator('#sound')).toHaveText(/SONIDO/);
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
  await page.keyboard.press('Tab');
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
  await page.keyboard.press('Tab');
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
  await expect(page.locator('#toast')).toContainText('ASCUA DESBLOQUEADA · K');
  expect(await state(page, 'game.mode')).toBe('play');

  await page.keyboard.press('Tab');
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
  await page.keyboard.press('Tab');
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

test('research sidebar shows earned murals only, never another page\'s signature', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.progress.items.add('grimoire');
    game.progress.pages.set('page_ascua', { solved: false });
    game.progress.pages.set('page_egida', { solved: false });
  });

  // The Caesar page never gets a rune sidebar.
  await page.keyboard.press('Tab');
  await page.locator('.page-link[data-page="page_ascua"]').click();
  await page.locator('#research').click();
  await expect(page.locator('.cipher-aside')).toHaveCount(0);
  for (let i = 0; i < 3; i++) await page.locator('#plus').click();
  await expect(page.locator('.signature')).toHaveText('— IULIN SAERH');
  await page.locator('#solve').click();

  // Deciphering the rune page shows murals already read, but not Ascua's signature:
  // comparing signatures is left to the player's own memory, not auto-solved.
  await page.evaluate(() => (window as any).runas.game.progress.clues.add('mural_runa'));
  await page.keyboard.press('Tab');
  await page.locator('.page-link[data-page="page_egida"]').click();
  await page.locator('#research').click();
  await expect(page.locator('.cipher-aside')).toBeVisible();
  await expect(page.locator('.cipher-aside')).toContainText('RUNA');
  await expect(page.locator('.cipher-aside')).not.toContainText('IULIN SAERH');
  await page.screenshot({ path: 'test-results/screens/cipher-aside.png' });
});

test('a solved page keeps its discovery note and signature in the grimoire', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const { game } = (window as any).runas;
    game.progress.items.add('grimoire');
    game.progress.pages.set('page_ascua', { solved: true, key: { shift: 3 } });
  });
  await page.keyboard.press('Tab');
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
    game.progress.spells.add('ascua');
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
