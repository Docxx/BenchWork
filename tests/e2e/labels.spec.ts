import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('exports a BenchWork folder as an editable phone pack with the phone calibration retained', async ({
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
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'New folder' }).click();
  await page.getByLabel('New folder', { exact: true }).fill('Fly stocks');
  await page.getByRole('button', { name: 'Create folder', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Folder Fly stocks', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByLabel('Label folder', { exact: true }).selectOption('Fly stocks');
  await page.getByRole('button', { name: 'Select Text: Label text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('{name}');
  await page.getByLabel('Italic', { exact: true }).check();
  await page.getByLabel('Underline', { exact: true }).check();
  await page.getByLabel('Line spacing', { exact: true }).fill('1.4');
  await page.getByRole('textbox', { name: 'name', exact: true }).fill('Drosomycin-GFP');
  await page.getByLabel('Template name', { exact: true }).fill('DrsGFP');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Template saved');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Folder Fly stocks', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export folder', exact: true }).click();
  const downloaded = await pending;
  const path = await downloaded.path();
  if (!path) throw new Error('Pack download failed');
  const bytes = await readFile(path);
  const pack = JSON.parse(bytes.toString()) as {
    labels: { folder: string; data: { name: string } }[];
  };
  expect(pack.labels).toHaveLength(1);
  expect(pack.labels[0]).toMatchObject({ folder: 'Fly stocks', data: { name: 'Drosomycin-GFP' } });
  await page.screenshot({ path: info.outputPath('benchwork-label-folders.png'), fullPage: true });
  const phone = await page.context().newPage();
  await phone.setViewportSize({ width: 412, height: 915 });
  await phone.goto('/labels.html');
  await phone.getByRole('button', { name: 'Printer settings', exact: true }).click();
  await phone.getByLabel('Vertical offset (mm)', { exact: true }).fill('1.25');
  await phone.getByRole('button', { name: 'Library', exact: true }).click();
  await phone.locator('input[accept=".json"]').setInputFiles({
    name: 'Fly-stocks.labelpack.json',
    mimeType: 'application/json',
    buffer: bytes,
  });
  await expect(phone.getByRole('status')).toContainText('1 label imported');
  await expect(phone.getByLabel('Template name', { exact: true })).toHaveValue('DrsGFP');
  await expect(phone.getByRole('textbox', { name: 'name', exact: true })).toHaveValue(
    'Drosomycin-GFP',
  );
  await phone.getByRole('button', { name: 'Select Text: {name}', exact: true }).click();
  await phone.getByRole('button', { name: 'Style and size', exact: true }).click();
  await expect(phone.getByLabel('Italic', { exact: true })).toBeChecked();
  await expect(phone.getByLabel('Underline', { exact: true })).toBeChecked();
  await phone.getByRole('button', { name: 'Printer settings', exact: true }).click();
  await expect(phone.getByLabel('Vertical offset (mm)', { exact: true })).toHaveValue('1.25');
  await phone.getByRole('button', { name: 'Library', exact: true }).click();
  await phone.getByRole('button', { name: 'Folder Fly stocks', exact: true }).click();
  await expect(phone.getByRole('img', { name: 'Preview of DrsGFP' })).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await phone.screenshot({
    path: info.outputPath('phone-imported-label-folder.png'),
    fullPage: true,
  });
});
test('copies and deletes existing text directly from the canvas with a recoverable delete', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/labels.html');
  await page.getByRole('button', { name: 'Select Text: Label text', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy selected element' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete selected element' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Content', exact: true })
    .fill('Drosomycin-GFP\nWolbachia free');
  await page.getByRole('button', { name: 'Copy selected element' }).click();
  await expect(
    page.getByRole('button', { name: 'Select Text: Drosomycin-GFP Wolbachia free' }),
  ).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Control stock');
  await expect(
    page.getByRole('button', { name: 'Select Text: Control stock', exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Select Text: Drosomycin-GFP Wolbachia free' }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete selected element' }).click();
  await expect(
    page.getByRole('button', { name: 'Select Text: Control stock', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Select Text: Control stock', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Select Text: Control stock', exact: true }).focus();
  await page.keyboard.press('Delete');
  await expect(
    page.getByRole('button', { name: 'Select Text: Control stock', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Select Text: Drosomycin-GFP Wolbachia free' }).click();
  await page.getByRole('button', { name: 'Edit text', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.screenshot({
    path: info.outputPath('label-context-actions-phone.png'),
    fullPage: true,
  });
});
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
  if (
    (await page
      .getByRole('button', { name: 'Style and size', exact: true })
      .getAttribute('aria-pressed')) !== 'true'
  )
    await page.getByRole('button', { name: 'Style and size', exact: true }).click();
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
  await page.getByRole('button', { name: 'Open label Fly stock date label', exact: true }).click();
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
  await expect(page.locator('.label-title h1')).toBeVisible();
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
  if (
    (await page
      .getByRole('button', { name: 'Style and size', exact: true })
      .getAttribute('aria-pressed')) !== 'true'
  )
    await page.getByRole('button', { name: 'Style and size', exact: true }).click();
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
  await expect(page.locator('.label-title h1')).toBeVisible();
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
