import { expect, test, type Page } from '@playwright/test';

async function appearanceSettings(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Missing memory adapter');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': '{"version":1,"modules":{"lab-tools":{"enabled":true}}}',
      'Research/Notebook.md': '# A place to think\n\nObservations from today’s experiment.\n',
    });
    memory.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.locator('.splash')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
}

for (const [name, preset] of [
  ['Starship bridge', 'bridge'],
  ['Dino park', 'dino'],
  ['Wizarding school', 'wizard'],
] as const) {
  test(`${name} has readable desktop and tablet views`, async ({ page }, testInfo) => {
    await appearanceSettings(page);
    await page.getByText(name, { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-preset', preset);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const home = page.getByRole('article', { name: 'Home' });
    await expect(home.locator('.theme-scene')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${preset}-desktop.png`) });
    await page.setViewportSize({ width: 800, height: 1100 });
    await expect(home.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${preset}-tablet.png`) });
  });
}

test('details, motion and sound are independent and saved on this device', async ({ page }) => {
  await appearanceSettings(page);
  await page.getByText('Starship bridge', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Subtle motion' }).uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  const lights = page.locator('.appearance-preview .scene-lights');
  await expect(lights).toHaveCSS('animation-name', 'none');
  await page.getByRole('checkbox', { name: 'Show theme details' }).uncheck();
  await expect(page.locator('.appearance-preview .theme-scene')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Timer sound' }).selectOption('off');
  await expect(page.getByRole('button', { name: 'Preview sound' })).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => window.__benchworkMemory?.loadAppSettings()))
    .toMatchObject({
      appearance: { preset: 'bridge', decoration: false, motion: false, timerSound: 'off' },
    });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.home-card').first()).toHaveCSS('border-left-width', '1px');
});

test('system reduced motion wins over theme motion and sound previews work', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await appearanceSettings(page);
  await page.getByText('Wizarding school', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Subtle motion' })).toBeChecked();
  await expect(page.locator('.appearance-preview .scene-float')).toHaveCSS(
    'animation-name',
    'none',
  );
  await page.getByRole('button', { name: 'Preview sound' }).click();
  await expect(page.getByRole('status', { name: 'Sound preview' })).toContainText(
    'Preview played.',
  );
  await page.getByRole('combobox', { name: 'Timer sound' }).selectOption('classic');
  await expect
    .poll(() => page.evaluate(() => window.__benchworkMemory?.loadAppSettings()))
    .toMatchObject({ appearance: { preset: 'wizard', timerSound: 'classic' } });
});
