import { expect, test, type Page } from '@playwright/test';

/**
 * The Inventory module: fly stocks, crosses, reagents and antibodies as
 * records, and flips due kept as checklist lines that Tasks shows.
 */

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: { inventory: { enabled: true }, tasks: { enabled: true } },
  }),
  'Inventory/Fly stocks/w1118.flystock.yaml': `genotype: w[1118]\nflipEvery: 7\nlastFlipped: ${day(-8)}\n`,
  'Inventory/Fly stocks/elav-GAL4.flystock.yaml': `genotype: elav-GAL4\nflipEvery: 14\nlastFlipped: ${day(-1)}\n`,
  'Inventory/Reagents/PBS.reagent.yaml': 'supplier: Sigma\namount: 500 mL\n',
};

async function file(page: Page, path: string): Promise<string> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? '', path);
}

async function runCommand(page: Page, name: string) {
  await page.keyboard.press('Control+k');
  const list = page.getByRole('dialog', { name: 'Commands' });
  await list.getByRole('textbox', { name: 'Find a command' }).fill(name);
  await list.getByRole('button', { name }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((files) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', files);
    memory.queuePick('C:/Vault');
  }, VAULT);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
});

test('fly stocks show when they are next flipped, and flipping is recorded', async ({ page }) => {
  // The flips page is written from the stocks, soonest first.
  await expect
    .poll(() => file(page, 'Inventory/Flips due.md'))
    .toContain(`- [ ] Flip [[w1118]] 📅 ${day(-1)}\n- [ ] Flip [[elav-GAL4]] 📅 ${day(13)}`);

  await runCommand(page, 'Open inventory');
  const stocks = page.getByRole('region', { name: 'Fly stocks' });
  const row = stocks.getByRole('row', { name: /w1118/ });
  await expect(row.locator('.flip-due.late')).toHaveCount(1);
  await row.getByRole('button', { name: 'Flipped today' }).click();
  await expect
    .poll(() => file(page, 'Inventory/Fly stocks/w1118.flystock.yaml'))
    .toContain(`lastFlipped: ${day(0)}`);
  await expect.poll(() => file(page, 'Inventory/Flips due.md')).toContain(`[[w1118]] 📅 ${day(7)}`);
  await expect(row.locator('.flip-due.late')).toHaveCount(0);
});

test('a flip ticked as a task is recorded on its stock', async ({ page }) => {
  await expect.poll(() => file(page, 'Inventory/Flips due.md')).toContain('[[w1118]]');
  await runCommand(page, 'Open tasks');
  const list = page.getByRole('list', { name: 'Tasks' });
  await list.getByRole('checkbox', { name: 'Flip w1118' }).click();
  await expect
    .poll(() => file(page, 'Inventory/Fly stocks/w1118.flystock.yaml'))
    .toContain(`lastFlipped: ${day(0)}`);
  await expect
    .poll(() => file(page, 'Inventory/Flips due.md'))
    .toContain(`- [ ] Flip [[w1118]] 📅 ${day(7)}`);
});

test('a new reagent is made, and its details saved as they are typed', async ({ page }) => {
  await runCommand(page, 'Open inventory');
  await page.getByRole('tab', { name: 'Reagents' }).click();
  const reagents = page.getByRole('region', { name: 'Reagents' });
  await expect(reagents.getByRole('row', { name: /PBS/ })).toContainText('Sigma');
  await reagents.getByRole('button', { name: 'New reagent' }).click();
  const dialog = page.getByRole('dialog', { name: 'New reagent' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Tris');
  await dialog.getByRole('button', { name: /OK|Create|Save/ }).click();
  await page.getByLabel('Supplier').fill('Fisher');
  await page.getByLabel('Where it is').click();
  await expect
    .poll(() => file(page, 'Inventory/Reagents/Tris.reagent.yaml'))
    .toContain('supplier: Fisher');
});
