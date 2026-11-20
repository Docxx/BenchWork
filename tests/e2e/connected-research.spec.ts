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
  await page.getByRole('button', { name: 'Reading and writing', exact: true }).click();
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
  await page.getByRole('button', { name: 'Reading and writing', exact: true }).click();
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

test('one reading and writing module downloads, deduplicates and files figure evidence by subject', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const vault = window.__benchworkMemory;
    if (!vault) throw new Error('Memory vault unavailable');
    vault.addFolder('C:/Vault', {
      'references/library.json': JSON.stringify([
        { id: 'figA', title: 'Annotated paper' },
        { id: 'figB', title: 'Follow-up paper' },
      ]),
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { references: { enabled: true }, 'mind-maps': { enabled: true } },
      }),
    });
    vault.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  const desk = page.getByRole('button', { name: 'Reading and writing', exact: true });
  await desk.click();
  const bytes = readFileSync(new URL('./fixtures/paper.pdf', import.meta.url));
  await page.route('https://papers.example/paper.pdf', (route) =>
    route.fulfill({
      contentType: 'application/pdf',
      body: bytes,
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.getByLabel('Direct PDF link').fill('https://papers.example/paper.pdf');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const paper = page
    .getByRole('region', { name: 'PDF library' })
    .getByRole('button', { name: /paper.pdf/ });
  await expect(paper).toHaveCount(1);
  await page
    .getByLabel('Import PDFs', { exact: true })
    .setInputFiles({ name: 'another name.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.getByText('In your library: Papers/paper.pdf', { exact: true })).toBeVisible();
  await expect
    .poll(async () => Object.keys(await files(page)).filter((p) => p.endsWith('.pdf')))
    .toEqual(['Papers/paper.pdf']);
  await paper.click();
  await page.getByRole('radio', { name: 'Select figure' }).click();
  const surface = page.locator('.pdf-figure-selection').first();
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) throw new Error('Missing PDF');
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + box.height / 2 + 75, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Excerpt + comment' })).toBeVisible();
  await desk.click();
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.getByRole('button', { name: 'Add subjects or comment' }).click();
  await page.getByLabel('Subjects (comma-separated)').fill("Alzheimer's, Inflammation");
  await page.getByLabel('Evidence title').fill('Inflammation figure');
  await page.getByLabel('Figure caption').fill('Panel B, tissue section');
  await page.getByLabel('Citation', { exact: true }).selectOption('figA');
  await page.getByLabel('Your observations').fill('Compare this panel with the other paper.');
  await page.getByRole('button', { name: 'Save evidence note' }).click();
  await expect(page.locator('.page-editor')).toContainText('Compare this panel');
  await desk.click();
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.getByRole('combobox', { name: 'Subject', exact: true }).selectOption('inflammation');
  const entry = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Inflammation figure' }) })
    .last();
  await expect(entry).toContainText('Compare this panel');
  await expect(entry.getByRole('img', { name: 'Selected figure' })).toBeVisible();
  await entry.getByRole('button', { name: /Open source/ }).click();
  await expect(page.locator('.pdf-highlight.chosen')).toBeInViewport();
  await expect(page.locator('.pdf-reader')).toHaveCount(1);
  await page.getByRole('button', { name: 'Send to mind map' }).click();
  await page.getByLabel('Map name').fill('Findings');
  await page.getByRole('button', { name: 'Add evidence card' }).click();
  const card = page.locator('.react-flow__node').first();
  await expect(card.getByRole('img', { name: 'Selected figure' })).toBeVisible();
  await card.getByRole('button', { name: /Open PDF/ }).click();
  await expect(page.locator('.pdf-highlight.chosen')).toBeInViewport();
  await desk.click();
  await page
    .getByRole('navigation', { name: 'Reading and writing' })
    .getByRole('button', { name: 'Zotero references' })
    .click();
  await page.getByLabel('Compare Annotated paper').check();
  await page.getByLabel('Compare Follow-up paper').check();
  await page.getByRole('button', { name: /Compare papers/ }).click();
  const comparison = page.getByRole('region', { name: 'Paper comparison' });
  await expect(comparison.getByRole('img', { name: 'Selected figure' })).toBeVisible();
  await expect(comparison).toContainText('Panel B, tissue section');
});

test('compare cited figures, map a finding and quote it at the draft cursor', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((pdf) => {
    const vault = window.__benchworkMemory;
    if (!vault) throw new Error('Missing vault');
    vault.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { references: { enabled: true }, 'mind-maps': { enabled: true } },
      }),
      'Papers/article.pdf': pdf,
      'references/library.json': JSON.stringify([
        { id: 'a2024', title: 'First paper' },
        { id: 'b2024', title: 'Second paper' },
      ]),
      '.benchwork/modules/references/pdf-citations.json': JSON.stringify({
        'Papers/article.pdf': 'a2024',
        'Papers/missing.pdf': 'b2024',
      }),
      'Research/Evidence/Observation.md':
        '---\ntype: evidence\nsource: "[[Papers/article.pdf#page=2&highlight=h]]"\npage: "2"\nhighlightId: h\ncitekey: a2024\nexcerpt: Strong signal in panel B\nsubjects: [inflammation]\n---\n## Notes\nReplicate this finding.\n## Main finding\nThe groups differ.\n',
      'Lab/Ideas.canvas.json': JSON.stringify({
        items: [
          { id: 'r', kind: 'text', text: 'Discussion', x: 0, y: 0 },
          { id: 's', kind: 'text', text: 'Inflammation', x: 300, y: 0 },
          { id: 'n', kind: 'text', text: 'Limitations', x: 300, y: 190 },
        ],
        links: [
          { from: 'r', to: 's' },
          { from: 'r', to: 'n' },
        ],
      }),
    });
    vault.queuePick('C:/Vault');
  }, PDF);
  await page.getByRole('button', { name: 'Open vault' }).click();
  const desk = page.getByRole('button', { name: 'Reading and writing', exact: true });
  await desk.click();
  await page
    .getByRole('navigation', { name: 'Reading and writing' })
    .getByRole('button', { name: 'Zotero references' })
    .click();
  const list = page.getByRole('list', { name: 'References' }).last();
  await expect(list.getByRole('button', { name: 'Open PDF' })).toBeVisible();
  await page.getByLabel('Needs PDF').check();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Second paper');
  await page.getByLabel('Needs PDF').uncheck();
  await page.getByLabel('Compare First paper').check();
  await page.getByLabel('Compare Second paper').check();
  await page.getByRole('button', { name: /Compare papers/ }).click();
  await expect(page.getByRole('region', { name: 'Paper comparison' })).toContainText(
    'The groups differ.',
  );
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.getByRole('button', { name: 'Send to mind map' }).click();
  await page
    .getByRole('combobox', { name: 'Map', exact: true })
    .selectOption('Lab/Ideas.canvas.json');
  await page.getByRole('combobox', { name: 'Branch', exact: true }).selectOption('s');
  await page.getByRole('button', { name: 'Add evidence card' }).click();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Observation' })).toContainText(
    'Replicate this finding.',
  );
  await page.locator('.react-flow__node').filter({ hasText: 'Discussion' }).click();
  await page.getByRole('button', { name: 'Create writing outline' }).click();
  await page.getByRole('button', { name: 'Move Limitations up' }).click();
  await page.getByRole('button', { name: 'Create manuscript outline' }).click();
  await page.getByRole('button', { name: /2\. Inflammation/ }).click();
  await page.getByRole('button', { name: 'Write section' }).click();
  const editor = page.locator('.page-editor .tiptap, .page-editor.tiptap').first();
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Before after');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'Insert quotation' }).click();
  await expect(editor.locator('[data-citation]')).toContainText('First paper');
  await expect
    .poll(async () => (await files(page))['Writing/Sections/Inflammation.md'])
    .toContain('Before “Strong signal in panel B” [@a2024, p. 2]after');
});
