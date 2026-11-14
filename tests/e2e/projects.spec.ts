import { expect, test, type Page } from '@playwright/test';

async function projects(page: Page) {
  await page
    .locator('.nav-item')
    .filter({ hasText: /^Projects$/ })
    .click();
  await expect(page.getByRole('button', { name: 'Open project Alpha', exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Memory platform required');
    memory.addFolder('C:/Projects', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: { research: { enabled: true } },
      }),
      'Alpha/project.md': '---\ntype: project\naim: Test recovery\nstatus: active\n---\n# Alpha\n',
      'Alpha/Notes/Run.md':
        '# Run\n\n- [ ] Run the control\n- [x] Log the baseline\n\n```md\n- [ ] Example only\n```\n',
      'Alpha/Experiments/Pilot.md':
        '---\ntype: experiment\nproject: "[[Alpha/project]]"\n---\n# Pilot\n',
      'Alpha/Data/measurements.csv': 'Time,Value\n0,1\n',
      'Alpha/Nested/project.md': '---\ntype: project\n---\n# Nested\n',
      'Alpha/Nested/Private note.md': '# Nested only\n',
      'Beta/project.md': '---\ntype: project\nstatus: paused\n---\n# Beta\n',
      'Beta/Notes/Other.md': '# Beta only\n- [ ] Unrelated task\n',
      'Shared/Linked.md': '# Linked\n\n[[Alpha/project]]\n',
    });
    memory.queuePick('C:/Projects');
  });
  await page.getByRole('button', { name: 'Open vault' }).click();
});

test('a project groups its own notes, experiments, assets and checklist items', async ({
  page,
}) => {
  await projects(page);
  await expect(
    page
      .locator('.project-card')
      .filter({ has: page.getByRole('heading', { name: 'Alpha', exact: true }) }),
  ).toContainText('2 notes');
  await expect(page.getByRole('complementary', { name: 'Side panel', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Open project Alpha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha', exact: true })).toBeVisible();
  const notes = page.getByRole('list', { name: 'Project notes' });
  await expect(notes).toContainText('Run');
  await expect(notes).toContainText('Linked');
  await expect(notes).not.toContainText('Private note');
  await expect(notes).not.toContainText('Other');
  await page.getByRole('tab', { name: /^Notes/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /^Experiments/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('list', { name: 'Project experiments' })).toContainText('Pilot');
  await page.getByRole('tab', { name: /^Files/ }).click();
  await expect(page.getByRole('list', { name: 'Project files' })).toContainText('measurements.csv');
  await page.getByRole('tab', { name: /^Tasks/ }).click();
  const tasks = page.getByRole('list', { name: 'Project tasks' });
  await expect(tasks).toContainText('Run the control');
  await expect(tasks).toContainText('Log the baseline');
  await expect(tasks).not.toContainText('Unrelated task');
  await expect(tasks).not.toContainText('Example only');
  await tasks.getByRole('button', { name: 'Run the control Run', exact: true }).click();
  await expect(page.locator('.page-editor')).toContainText('Run the control');
  await expect(page.getByRole('complementary', { name: 'Side panel', exact: true })).toBeVisible();
  await page.locator('.page-chrome').getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha', exact: true })).toBeVisible();
});

test('new projects and notes use ordinary vault folders and explicit project links', async ({
  page,
}) => {
  await projects(page);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('form', { name: 'New project' }).getByLabel('Project name').fill('Gamma');
  await page
    .getByRole('form', { name: 'New project' })
    .getByLabel('Aim')
    .fill('Compare two methods');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gamma', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await page.getByRole('textbox', { name: 'Note name' }).fill('First observations');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.locator('.page-editor')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__benchworkMemory?.snapshot()['Gamma/Notes/First observations.md'] ?? '',
      ),
    )
    .toContain('project:');
  const files = await page.evaluate(() => window.__benchworkMemory?.snapshot() ?? {});
  expect(files['Gamma/Notes']).toBeNull();
  expect(files['Gamma/Experiments']).toBeNull();
  expect(files['Gamma/Data']).toBeNull();
  expect(files['Gamma/project.md']).toContain('Compare two methods');
  expect(files['Gamma/Notes/First observations.md']).toContain('[[Gamma/project]]');
});

test('module cards retain filters, switches and saved enablement', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Modules', exact: true }).click();
  await expect(page.locator('.module-icon').first()).toBeVisible();
  await page.getByLabel('Search modules').fill('figures');
  await expect(page.locator('.module-list .module')).toHaveCount(1);
  const card = page.locator('.module-list .module').first();
  await expect(card).toContainText('Figures');
  await card.getByRole('switch').click();
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Module status').selectOption('off');
  await expect(page.locator('.module-list .module')).toHaveCount(0);
  await page.getByLabel('Module status').selectOption('on');
  await expect(card).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.__benchworkMemory?.snapshot()['.benchwork/config.json'] ?? ''),
    )
    .toContain('"figures"');
  await page.setViewportSize({ width: 740, height: 1000 });
  const overflow = await page
    .locator('.settings')
    .evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(overflow).toBe(false);
});
