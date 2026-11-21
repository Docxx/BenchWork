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
  await page.getByText('Configure Reading and writing', { exact: true }).click();
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
  const chart = page.getByRole('region', { name: 'Chart' });
  await expect(chart.locator('.gantt-bar')).toHaveCount(3);
  await expect(chart).toContainText('Pilot');
  await expect(chart).toContainText('Committee');
  await expect(chart.locator('.gantt-arrows > path')).toHaveCount(1);
  await expect(chart.locator('.gantt-bar.milestone')).toHaveCount(1);

  // Drag the pilot about a week later, by its middle.
  const bar = chart.locator('.gantt-bar', { hasText: 'Pilot' });
  const box = await bar.boundingBox();
  if (box === null) throw new Error('No bar to drag');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 7 * 16, from.y, { steps: 10 });
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
  const edgePath = board.locator('.react-flow__edge-path');
  const before = await edgePath.getAttribute('d');
  const box = await question.boundingBox();
  if (!box) throw new Error('Missing question card');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 65, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => edgePath.getAttribute('d')).not.toBe(before);
  await tree(page).getByRole('treeitem', { name: 'Pilot', exact: true }).click();
  await tree(page).getByRole('treeitem', { name: 'Board' }).click();
  await expect(edgePath).toHaveCount(1);
  expect((await canvas()).links).toEqual([expect.objectContaining({ from: 'q', to: 'p' })]);
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
  await board.locator('.react-flow__edge[data-id="l"]').scrollIntoViewIfNeeded();
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

test('a big canvas zooms out to show all of it, with an overview map', async ({ page }) => {
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('No memory adapter');
    void memory.writeTextAtomic(
      'Lab/Big.canvas.json',
      JSON.stringify({
        version: 1,
        items: [
          { id: 'near', kind: 'text', x: 0, y: 0, width: 300, height: 120, text: 'Start here' },
          { id: 'far', kind: 'text', x: 120000, y: 80000, width: 300, height: 120, text: 'Far' },
        ],
        links: [],
      }),
    );
  });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Big' }).click();
  const board = page.getByLabel('Canvas', { exact: true });

  // Both corners are in view at once (only cards in view are drawn), with an overview map.
  await expect(board.locator('.react-flow__node')).toHaveCount(2);
  await expect(board).toHaveClass(/far/);
  const overview = page.getByRole('button', { name: 'Overview' });
  await expect(overview).toHaveAttribute('aria-pressed', 'true');
  await expect(board.locator('.react-flow__minimap')).toBeVisible();
  await overview.click();
  await expect(board.locator('.react-flow__minimap')).toHaveCount(0);
});

test('cards can be see-through, and card text is formatted', async ({ page }) => {
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('No memory adapter');
    void memory.writeTextAtomic(
      'Lab/Notes.canvas.json',
      JSON.stringify({
        version: 1,
        items: [
          { id: 'a', kind: 'text', x: 0, y: 0, width: 240, height: 100, text: 'Start here' },
          { id: 'b', kind: 'text', x: 400, y: 0, width: 240, height: 100, text: 'Plain *stays*' },
        ],
        links: [],
      }),
    );
  });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Notes' }).click();
  const board = page.getByLabel('Canvas', { exact: true });
  await expect(board.locator('.react-flow__node')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Overview' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // A plain card from before shows its words exactly as written.
  await expect(board.locator('.react-flow__node[data-id="b"]')).toContainText('Plain *stays*');

  const canvas = async () =>
    JSON.parse(
      (await page.evaluate(() => window.__benchworkMemory?.snapshot()['Lab/Notes.canvas.json'])) ??
        '{}',
    ) as { items: Record<string, unknown>[] };

  // See-through: the card keeps its border but shows what is behind it.
  await board.locator('.react-flow__node[data-id="a"]').click();
  const style = page.getByRole('toolbar', { name: 'Style' });
  await style
    .getByRole('group', { name: 'Fill' })
    .getByRole('button', { name: 'See-through' })
    .click();
  await expect.poll(async () => (await canvas()).items[0]).toMatchObject({ fill: 'none' });
  await expect(board.locator('.react-flow__node[data-id="a"] .canvas-card')).toHaveClass(
    /see-through/,
  );

  // Bold text, saved as Markdown and shown without its symbols.
  await board.locator('.react-flow__node[data-id="a"]').dblclick();
  const text = page.getByRole('textbox', { name: 'Card text' });
  await text.press('Control+a');
  await text.press('Control+b');
  await board.locator('.react-flow__pane').click({ position: { x: 20, y: 300 } });
  await expect
    .poll(async () => (await canvas()).items[0])
    .toMatchObject({ text: '**Start here**', format: 'markdown' });
  await expect(board.locator('.react-flow__node[data-id="a"] strong')).toHaveText('Start here');
});

test('bulk sticky notes can be arranged, duplicated and reopened', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  const board = tree(page).getByRole('treeitem', { name: 'Board' });
  await board.click();
  await page.getByRole('button', { name: 'Bulk notes…' }).click();
  await page.getByLabel('One sticky note per line').fill('Measure\nDiscuss\nDecide');
  await page.getByRole('button', { name: 'Add notes' }).click();
  await page.getByLabel('Arrange selected cards').selectOption('top');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  const saved = () =>
    page.evaluate(
      () =>
        JSON.parse(window.__benchworkMemory?.snapshot()['Lab/Board.canvas.json'] ?? '{}') as {
          items: { text?: string; y: number }[];
        },
    );
  await expect.poll(async () => (await saved()).items.length).toBe(8);
  const notes = (await saved()).items.slice(2);
  expect(new Set(notes.slice(0, 3).map((note) => note.y)).size).toBe(1);
  expect(notes.filter((note) => note.text === 'Decide')).toHaveLength(2);
  await tree(page).getByRole('treeitem', { name: 'Pilot', exact: true }).click();
  await board.click();
  await expect(page.getByRole('button', { name: 'Bulk notes…' })).toBeVisible();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Decide' })).toHaveCount(2);
});

test('a page mind map becomes a canvas with editable branches', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Fly climbing' }).click();
  await page.getByRole('button', { name: 'Mind map', exact: true }).click();
  await page.getByLabel('Map background colour').fill('#ede4d0');
  await page.getByRole('button', { name: 'Create editable canvas' }).click();
  await expect(page.getByLabel('Map background colour')).toHaveValue('#ede4d0');
  const board = page.locator('.canvas-board');
  await expect
    .poll(() =>
      // It reaches the bottom of the window, leaving no gap; on a short window it
      // keeps a working height and the view scrolls.
      board.evaluate(
        (el) =>
          (el.closest('main')?.getBoundingClientRect().bottom ?? NaN) -
          el.getBoundingClientRect().bottom,
      ),
    )
    .toBeLessThan(4);
  await page.getByLabel('Map background colour').fill('#ddddee');
  await expect
    .poll(() =>
      page.evaluate(() => window.__benchworkMemory?.snapshot()['Lab/Fly climbing.canvas.json']),
    )
    .toContain('#ddddee');
  const node = page.locator('.react-flow__node').filter({ hasText: 'Mixed model' });
  await node.click();
  await page.getByRole('button', { name: 'Add branch' }).click();
  await page.getByRole('textbox', { name: 'Card text' }).fill('Follow-up analysis');
  await page.locator('.react-flow__pane').click({ position: { x: 12, y: 12 } });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const doc = JSON.parse(
          window.__benchworkMemory?.snapshot()['Lab/Fly climbing.canvas.json'] ?? '{}',
        ) as { items?: { id: string; text: string }[]; links?: { from: string; to: string }[] };
        const parent = doc.items?.find((item) => item.text === 'Mixed model');
        const child = doc.items?.find((item) => item.text === 'Follow-up analysis');
        return doc.links?.some((link) => link.from === parent?.id && link.to === child?.id);
      }),
    )
    .toBe(true);
});

test('capture, find, resize and paste images on a canvas', async ({ page }) => {
  await tree(page).getByRole('treeitem', { name: 'Lab' }).click();
  await tree(page).getByRole('treeitem', { name: 'Board' }).click();
  await page.evaluate(() => {
    const source = document.createElement('canvas');
    source.width = 240;
    source.height = 160;
    const pen = source.getContext('2d');
    if (!pen) throw new Error('Canvas context unavailable');
    pen.fillStyle = 'tomato';
    pen.fillRect(0, 0, 240, 160);
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      value: () => {
        const stream = source.captureStream(12);
        requestAnimationFrame(() => {
          pen.fillRect(0, 0, 240, 160);
        });
        return Promise.resolve(stream);
      },
    });
  });
  await page.getByRole('button', { name: 'Take screenshot' }).click();
  const read = () =>
    page.evaluate(
      () =>
        JSON.parse(window.__benchworkMemory?.snapshot()['Lab/Board.canvas.json'] ?? '{}') as {
          items: { id: string; kind: string; width: number; height: number; path?: string }[];
        },
    );
  await expect
    .poll(async () => (await read()).items.filter((item) => item.kind === 'image').length)
    .toBe(1);
  await page.getByRole('button', { name: 'Find on canvas' }).focus();
  await page.keyboard.press('Control+f');
  await page.getByRole('searchbox', { name: 'Search this canvas' }).fill('screenshot');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('search')).toContainText('1 of 1');
  const image = page
    .locator('.react-flow__node.selected')
    .filter({ has: page.locator('.image-card') });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image
        .locator('img')
        .evaluate((img) => (img instanceof HTMLImageElement ? img.naturalWidth : 0)),
    )
    .toBe(240);
  await page.getByRole('button', { name: 'Close search' }).click();
  const handle = image.locator('.react-flow__resize-control.handle.bottom.right');
  await handle.hover();
  const pos = await handle.boundingBox();
  if (!pos) throw new Error('Missing resize handle');
  await page.mouse.move(pos.x + pos.width / 2, pos.y + pos.height / 2);
  await page.mouse.down();
  await page.mouse.move(pos.x + 60, pos.y + 40, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await read()).items.find((item) => item.kind === 'image')?.width)
    .toBeGreaterThan(240);
  await page.evaluate(async () => {
    const source = document.createElement('canvas');
    const blob = await new Promise<Blob | null>((resolve) => {
      source.toBlob(resolve);
    });
    if (!blob) throw new Error('No image');
    const data = new DataTransfer();
    data.items.add(new File([blob], 'clipboard.png', { type: 'image/png' }));
    document.body.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect
    .poll(async () => (await read()).items.filter((item) => item.kind === 'image').length)
    .toBe(2);
});
