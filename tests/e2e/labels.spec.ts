import { test, expect } from '@playwright/test';
test('designs calibrated labels, saves portable templates, previews QR codes and batches without automatic printing', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.evaluate(() => {
    const m = window.__benchworkMemory;
    m?.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { labels: { enabled: true } },
      }),
      'Lab/Plan.md': '# Plan',
    });
    m?.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await page.getByRole('button', { name: 'Label Studio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make your mark.' })).toBeVisible();
  await expect(page.getByLabel('Vertical offset (mm)', { exact: true })).toHaveValue('-0.75');
  await expect(
    page.getByRole('img', { name: 'Actual monochrome label print preview' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review 2 labels' })).toBeDisabled();
  await page.getByRole('button', { name: 'Select Text: {name}', exact: true }).click();
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('{name} #{n}');
  await page.getByLabel('Template name', { exact: true }).fill('Fly vial');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Template saved');
  const stored = await page.evaluate(
    () =>
      Object.entries(window.__benchworkMemory?.snapshot() ?? {}).find(
        ([p]) => p.startsWith('Labels/') && p.endsWith('.label.json'),
      )?.[1] ?? '',
  );
  expect(stored).toContain('Fly vial');
  expect(stored).toContain('{name} #{n}');
  await page.getByRole('button', { name: 'QR code', exact: true }).click();
  await page.getByLabel('X (mm)', { exact: true }).fill('36');
  await page.getByLabel('Width (mm)', { exact: true }).fill('10');
  await page.getByLabel('Height (mm)', { exact: true }).fill('10');
  await expect(
    page.getByRole('img', { name: 'Actual monochrome label print preview' }),
  ).toBeVisible();
  const prior = await page
    .getByRole('img', { name: 'Actual monochrome label print preview' })
    .getAttribute('src');
  await page.getByLabel('Vertical offset (mm)', { exact: true }).fill('0');
  await expect
    .poll(() =>
      page.getByRole('img', { name: 'Actual monochrome label print preview' }).getAttribute('src'),
    )
    .not.toBe(prior);
  await page.locator('input[accept=".csv,.xlsx,.xls"]').setInputFiles({
    name: 'samples.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'name,id,date\nFly A,001,02/11/2026\nFly B,002,02/11/2026\nFly C,003,02/11/2026',
    ),
  });
  await expect(page.getByRole('status')).toContainText('3 data rows loaded');
  await expect(page.getByRole('textbox', { name: 'id', exact: true })).toHaveValue('001');
  await expect(page.getByRole('textbox', { name: 'date', exact: true })).toHaveValue('02/11/2026');
  await expect(page.getByRole('button', { name: 'Review 3 labels' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('labels-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.screenshot({ path: info.outputPath('labels-phone.png'), fullPage: true });
});
test('the standalone phone interface opens without a vault or full BenchWork navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/labels.html');
  await expect(page.getByRole('heading', { name: 'Make your mark.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Vault' })).toHaveCount(0);
  await expect(
    page.getByRole('img', { name: 'Actual monochrome label print preview' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(
    0,
  );
  await page.getByLabel('Vertical offset (mm)', { exact: true }).fill('1.25');
  await page.getByRole('textbox', { name: 'Template name', exact: true }).fill('Phone calibration');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.locator('.label-notice')).toHaveText('Template saved.');
  await page.reload();
  await expect(page.getByLabel('Vertical offset (mm)', { exact: true })).toHaveValue('1.25');
  await page.getByRole('button', { name: 'New label', exact: true }).click();
  await expect(page.getByLabel('Vertical offset (mm)', { exact: true })).toHaveValue('1.25');
});
