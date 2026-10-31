import { expect, test } from '@playwright/test';

/** Tasks on the planner's chart: subtasks, waiting, the critical path, and dragging. */

const PLAN = [
  '# Thesis plan',
  '',
  '- [ ] Thesis',
  '  - [ ] Design 🆔 d1 🛫 2026-11-02 📅 2026-11-04',
  '  - [ ] Build ⛔ d1 🆔 b1 🛫 2026-11-05 📅 2026-11-12 @Sam',
  '  - [ ] Docs ⛔ d1 🛫 2026-11-05 📅 2026-11-06',
  '- [ ] Launch ⛔ b1 📅 2026-11-13 ⏫',
  '',
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((plan) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { tasks: { enabled: true }, planner: { enabled: true } },
      }),
      'Thesis/Plan.md': plan,
    });
    memory.queuePick('C:/Vault');
  }, PLAN);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name: 'Planner' })
    .click();
});

async function plan(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => window.__benchworkMemory?.snapshot()['Thesis/Plan.md'] ?? '');
}

test('tasks show as bars under their whole, and the critical path is marked', async ({ page }) => {
  const chart = page.getByRole('region', { name: 'Chart' });
  // The thesis spans its parts; its parts sit under it.
  await expect(
    chart.getByRole('button', { name: /^Thesis, 2 Nov 2026 to 12 Nov 2026$/ }),
  ).toHaveClass(/summary/);
  await expect(chart.locator('.gantt-arrows > path')).toHaveCount(3);
  await page.getByLabel('Critical path').check();
  for (const name of ['Design', 'Build', 'Launch']) {
    await expect(chart.getByRole('button', { name: new RegExp(`^${name},`) })).toHaveClass(
      /critical/,
    );
  }
  await expect(chart.getByRole('button', { name: /^Docs,/ })).not.toHaveClass(/critical/);

  // Folding the thesis hides its parts.
  await chart.getByRole('button', { name: 'Fold Thesis' }).click();
  await expect(chart.getByRole('button', { name: /^Design,/ })).toHaveCount(0);
});

test('dragging a task writes its dates, and pushes back what waits for it', async ({ page }) => {
  await page.getByRole('radio', { name: 'Days' }).click();
  const chart = page.getByRole('region', { name: 'Chart' });
  const design = chart.getByRole('button', { name: /^Design,/ });
  await design.scrollIntoViewIfNeeded();
  const box = await design.boundingBox();
  if (box === null) throw new Error('No bar');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Two days later, at 40 pixels a day.
  await page.mouse.move(from.x + 80, from.y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => plan(page)).toContain('Design 🆔 d1 🛫 2026-11-04 📅 2026-11-06');
  // Build and Docs waited for it, so they start the day after; Launch waits for Build.
  await expect.poll(() => plan(page)).toContain('🛫 2026-11-07 📅 2026-11-14');
  await expect.poll(() => plan(page)).toContain('Docs ⛔ d1 🛫 2026-11-07 📅 2026-11-08');
  await expect.poll(() => plan(page)).toContain('Launch ⛔ b1 ⏫ 📅 2026-11-15');
});
