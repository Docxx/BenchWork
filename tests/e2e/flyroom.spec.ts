import { expect, test, type Page } from '@playwright/test';

/**
 * Fly room, a personal module (built in with VITE_PERSONAL=1): stocks
 * imported from a CSV, the cross planner's progeny, and a cross set up and
 * ticked off on its timetable.
 */

const CSV = [
  'Genotype,X,Chromosome 2,Chromosome 3,Chromosome 4,Source,Source Serial,Date Added,Status',
  'Sco/CyO; TM3/TM6,+,Sco / CyO,TM3 / TM6,+,Unknown,N/A,03/08/2026,Healthy',
  'elav-Gal4; tub-Gal80ts,+,+,elav-Gal4 tub-Gal80ts,+,Amber,N/A,31/07/2026,Healthy',
  'Myd88[KO]/CyO,w,Myd88[KO] / CyO,+,+,Bloomington,12345,31/07/2026,Quarantine',
].join('\n');

async function file(page: Page, path: string): Promise<string | null> {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? null, path);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Lab', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { flyroom: { enabled: true } },
      }),
    });
    memory.queuePick('C:/Lab');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page.getByRole('button', { name: 'Fly room', exact: true }).first().click();
});

test('imports stocks, plans a cross, and tracks it', async ({ page }) => {
  const view = page.locator('.fly-view');
  await view.getByLabel('CSV file of stocks').setInputFiles({
    name: 'stocks.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });
  await expect(view.getByRole('status')).toHaveText('3 stocks added.');
  await expect(view.getByRole('button', { name: 'Myd88-KO-CyO' })).toBeVisible();
  expect(await file(page, 'Fly room/Stocks/Myd88-KO-CyO.flystock.yaml')).toContain(
    'status: Quarantine',
  );

  // From a stock to the planner, as virgins.
  await view.getByRole('button', { name: 'Sco-CyO; TM3-TM6' }).click();
  await view.getByRole('button', { name: 'Cross as virgins' }).click();
  await view.getByLabel('Males stock', { exact: true }).selectOption('elav-Gal4; tub-Gal80ts');
  const progeny = view.getByRole('table', { name: 'Progeny' });
  await expect(progeny.getByRole('row')).toHaveCount(9);
  await expect(progeny).toContainText('Cy, Sb; not Hu, Sco');
  await expect(progeny).toContainText('12.5%');

  // A balanced stock crossed to itself: CyO/CyO does not survive, and the
  // homozygous knock-outs, free of the balancer, are marked.
  await view.getByLabel('Virgin females stock').selectOption('Myd88-KO-CyO');
  await view.getByLabel('Males stock', { exact: true }).selectOption('Myd88-KO-CyO');
  await expect(view.getByText(/kinds do not survive/)).toBeVisible();
  await expect(progeny.locator('.fly-tag')).toHaveCount(2);

  await view.getByRole('button', { name: 'Set up this cross' }).click();
  const editor = view.getByRole('region', { name: /^Cross / });
  await expect(editor.getByRole('list', { name: 'Timetable' }).getByRole('listitem')).toHaveCount(
    4,
  );
  await editor.getByRole('checkbox').first().check();
  await expect
    .poll(() => file(page, 'Fly room/Crosses/Myd88-KO-CyO × Myd88-KO-CyO.flycross.yaml'))
    .toContain('- flip');
});

test('tags filter stocks, status changes from the list, and the views change', async ({ page }) => {
  const view = page.locator('.fly-view');
  await view.getByLabel('CSV file of stocks').setInputFiles({
    name: 'stocks.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });
  await expect(view.getByRole('status')).toHaveText('3 stocks added.');

  // Status straight from the list.
  await view.getByLabel('Status of Myd88-KO-CyO').selectOption('Dead');
  await expect
    .poll(() => file(page, 'Fly room/Stocks/Myd88-KO-CyO.flystock.yaml'))
    .toContain('status: Dead');

  // A tag, then the list filtered by it.
  await view.getByRole('button', { name: 'Myd88-KO-CyO' }).click();
  const editor = view.getByRole('region', { name: 'Stock Myd88-KO-CyO' });
  // A stock opens as a card to read; Edit shows the fields.
  await expect(editor.getByLabel('Tags')).toHaveCount(0);
  await expect(editor.getByRole('link', { name: 'Bloomington 12345' })).toBeVisible();
  await expect(editor.getByRole('link', { name: 'Myd88[KO]' })).toBeVisible();
  await editor.getByRole('button', { name: 'Edit', exact: true }).click();
  await editor.getByLabel('Tags').fill('Immunity, Toll');
  await editor.getByLabel('Tags').press('Enter');
  await expect(editor.getByText('Bloomington 12345 on FlyBase')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Myd88[KO]' })).toBeVisible();
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(editor.getByText('Immunity, Toll')).toBeVisible();
  await view
    .getByRole('group', { name: 'Show stocks tagged' })
    .getByRole('button', { name: 'Immunity' })
    .click();
  await expect(view.locator('.fly-table tbody tr')).toHaveCount(1);

  // Genotypes on one line, and progeny as cards.
  await view.getByLabel('Genotypes', { exact: true }).selectOption('line');
  await expect(view.locator('.genotype.line').first()).toBeVisible();
  await view.getByRole('tab', { name: 'Cross planner' }).click();
  await view.getByLabel('Virgin females stock').selectOption('Sco-CyO; TM3-TM6');
  await view.getByLabel('Males stock', { exact: true }).selectOption('elav-Gal4; tub-Gal80ts');
  await view.getByRole('tab', { name: 'Cards' }).click();
  await expect(view.getByRole('list', { name: 'Progeny' }).getByRole('listitem')).toHaveCount(8);
});
test('runs a sequential line plan, carries a shortfall and reuses a clean template', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Transgenic lines' }).click();
  await page.getByRole('button', { name: 'New line plan' }).click();
  await page.getByLabel('Line name').fill('Test line');
  await page.getByLabel('Planned start').fill('2020-01-01');
  await page.getByLabel('Step name').fill('First collection');
  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByLabel('Step name').nth(1).fill('Review');
  await page.getByLabel('Estimated days').nth(1).fill('2');
  await page.getByRole('button', { name: 'Add collection' }).first().click();
  await page.getByLabel('Collect', { exact: true }).selectOption('Virgin females');
  await page.getByLabel('Number needed').fill('5');
  await page.getByLabel('Source stock or vial').fill('Vial A');
  await page.getByLabel('Why collect these flies?').fill('For the review');
  await page.getByLabel('Needed for step').selectOption({ label: 'Step 2 · Review' });
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  const queue = page.getByRole('region', { name: 'Fly Room work queue' });
  await expect(queue).toContainText('First collection');
  await page.getByLabel('Actual collected').fill('3');
  await page.getByRole('button', { name: 'Save counts' }).click();
  await expect
    .poll(() => file(page, 'Fly room/Transgenic lines/Test line.flyline.yaml'))
    .toContain('actual:');
  await page.getByLabel('Shortfall of 2').selectOption('carry');
  await page.getByRole('button', { name: 'Mark step complete' }).click();
  await expect(queue).toContainText('Review');
  await expect(queue).not.toContainText('2020-01-01');
  await page.getByLabel('Actual collected (target 2)').fill('1');
  await page.getByLabel('Shortfall of 1').selectOption('note');
  await page.getByLabel('Shortfall note').fill('Reviewed available flies');
  await page.getByRole('button', { name: 'Mark step complete' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan complete' })).toBeVisible();
  await expect(queue).toContainText('No pending line steps');
  await expect(
    page
      .getByRole('navigation', { name: 'Plan steps' })
      .getByRole('link', { name: /Complete.*Review/ }),
  ).toBeVisible();
  const timetable = page.getByRole('list', { name: 'Line timetable' });
  await expect(timetable.getByRole('link', { name: 'Review' }).first()).toBeVisible();
  await expect(timetable).toContainText('Collected 1 of 2');
  await expect(timetable).toContainText('Reviewed available flies');
  await page.getByRole('button', { name: 'Save as reusable template' }).click();
  await page.getByRole('button', { name: 'Save template' }).click();
  await page.getByRole('button', { name: 'Start plan from template' }).click();
  await page.getByLabel('Line name').fill('Second line');
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(queue).toContainText('Second line');
  await expect(page.getByLabel('Actual collected (target 5)')).toHaveValue('');
});

test('a scanned label link opens its stock', async ({ page }) => {
  await page.evaluate(async () => {
    const memory = window.__benchworkMemory;
    await memory?.ensureDir('Fly room/Stocks');
    await memory?.writeTextAtomic(
      'Fly room/Stocks/OreR.flystock.yaml',
      'genotype: + ; + ; + ; +\nstatus: Healthy\ncode: K7M2Q9XA\n',
    );
  });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.evaluate(() => {
    window.__benchworkMemory?.openAppLink('benchwork://s/k7m2q9xa');
  });
  const view = page.locator('.fly-view');
  await expect(view.getByLabel('Stock details')).toContainText('K7M2Q9XA');
  await expect(view.getByRole('row', { selected: true })).toContainText('OreR');
  await page.evaluate(() => {
    window.__benchworkMemory?.openAppLink('benchwork://s/ZZZZZZZZ');
  });
  await expect(view.getByRole('status')).toContainText('No stock has the label code ZZZZZZZZ');
});

test('makes a vial label for a stock and deletes a stock after asking', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Modules', exact: true }).click();
  await page.getByRole('switch', { name: /Label Studio/ }).click();
  await page.getByRole('button', { name: 'Fly room', exact: true }).first().click();
  const view = page.locator('.fly-view');
  await view.getByLabel('CSV file of stocks').setInputFiles({
    name: 'stocks.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV),
  });
  await expect(view.getByRole('status')).toHaveText('3 stocks added.');

  await view.getByRole('button', { name: 'Myd88-KO-CyO' }).click();
  const stock = view.getByRole('region', { name: 'Stock Myd88-KO-CyO' });
  await stock.getByRole('button', { name: 'Make label', exact: true }).click();
  const prompt = page.getByRole('dialog', { name: 'Your initials' });
  await prompt.getByLabel('Initials for labels').fill('RP');
  await prompt.getByLabel('Initials for labels').press('Enter');
  await expect(page.getByLabel('Template name', { exact: true })).toHaveValue('Myd88-KO-CyO vial');
  const saved = await page.evaluate(
    () =>
      Object.entries(window.__benchworkMemory?.snapshot() ?? {}).find(([p]) =>
        p.endsWith('.label.json'),
      )?.[1] ?? '',
  );
  expect(saved).toContain('{genotype}');
  expect(saved).toContain('"initials": "RP"');
  expect(saved).toMatch(/"link": "benchwork:\/\/s\/[0-9A-Z]{8}"/);
  expect(await file(page, 'Fly room/Stocks/Myd88-KO-CyO.flystock.yaml')).toMatch(/code: \w{8}/);

  await page.getByRole('button', { name: 'Fly room', exact: true }).first().click();
  await view.getByRole('button', { name: 'Myd88-KO-CyO' }).click();
  await stock.getByRole('button', { name: 'Delete stock', exact: true }).click();
  const ask = page.getByRole('alertdialog', { name: 'Delete Myd88-KO-CyO?' });
  await ask.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(view.getByRole('button', { name: 'Myd88-KO-CyO' })).toBeVisible();
  await stock.getByRole('button', { name: 'Delete stock', exact: true }).click();
  await ask.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(view.getByRole('button', { name: 'Myd88-KO-CyO' })).toHaveCount(0);
  expect(await file(page, 'Fly room/Stocks/Myd88-KO-CyO.flystock.yaml')).toBeNull();
});
