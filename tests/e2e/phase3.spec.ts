import { expect, test, type Page } from '@playwright/test';
import { clickInto } from './helpers';

/**
 * Phase 3 exit check, end to end in a browser: daily pages with citations
 * from the Zotero library (a Better CSL JSON file in the vault), and their
 * literature notes.
 */

const LIBRARY = JSON.stringify([
  {
    id: 'smith2024',
    title: 'Tau spreads in the fly brain',
    author: [
      { family: 'Smith', given: 'Alice' },
      { family: 'Lee', given: 'Bo' },
      { family: 'Okafor', given: 'Chi' },
    ],
    issued: { 'date-parts': [[2024]] },
    'container-title': 'Neuron',
  },
  {
    id: 'lee2023',
    title: 'Climbing assays revisited',
    author: [{ family: 'Lee', given: 'Bo' }],
    issued: { 'date-parts': [[2023]] },
  },
]);

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: { references: { enabled: true }, 'lab-notebook': { enabled: true } },
  }),
  'references/library.json': LIBRARY,
  'Lab/Notes.md': 'Bench notes.\n',
};

const editor = (page: Page) => page.locator('.page-editor');
const title = (page: Page) => page.getByRole('textbox', { name: 'Page title' });

async function file(page: Page, path: string): Promise<string> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? '', path);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 23, 9, 15));
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

test('a daily page cites the Zotero library, and the citation leads to its note', async ({
  page,
}) => {
  await page.keyboard.press('Control+Shift+D');
  await expect(title(page)).toHaveValue('2026-10-23');
  await clickInto(editor(page).locator('h1'));
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Tau spreads, as shown ');
  await page.keyboard.type('[@smi');
  const menu = page.getByRole('listbox', { name: 'Cite' });
  await expect(menu.getByRole('option').first()).toContainText('Smith et al. 2024');
  await page.keyboard.press('Enter');

  const chip = editor(page).locator('.citation');
  await expect(chip).toHaveText('Smith et al. 2024');
  await expect(chip).toHaveAttribute('title', /Tau spreads in the fly brain/);
  await expect
    .poll(() => file(page, 'Daily/2026-10/2026-10-23.md'))
    .toContain('Tau spreads, as shown [@smith2024]');

  // A citation typed out in full becomes a chip too.
  await page.keyboard.type('and [@lee2023]');
  await expect(chip.nth(1)).toHaveText('Lee 2023');

  // Clicking a citation opens its literature note, made from the library.
  await chip.first().click();
  await expect(title(page)).toHaveValue('smith2024');
  await expect(
    editor(page).getByRole('heading', { name: 'Tau spreads in the fly brain' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Properties' })).toContainText('Literature note');
  await expect(page.getByRole('region', { name: 'Linked from' })).toContainText('2026-10-23');
  const note = await file(page, 'references/smith2024.md');
  expect(note).toContain('type: reference');
  expect(note).toContain('citekey: smith2024');
  expect(note).toContain('Smith, Alice');
});

test('citations of works not in the library look faded', async ({ page }) => {
  await page.evaluate(() =>
    window.__benchworkMemory?.externalWrite('Lab/Notes.md', 'See [@nobody1999].\n'),
  );
  await page.getByRole('treeitem', { name: 'Lab' }).click();
  await page.getByRole('treeitem', { name: 'Notes' }).click();
  await expect(editor(page).locator('.citation.unknown')).toHaveText('@nobody1999');
});

test('the References settings show the library', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  await expect(page.getByText('references/library.json')).toBeVisible();
  await expect(page.getByText(/^2 references, last changed /)).toBeVisible();
});
