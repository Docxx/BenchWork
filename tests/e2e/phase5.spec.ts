import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 5 exit check in a browser. Manuscript: a chapter draft with a
 * citation exported to Word. The browser has no Pandoc, so the in-memory
 * stand-in writes what it was given; the desktop check uses real Pandoc.
 * Data viewer: a CSV file edited with a formula, saved and plotted.
 * Planner: pages with dates on a timeline, moved by dragging.
 * Mind maps and canvas: a page as a mind map, and cards joined on a canvas.
 */

const LIBRARY = JSON.stringify([
  {
    id: 'smith2024',
    title: 'Tau spreads in the fly brain',
    author: [{ family: 'Smith', given: 'Alice' }],
    issued: { 'date-parts': [[2024]] },
  },
]);

/** A day counted from today, as YYYY-MM-DD, so the plan is in view. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: {
      references: { enabled: true },
      manuscript: { enabled: true },
      'data-viewer': { enabled: true },
      planner: { enabled: true },
      'mind-maps': { enabled: true },
    },
  }),
  'Lab/Pilot.md': `---\nstart: ${day(-3)}\nend: ${day(4)}\n---\nA small first run.\n`,
  'Lab/Main study.md': `---\nstart: ${day(6)}\nend: ${day(20)}\nafter: "[[Pilot]]"\n---\n`,
  'Lab/Fly climbing.md': [
    '# Fly climbing',
    '',
    '## Aims',
    '',
    '- Measure climbing after LPS',
    '',
    '## Methods',
    '',
    'Flies were tapped down and filmed.',
    '',
    '### Analysis',
    '',
    '- Mixed model',
    '',
  ].join('\n'),
  'Lab/Board.canvas.json': JSON.stringify({
    version: 1,
    items: [
      {
        id: 'q',
        kind: 'text',
        x: 0,
        y: 0,
        width: 220,
        height: 100,
        text: 'Does LPS slow climbing?',
      },
      { id: 'p', kind: 'page', x: 400, y: 0, width: 240, height: 140, path: 'Lab/Pilot.md' },
    ],
    links: [],
  }),
  'Lab/Committee.md': `---\ndate: ${day(24)}\nmilestone: true\n---\n`,
  'references/library.json': LIBRARY,
  'Thesis/Chapter 1.md':
    '---\ntype: manuscript\nauthor: Ray Price\n---\n1. [[Background]]\n2. [[Aims]]\n',
  'Thesis/Background.md': '# Background\n\nTau spreads between neurons [@smith2024].\n',
  'Thesis/Aims.md': 'We test whether LPS changes climbing.\n',
  'Thesis/climbing.csv': 'genotype,cm\nw1118,12\nmutant,7\n',
};

const tree = (page: Page) => page.getByRole('tree', { name: 'Notebooks' });

async function exports(page: Page): Promise<[string, string][]> {
  return page.evaluate(() =>
    Object.entries(window.__benchworkMemory?.snapshot() ?? {})
      .filter(([p]) => p.startsWith('exports/'))
      .map(([p, t]) => [p, t ?? ''] as [string, string]),
  );
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
  await tree(page).getByRole('treeitem', { name: 'Thesis' }).click();
  await tree(page).getByRole('treeitem', { name: 'Chapter 1' }).click();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Chapter 1');
});

test('a chapter draft is exported to Word with its citations', async ({ page }) => {
  await runCommand(page, 'Manuscript overview');
  const parts = page.getByRole('table', { name: 'Parts' });
  await expect(parts).toContainText('Background');
  await expect(parts).toContainText('Total');

  await page.getByRole('button', { name: 'Export to Word' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved exports/' })).toBeVisible();

  const [[path, text] = ['', '']] = await exports(page);
  expect(path).toMatch(/^exports\/Chapter 1 .+\.docx$/);
  expect(text).toContain('bibliography: references/library.json');
  expect(text).toContain('Tau spreads between neurons [@smith2024].');
  expect(text).toContain('# Aims\n\nWe test whether LPS changes climbing.');
});

test('the Manuscript settings say whether Pandoc is installed', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Modules' }).click();
  await expect(page.getByText('Pandoc 3.6 (in memory) is installed.')).toBeVisible();
  await expect(page.getByText('Chicago author-date (Pandoc’s own)')).toBeVisible();
});

test('a CSV file is edited with a formula, saved and plotted', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'climbing.csv' }).click();
  const sheet = page.getByRole('table', { name: 'Sheet' });
  await expect(sheet).toContainText('w1118');

  // The spare cell below the data, in column B.
  await sheet.getByRole('row').nth(4).locator('td').nth(1).click();
  await page.keyboard.type('=SUM(B2:B3)');
  await page.keyboard.press('Enter');
  await expect(sheet).toContainText('19');
  // Saved by itself a moment after the edit.
  await expect
    .poll(() => page.evaluate(() => window.__benchworkMemory?.snapshot()['Thesis/climbing.csv']))
    .toBe('genotype,cm\nw1118,12\nmutant,7\n,19\n');

  await page.getByRole('button', { name: 'Plot' }).click();
  const plot = page.getByRole('region', { name: 'Plot' });
  await plot.getByRole('combobox', { name: 'Chart' }).selectOption('bar');
  // Plotly is large and loaded on first use.
  await expect(plot.locator('.plot-area svg.main-svg').first()).toBeVisible({ timeout: 20_000 });
});

test('pages with dates show on the planner, and dragging a bar moves them', async ({ page }) => {
  await runCommand(page, 'Open planner');
  const timeline = page.getByRole('figure', { name: 'Timeline' });
  await expect(timeline.locator('.bar-wrapper')).toHaveCount(3);
  await expect(timeline).toContainText('Pilot');
  await expect(timeline).toContainText('Committee');
  await expect(timeline.locator('.arrow')).toHaveCount(1);
  await expect(timeline.locator('.bar-wrapper.milestone')).toHaveCount(1);

  // Drag the pilot about a week later.
  const bar = timeline.locator('.bar-wrapper', { hasText: 'Pilot' }).locator('.bar');
  // Bars grow in and the chart scrolls to today; wait until the bar is still.
  let box = await bar.boundingBox();
  await expect
    .poll(
      async () => {
        const now = await bar.boundingBox();
        const still = JSON.stringify(now) === JSON.stringify(box);
        box = now;
        return still;
      },
      { intervals: [300] },
    )
    .toBe(true);
  if (box === null) throw new Error('No bar to drag');
  const from = { x: box.x + 10, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 140, from.y, { steps: 10 });
  await page.mouse.up();

  // Later, and still eight days long.
  const dates = async () => {
    const text = await page.evaluate(() => window.__benchworkMemory?.snapshot()['Lab/Pilot.md']);
    const [, start = '', end = ''] = /start: (\S+)\nend: (\S+)/.exec(text ?? '') ?? [];
    return { start, end };
  };
  await expect.poll(async () => (await dates()).start > day(-3)).toBe(true);
  const { start, end } = await dates();
  expect((Date.parse(end) - Date.parse(start)) / 86_400_000).toBe(7);
});

test('a page shows as a mind map, and a branch leads back to its heading', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Fly climbing' }).click();
  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Fly climbing');
  await runCommand(page, 'Mind map of this page');

  const map = page.getByRole('img', { name: 'Mind map' });
  await expect(map).toContainText('Measure climbing after LPS');
  await map.getByText('Analysis', { exact: true }).click();

  await expect(page.getByRole('textbox', { name: 'Page title' })).toHaveValue('Fly climbing');
  const analysis = page.getByRole('heading', { name: 'Analysis' });
  await expect
    .poll(() => analysis.evaluate((h) => h.contains(window.getSelection()?.anchorNode ?? null)))
    .toBe(true);
});

test('cards on a canvas are written, moved and joined by arrows', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Board' }).click();
  const board = page.getByLabel('Canvas', { exact: true });
  await expect(board.locator('.react-flow__node')).toHaveCount(2);
  await expect(board).toContainText('A small first run');

  const canvas = async () =>
    JSON.parse(
      (await page.evaluate(() => window.__benchworkMemory?.snapshot()['Lab/Board.canvas.json'])) ??
        '{}',
    ) as { items: { kind: string; text?: string }[]; links: { from: string; to: string }[] };

  // A new card, written in straight away.
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByRole('textbox', { name: 'Card text' }).fill('Day 7 results');
  await board.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await expect
    .poll(async () => (await canvas()).items.map((i) => i.text ?? i.kind))
    .toEqual(['Does LPS slow climbing?', 'page', 'Day 7 results']);

  // An arrow from the question to the pilot page.
  const question = board.locator('.react-flow__node[data-id="q"]');
  await question.hover();
  const from = await question.locator('.react-flow__handle-right').boundingBox();
  const to = await board.locator('.react-flow__node[data-id="p"]').boundingBox();
  if (from === null || to === null) throw new Error('Cards not drawn');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await canvas()).links)
    .toEqual([expect.objectContaining({ from: 'q', to: 'p' })]);
});

test('cards and arrows can be coloured and shaped, and arrows turned round', async ({ page }) => {
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('No memory adapter');
    void memory.writeTextAtomic(
      'Lab/Styled.canvas.json',
      JSON.stringify({
        version: 1,
        items: [
          { id: 'a', kind: 'text', x: 0, y: 0, width: 200, height: 90, text: 'Question' },
          { id: 'b', kind: 'text', x: 400, y: 0, width: 200, height: 90, text: 'Answer' },
        ],
        links: [{ id: 'l', from: 'a', to: 'b' }],
      }),
    );
  });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Styled' }).click();
  const board = page.getByLabel('Canvas', { exact: true });
  await expect(board.locator('.react-flow__node')).toHaveCount(2);

  const canvas = async () =>
    JSON.parse(
      (await page.evaluate(() => window.__benchworkMemory?.snapshot()['Lab/Styled.canvas.json'])) ??
        '{}',
    ) as { items: Record<string, unknown>[]; links: Record<string, unknown>[] };

  // A card filled blue, as an oval.
  await board.locator('.react-flow__node[data-id="a"]').click();
  const style = page.getByRole('toolbar', { name: 'Style' });
  await style.getByRole('group', { name: 'Fill' }).getByRole('button', { name: 'Blue' }).click();
  await style.getByLabel('Shape').selectOption('ellipse');
  await expect
    .poll(async () => (await canvas()).items[0])
    .toMatchObject({ id: 'a', fill: 'blue', shape: 'ellipse' });
  await expect(board.locator('.react-flow__node[data-id="a"] .canvas-card')).toHaveClass(
    /shape-ellipse/,
  );

  // The arrow dashed, with heads at both ends, then turned round.
  const middle = await board
    .locator('.react-flow__edge[data-id="l"] path.react-flow__edge-path')
    .evaluate((path: SVGPathElement) => {
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      const screen = path.getScreenCTM();
      if (!screen) throw new Error('Arrow not drawn');
      return {
        x: screen.a * point.x + screen.c * point.y + screen.e,
        y: screen.b * point.x + screen.d * point.y + screen.f,
      };
    });
  await page.mouse.click(middle.x, middle.y);
  await style.getByLabel('Arrowheads').selectOption('both');
  await style.getByLabel('Line', { exact: true }).selectOption('dashed');
  await style.getByRole('button', { name: 'Reverse' }).click();
  await expect
    .poll(async () => (await canvas()).links[0])
    .toMatchObject({ from: 'b', to: 'a', ends: 'both', line: 'dashed' });

  // Back to the usual look leaves nothing extra in the file.
  await style.getByLabel('Arrowheads').selectOption('end');
  await expect
    .poll(async () => Object.keys((await canvas()).links[0] ?? {}).sort())
    .toEqual(['from', 'id', 'line', 'to']);
});
