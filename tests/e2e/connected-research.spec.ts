import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const PDF = readFileSync(new URL('./fixtures/paper.pdf', import.meta.url), 'latin1');
async function files(page: Page) {
  return page.evaluate(() => window.__benchworkMemory?.snapshot() ?? {});
}

test('PDF evidence, an R run and a writing section share durable source links', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.evaluate((pdf) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Memory platform required');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: Object.fromEntries(
          ['handwriting', 'references', 'research', 'analysis', 'manuscript'].map((id) => [
            id,
            { enabled: true },
          ]),
        ),
      }),
      'Papers/paper.pdf': pdf,
      'references/library.json': JSON.stringify([
        {
          id: 'tau2024',
          title: 'Tau spreads',
          author: [{ family: 'Smith' }],
          issued: { 'date-parts': [[2024]] },
        },
      ]),
      'Data/day7.dataset.yaml': 'id: d7\nfiles: [Data/day7.csv]\n',
      'Data/day7.csv': 'x,y\n1,2\n',
      'Scripts/count.R': 'print("count")\n',
      '.benchwork/modules/analysis/scripts.json': JSON.stringify([
        {
          id: 'count',
          name: 'Count',
          program: 'Rscript',
          script: 'Scripts/count.R',
          args: '{script} {files} {output}',
        },
      ]),
    });
    memory.usePrograms(async (run, vault) => {
      if (run.args[0]?.value === '--version')
        return { code: 0, stdout: 'Rscript test runtime', stderr: '', stopped: false };
      await vault.writeTextAtomic(`${run.args[2]?.value ?? ''}/counts.csv`, 'count\n2\n');
      return { code: 0, stdout: 'done', stderr: '', stopped: false };
    });
    memory.queuePick('C:/Vault');
  }, PDF);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page.getByRole('button', { name: 'Analysis', exact: true }).click();
  const run = page.getByRole('region', { name: 'Run a script' });
  await run.getByLabel('Dataset').selectOption('Data/day7.dataset.yaml');
  await run.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(run.getByRole('status')).toContainText('Finished.');
  const snapshot = await files(page);
  const recordPath = Object.keys(snapshot).find((p) => p.endsWith('.analysis.yaml')) ?? '';
  expect(snapshot[recordPath]).toContain('runtime: Rscript test runtime');
  expect(snapshot[recordPath]).toContain('scriptSha256:');
  await page.getByRole('button', { name: 'Reading desk', exact: true }).click();
  await page
    .getByRole('region', { name: 'PDF library' })
    .getByRole('button', { name: /paper.pdf/ })
    .click();
  await expect(page.locator('.pdf-text').first()).toContainText('Tau spreads');
  await page.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-text span')].find((s) =>
      s.textContent.includes('Tau spreads'),
    );
    if (!span) throw new Error('Missing PDF text');
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Structured note', exact: true }).click();
  const capture = page.getByRole('region', { name: 'Capture evidence' });
  await capture.getByLabel('Evidence title').fill('Tau evidence');
  await capture.getByLabel('Citation', { exact: true }).selectOption('tau2024');
  await capture.getByLabel('Your observations').fill('Compare with our day 7 result.');
  await capture.getByRole('button', { name: 'Save evidence note' }).click();
  await expect(page.locator('.page-editor')).toContainText('Compare with our day 7 result.');
  expect((await files(page))['Papers/paper.pdf.annot.json']).toContain('Tau spreads');
  await page.getByRole('button', { name: 'Writing', exact: true }).click();
  await page.getByText('New thesis or paper', { exact: true }).click();
  await page.getByLabel('Manuscript title').fill('Tau paper');
  await page.getByRole('button', { name: 'Create manuscript' }).click();
  await page.getByLabel('New section title').fill('Results');
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.getByRole('button', { name: /1\. Results/ }).click();
  const plan = page.getByRole('region', { name: 'Section plan' });
  await plan.getByLabel('Section aim').fill('Explain the day 7 findings.');
  await plan.getByLabel('Word target').fill('600');
  await plan.getByLabel('Tau evidence', { exact: true }).check();
  await plan
    .getByRole('group', { name: 'Analysis runs', exact: true })
    .getByRole('checkbox')
    .check();
  await plan.getByRole('button', { name: 'Save section plan' }).click();
  await expect(plan.getByRole('status')).toHaveText('Section plan saved.');
  await plan.getByRole('button', { name: 'Tau evidence', exact: true }).click();
  await expect(plan.locator('blockquote')).toContainText('Tau spreads');
  await page.screenshot({ path: testInfo.outputPath('writing-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(plan.getByRole('button', { name: 'Save section plan' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('writing-tablet.png'), fullPage: true });
  await plan.getByRole('button', { name: 'Add citation to section' }).click();
  await expect(plan.getByRole('status')).toHaveText('Citation added to section.');
  const saved = await files(page);
  const section = saved['Writing/Sections/Results.md'] ?? '';
  expect(section).toContain('[[Research/Evidence/Tau evidence.md]]');
  expect(section).toContain(recordPath);
  expect(section).toContain('[@tau2024]');
  expect(saved['Writing/Tau paper.md']).toContain('[[Results]]');
  expect(saved['Writing/Tau paper.md']).not.toContain('Tau evidence');
  expect(saved['Papers/paper.pdf']).toBe(PDF);
  await plan.getByRole('button', { name: 'Open source PDF' }).click();
  await expect(page.locator('.pdf-text').first()).toContainText('Tau spreads');
});

test('a source link opens the requested PDF page', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((pdf) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Memory platform required');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { handwriting: { enabled: true } },
      }),
      'Papers/paper.pdf': pdf,
      'Papers/Source.md': 'Read [[paper.pdf#page=2|the methods page]].\n',
    });
    memory.queuePick('C:/Vault');
  }, PDF);
  await page.getByRole('button', { name: 'Open vault' }).click();
  const tree = page.getByRole('tree', { name: 'Notebooks' });
  await tree.getByRole('treeitem', { name: 'Papers', exact: true }).click();
  await tree.getByRole('treeitem', { name: 'Source', exact: true }).click();
  await page.locator('.page-editor').getByText('the methods page', { exact: true }).click();
  await expect(page.locator('.pdf-page[data-page="2"]')).toBeInViewport();
  await expect(page.locator('.pdf-page[data-page="1"]')).not.toBeInViewport({ ratio: 0.5 });
});
