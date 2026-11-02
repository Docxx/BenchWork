import { test, expect } from '@playwright/test';

test('tools stay compact, notebook sizing is adjustable, and folders accept files and Explorer actions', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    memory?.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: Object.fromEntries(
          [
            'inventory',
            'lab-tools',
            'tasks',
            'cloud',
            'knowledge-graph',
            'references',
            'planner',
            'mind-maps',
          ].map((id) => [id, { enabled: true }]),
        ),
      }),
      'Lab/Plan.md': '# Plan',
      'Archive/old.md': 'old',
    });
    memory?.addExternalFile('D:/run.csv', 'a,b');
    memory?.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.locator('.splash')).toHaveCount(0);
  const sidebar = page.getByRole('navigation', { name: 'Vault' });
  const tools = sidebar.getByRole('listitem', { name: 'Tools', exact: true });
  await expect(tools.getByRole('button', { name: 'Cloud storage', exact: true })).toBeVisible();
  expect(
    await tools.locator('.tools-scroll').evaluate((el) => el.clientHeight),
  ).toBeLessThanOrEqual(156);
  await tools.getByRole('searchbox', { name: 'Find a tool' }).fill('cloud');
  await expect(tools.locator('.tools-scroll button')).toHaveCount(1);
  await tools.getByRole('searchbox', { name: 'Find a tool' }).fill('');
  const toggle = tools.getByRole('button', { name: /^Tools/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(tools.getByRole('button', { name: 'Cloud storage', exact: true })).toHaveCount(0);
  const sizing = sidebar.getByRole('separator', { name: 'Notebook area height' });
  const before = Number(await sizing.getAttribute('aria-valuenow'));
  await sizing.focus();
  await page.keyboard.press('ArrowDown');
  await expect(sizing).toHaveAttribute('aria-valuenow', String(before + 32));
  const saved = await page.evaluate(async () => window.__benchworkMemory?.loadAppSettings());
  expect(saved).toMatchObject({
    appearance: { toolsCollapsed: true, notebookHeight: before + 32 },
  });
  const folder = sidebar.getByRole('treeitem', { name: 'Lab', exact: true });
  expect((await folder.boundingBox())?.height).toBeGreaterThanOrEqual(36);
  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open in Windows Explorer', exact: true }).click();
  expect(await page.evaluate(() => window.__benchworkMemory?.openedFolders)).toContain('Lab');
  await folder.click({ button: 'right' });
  await page.evaluate(() => window.__benchworkMemory?.queueFilePick(['D:/run.csv']));
  await page.getByRole('menuitem', { name: 'Add files…', exact: true }).click();
  await expect(sidebar.getByRole('treeitem', { name: 'run.csv', exact: true })).toBeVisible();
  const transfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['pixels'], 'image.png', { type: 'image/png' }));
    return dt;
  });
  await folder.dispatchEvent('dragover', { dataTransfer: transfer });
  await expect(folder).toHaveClass(/drop-into/);
  await folder.dispatchEvent('drop', { dataTransfer: transfer });
  await expect
    .poll(() => page.evaluate(() => window.__benchworkMemory?.snapshot()['Lab/image.png']))
    .toBe('pixels');
  await expect(sidebar.getByRole('treeitem', { name: 'image.png', exact: true })).toBeVisible();
  await transfer.dispose();
  await page.screenshot({ path: info.outputPath('sidebar-folders.png') });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.getByRole('button', { name: 'Show the sidebar', exact: true }).click();
  await expect(sidebar).toBeVisible();
  const pane = sidebar.locator('.notebook-pane');
  const areaBefore = await pane.boundingBox();
  const grip = await sizing.boundingBox();
  if (!grip || !areaBefore) throw new Error('Notebook sizing controls missing');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 - 60, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await pane.boundingBox())?.height ?? 0)
    .toBeLessThan(areaBefore.height - 40);
  await sidebar.screenshot({ path: info.outputPath('sidebar-tablet.png') });
});
