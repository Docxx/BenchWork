import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** Word documents open in BenchWork, laid out as Word shows them, and in Word itself. */

// Base64, as the in-memory vault would store a string as UTF-8 and spoil it.
const DOCX = readFileSync(new URL('./fixtures/protocol.docx', import.meta.url)).toString('base64');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({ version: 1 }),
      'Protocols/~$imbing.docx': 'lock',
    });
    memory.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await window.__benchworkMemory?.writeBytes('Protocols/Climbing.docx', bytes);
  }, DOCX);
  await page.getByRole('button', { name: 'Refresh' }).click();
});

test('a Word document shows its pages, text and table, and opens in Word', async ({ page }) => {
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Protocols' }).click();
  // Word's lock file stays out of the sidebar.
  await expect(tree.getByRole('treeitem', { name: '~$imbing.docx' })).toHaveCount(0);
  await tree.getByRole('treeitem', { name: 'Climbing.docx' }).click();

  const doc = page.getByLabel('Document');
  await expect(doc.locator('section.docx')).toHaveCount(1);
  await expect(doc).toContainText('Climbing assay protocol');
  await expect(doc.locator('i, em, span').filter({ hasText: 'ten seconds' }).first()).toBeVisible();
  await expect(doc.locator('table td')).toContainText(['Day', 'Height (cm)', '7', '4.2']);
  await expect(page.getByText('Word document', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Open in Word' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__benchworkMemory?.openedFiles ?? []))
    .toEqual(['Protocols/Climbing.docx']);
});
