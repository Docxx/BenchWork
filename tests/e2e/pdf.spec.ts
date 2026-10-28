import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Reading a PDF with the Handwriting module: text highlighted and ink
 * written on pages, kept beside the PDF, which is never changed.
 */

const PDF = readFileSync(new URL('./fixtures/paper.pdf', import.meta.url), 'latin1');
const NOTES = 'Papers/paper.pdf.annot.json';

async function file(page: Page, path: string): Promise<string> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? '', path);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((pdf) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { handwriting: { enabled: true } },
      }),
      'Papers/paper.pdf': pdf,
    });
    memory.queuePick('C:/Vault');
  }, PDF);
  await page.getByRole('button', { name: 'Open vault' }).click();
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Papers' }).click();
  await tree.getByRole('treeitem', { name: 'paper.pdf' }).click();
  await expect(page.getByRole('group', { name: 'Page 1' })).toBeVisible();
  await expect(page.locator('.pdf-text').first()).toContainText('Tau spreads');
});

test('a PDF opens with its pages, and text chosen on a page is highlighted', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'Pages' }).getByRole('button')).toHaveCount(2);
  // Choose the first line of text, as dragging over it would.
  await page.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-text span')].find((s) =>
      s.textContent.includes('Tau spreads'),
    );
    if (!span?.firstChild) throw new Error('No text');
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  const highlight = page.getByRole('img', { name: /^Highlight: Tau spreads/ });
  await expect(highlight).toHaveCount(1);
  await expect.poll(() => file(page, NOTES)).toContain('"text":"Tau spreads in the fly brain"');

  // Clicking highlighted text chooses the highlight.
  const at = await highlight.boundingBox();
  if (!at) throw new Error('No highlight');
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
  await page.getByRole('button', { name: 'Remove highlight' }).click();
  await expect.poll(() => file(page, NOTES)).toContain('"pages": {}');
  expect(await file(page, 'Papers/paper.pdf')).toBe(PDF);
});

test('ink written on a page is kept beside the PDF, and stays put at another zoom', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Write on pages' }).click();
  const box = await page.getByRole('group', { name: 'Page 1' }).boundingBox();
  if (!box) throw new Error('No page');
  await page.mouse.move(box.x + 100, box.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(box.x + 100 + i * 15, box.y + 300);
  await page.mouse.up();
  await expect.poll(() => file(page, NOTES)).toMatch(/"1": \{\s+"strokes": \[\s+\{"id"/);
  // Stored in PDF points: the same however wide the page is shown.
  const before = JSON.parse(await file(page, NOTES)) as {
    pages: Record<string, { strokes: { points: number[][] }[] }>;
  };
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(JSON.parse(await file(page, NOTES))).toEqual(before);
  const x = before.pages['1']?.strokes[0]?.points[0]?.[0] ?? 0;
  expect(x).toBeGreaterThan(0);
  expect(x).toBeLessThan(612);
});
