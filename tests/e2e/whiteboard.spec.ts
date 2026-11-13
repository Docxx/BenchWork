import { expect, test, type Page } from '@playwright/test';

/**
 * Whiteboards: an endless board made from a notebook's menu, drawn on with
 * pens and shapes, with a sticky note, selection, undo and scribbling out,
 * saved as a .board.json file.
 */

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: { whiteboard: { enabled: true } },
  }),
  'Lab/Notes.md': '# Notes\n',
};
const FILE = 'Lab/Ideas.board.json';

interface Saved {
  items: {
    kind: string;
    shape?: string;
    pen?: string;
    text?: string;
    from?: string;
    to?: string;
  }[];
}

async function board(page: Page): Promise<Saved> {
  const text = await page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? '', FILE);
  return text === '' ? { items: [] } : (JSON.parse(text) as Saved);
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
  await page.getByRole('tree', { name: 'Notebooks' }).getByRole('treeitem', { name: 'Lab' }).click({
    button: 'right',
  });
  await page.getByRole('menuitem', { name: 'More to add' }).click();
  await page.getByRole('menuitem', { name: 'New whiteboard' }).click();
  await page.getByRole('textbox', { name: 'Whiteboard name' }).fill('Ideas');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('toolbar', { name: 'Whiteboard tools' })).toBeVisible();
});

test('draws with pens and shapes, joins an arrow, and keeps a sticky note', async ({ page }) => {
  const tools = page.getByRole('toolbar', { name: 'Whiteboard tools' });
  const area = await page.getByRole('img', { name: /^Whiteboard\./ }).boundingBox();
  if (!area) throw new Error('No board');
  const drag = async (points: [number, number][]) => {
    const [first, ...rest] = points;
    if (!first) return;
    await page.mouse.move(area.x + first[0], area.y + first[1]);
    await page.mouse.down();
    for (const [x, y] of rest) await page.mouse.move(area.x + x, area.y + y, { steps: 3 });
    await page.mouse.up();
  };

  // The pen is ready as the board opens.
  await drag([
    [60, 300],
    [120, 320],
    [200, 300],
  ]);
  await expect.poll(async () => (await board(page)).items.map((i) => i.kind)).toEqual(['stroke']);

  await tools.getByRole('button', { name: 'Box' }).click();
  await drag([
    [60, 60],
    [180, 140],
  ]);
  await tools.getByRole('button', { name: 'Ellipse' }).click();
  await drag([
    [320, 60],
    [440, 140],
  ]);
  // An arrow drawn from one to the other is joined to both.
  await tools.getByRole('button', { name: 'Arrow' }).click();
  await drag([
    [150, 100],
    [350, 100],
  ]);
  await expect
    .poll(async () => (await board(page)).items.map((i) => i.shape ?? i.kind))
    .toEqual(['stroke', 'rect', 'ellipse', 'arrow']);
  const arrow = (await board(page)).items[3];
  expect(arrow?.from).toBeTruthy();
  expect(arrow?.to).toBeTruthy();

  await tools.getByRole('button', { name: 'Sticky note' }).click();
  await page.mouse.click(area.x + 300, area.y + 280);
  await page.getByRole('textbox', { name: 'Sticky note' }).fill('Order fly food');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await board(page)).items.at(-1)?.text).toBe('Order fly food');

  // Undo takes the note's text back, then the note; redo returns them.
  await tools.getByRole('button', { name: 'Undo' }).click();
  await tools.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await board(page)).items).toHaveLength(4);
  await tools.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(async () => (await board(page)).items).toHaveLength(5);
});

test('a lasso selects to delete, and a scribble rubs ink out', async ({ page }) => {
  const tools = page.getByRole('toolbar', { name: 'Whiteboard tools' });
  const area = await page.getByRole('img', { name: /^Whiteboard\./ }).boundingBox();
  if (!area) throw new Error('No board');
  const at = (x: number, y: number) => [area.x + x, area.y + y] as const;

  // A line of ink, then a scribble back and forth over it.
  await page.mouse.move(...at(80, 100));
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(...at(80 + i * 10, 100 + (i % 2) * 6));
  await page.mouse.up();
  await expect.poll(async () => (await board(page)).items).toHaveLength(1);
  await page.mouse.move(...at(70, 95));
  await page.mouse.down();
  for (let leg = 0; leg < 6; leg += 1) {
    await page.mouse.move(...at(leg % 2 === 0 ? 170 : 70, 95 + leg * 2), { steps: 5 });
  }
  await page.mouse.up();
  await expect.poll(async () => (await board(page)).items).toHaveLength(0);

  // A box, lassoed and deleted from the selection's buttons.
  await tools.getByRole('button', { name: 'Box' }).click();
  await page.mouse.move(...at(100, 200));
  await page.mouse.down();
  await page.mouse.move(...at(200, 260), { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await board(page)).items).toHaveLength(1);
  await tools.getByRole('button', { name: /^Select/ }).click();
  await page.mouse.move(...at(60, 170));
  await page.mouse.down();
  for (const [x, y] of [
    [260, 170],
    [260, 300],
    [60, 300],
    [60, 175],
  ] as const) {
    await page.mouse.move(...at(x, y), { steps: 4 });
  }
  await page.mouse.up();
  await page
    .getByRole('toolbar', { name: 'Selection' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect.poll(async () => (await board(page)).items).toHaveLength(0);
});
