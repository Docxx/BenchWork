import { test, expect } from '@playwright/test';
test('simple design controls resize elements, offer a live date and find saved labels', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/labels.html');
  await expect(page.getByRole('button', { name: 'QR code', exact: true })).toBeHidden();
  await expect(page.getByLabel('Vertical offset (mm)', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Select Text: Label text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Fly stocks');
  const layer = page.getByRole('button', { name: 'Select Text: Fly stocks', exact: true });
  await layer.scrollIntoViewIfNeeded();
  const box = await layer.boundingBox();
  if (!box) throw new Error('Element is not visible');
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 15, box.y + 10);
  await page.mouse.up();
  await page.getByText('Position and rotation', { exact: true }).click();
  expect(Number(await page.getByLabel('X (mm)', { exact: true }).inputValue())).toBeGreaterThan(2);
  const width = Number(await page.getByLabel('Width (mm)', { exact: true }).inputValue());
  const handle = page.getByRole('button', { name: 'Resize selected element', exact: true });
  await handle.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByLabel('Width (mm)', { exact: true })).toHaveValue(String(width + 1));
  await handle.scrollIntoViewIfNeeded();
  const grip = await handle.boundingBox();
  if (!grip) throw new Error('Resize handle is not visible');
  const height = Number(await page.getByLabel('Height (mm)', { exact: true }).inputValue());
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 - 10, grip.y + grip.height / 2 + 10);
  await page.mouse.up();
  expect(
    Number(await page.getByLabel('Height (mm)', { exact: true }).inputValue()),
  ).toBeGreaterThan(height);
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await expect(page.getByLabel("Always use today's date", { exact: true })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toBeDisabled();
  await page.getByLabel("Always use today's date", { exact: true }).uncheck();
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('05/11/2026');
  await page.getByLabel('Template name', { exact: true }).fill('Fly stock date label');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByLabel('Search saved labels', { exact: true }).fill('does not exist');
  await expect(page.getByText('No labels match your search.')).toBeVisible();
  await page.getByLabel('Search saved labels', { exact: true }).fill('Fly stock');
  await expect(page.getByRole('img', { name: 'Preview of Fly stock date label' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('label-library-phone.png'), fullPage: true });
  await page.locator('.label-library-card').filter({ hasText: 'Fly stock date label' }).click();
  await expect(page.getByLabel('Template name', { exact: true })).toHaveValue(
    'Fly stock date label',
  );
  await expect(page.getByLabel('Vertical offset (mm)', { exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.screenshot({ path: info.outputPath('label-design-phone.png'), fullPage: true });
});
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
  await expect(page.getByLabel('Vertical offset (mm)', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Printer settings', exact: true }).first().click();
  await expect(page.getByLabel('Vertical offset (mm)', { exact: true })).toHaveValue('-0.75');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  if (!(await page.locator('.label-print-preview').evaluate((el) => el.hasAttribute('open'))))
    await page.getByText('Print preview', { exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Actual monochrome label print preview' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review 2 labels' })).toBeDisabled();
  await page.getByRole('button', { name: 'Select Text: Label text', exact: true }).click();
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
  await page.getByText('More elements', { exact: true }).click();
  await page.getByRole('button', { name: 'QR code', exact: true }).click();
  await page.getByText('Position and rotation', { exact: true }).click();
  await page.getByLabel('X (mm)', { exact: true }).fill('36');
  await page.getByLabel('Width (mm)', { exact: true }).fill('10');
  await page.getByLabel('Height (mm)', { exact: true }).fill('10');
  if (!(await page.locator('.label-print-preview').evaluate((el) => el.hasAttribute('open'))))
    await page.getByText('Print preview', { exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Actual monochrome label print preview' }),
  ).toBeVisible();
  const prior = await page
    .getByRole('img', { name: 'Actual monochrome label print preview' })
    .getAttribute('src');
  await page.getByRole('button', { name: 'Printer settings', exact: true }).first().click();
  await page.getByLabel('Vertical offset (mm)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect
    .poll(() =>
      page.getByRole('img', { name: 'Actual monochrome label print preview' }).getAttribute('src'),
    )
    .not.toBe(prior);
  await page.getByRole('button', { name: 'Batch data', exact: true }).click();
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
  await page.getByRole('button', { name: 'Design', exact: true }).click();
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
  if (!(await page.locator('.label-print-preview').evaluate((el) => el.hasAttribute('open'))))
    await page.getByText('Print preview', { exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Actual monochrome label print preview' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(
    0,
  );
  await page.getByRole('button', { name: 'Printer settings', exact: true }).first().click();
  await page.getByLabel('Vertical offset (mm)', { exact: true }).fill('1.25');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('textbox', { name: 'Template name', exact: true }).fill('Phone calibration');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.locator('.label-notice')).toHaveText('Template saved.');
  await page.evaluate(() => {
    const key = 'benchwork.label-studio.templates';
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]') as { id: string; name: string }[];
    localStorage.setItem(
      key,
      JSON.stringify([
        ...saved,
        { ...saved[0], id: crypto.randomUUID(), name: 'Old printed snapshot', savedAs: 'printed' },
      ]),
    );
  });
  await page.reload();
  await expect(page.getByLabel('Template name', { exact: true })).toHaveValue('Phone calibration');
  await page.getByRole('button', { name: 'Printer settings', exact: true }).first().click();
  await expect(page.getByLabel('Vertical offset (mm)', { exact: true })).toHaveValue('1.25');
  await page.getByRole('button', { name: 'New label', exact: true }).click();
  await page.getByRole('button', { name: 'Printer settings', exact: true }).first().click();
  await expect(page.getByLabel('Vertical offset (mm)', { exact: true })).toHaveValue('1.25');
});
