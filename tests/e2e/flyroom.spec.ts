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
