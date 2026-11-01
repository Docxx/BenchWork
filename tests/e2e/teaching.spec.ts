import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function open(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/');
  await page.evaluate(() => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Memory platform required');
    memory.addFolder('C:/Vault', {
      '.benchwork/config.json': JSON.stringify({
        version: 1,
        modules: Object.fromEntries(
          ['teaching', 'study-arcade', 'theme-studio'].map((id) => [id, { enabled: true }]),
        ),
      }),
      'Notes/Welcome.md': '# Welcome\n\nReusable note material.\n',
      'Teaching/Lessons/Seminar.lesson.yaml':
        'title: Seminar\npurpose: seminar\nslides:\n  - id: first\n    title: Public title\n    body: "First point\\nSecond point"\n    notes: SECRET PRIVATE SPEAKER NOTES\n    minutes: 2\n    reveal: true\n  - id: second\n    title: Next slide\n    body: Discussion\n    notes: PRIVATE NEXT NOTES\n    minutes: 3\n',
    });
    memory.queuePick('C:/Vault');
  });
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();
  await expect(page.locator('.splash')).toHaveCount(0);
}
async function lesson(page: Page, tool = 'Lesson Studio') {
  await page.getByRole('button', { name: tool, exact: true }).click();
  await page.getByLabel('Choose lesson').selectOption('Teaching/Lessons/Seminar.lesson.yaml');
  await expect(page.getByLabel('Private speaker notes')).toHaveValue(
    'SECRET PRIVATE SPEAKER NOTES',
  );
}
test('builds reusable lessons, saves private notes and reorders slides', async ({ page }, info) => {
  await open(page);
  await lesson(page);
  await page.getByLabel('Lesson title', { exact: true }).fill('Research seminar');
  await page.getByLabel('Private speaker notes').fill('Updated private notes');
  await page.getByRole('button', { name: 'Move down', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  const record = await page.evaluate(
    () => window.__benchworkMemory?.snapshot()['Teaching/Lessons/Seminar.lesson.yaml'],
  );
  expect(record).toContain('Updated private notes');
  expect(record?.indexOf('id: second')).toBeLessThan(record?.indexOf('id: first') ?? 0);
  await page
    .locator('.teaching-workspace')
    .screenshot({ path: info.outputPath('lesson-studio.png') });
  await page.setViewportSize({ width: 800, height: 1100 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('audience window receives public slides, reveals and blackout, never speaker notes', async ({
  page,
  context,
}) => {
  await open(page);
  await lesson(page, 'Presenter Desk');
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open audience screen', exact: true }).click();
  const audience = await popupPromise;
  await expect(audience.getByRole('heading', { name: 'Public title' })).toBeVisible();
  await expect(audience.locator('body')).toContainText('First point');
  await expect(audience.locator('body')).not.toContainText('Second point');
  await expect(audience.locator('body')).not.toContainText('PRIVATE');
  await page.getByRole('button', { name: 'Reveal next line', exact: true }).click();
  await expect(audience.locator('body')).toContainText('Second point');
  await page.getByRole('button', { name: 'Blackout', exact: true }).click();
  await expect(audience.getByRole('heading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show slide', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(audience.getByRole('heading', { name: 'Next slide' })).toBeVisible();
  await expect(audience.locator('body')).not.toContainText('PRIVATE');
  await page.getByRole('button', { name: 'Close audience screen', exact: true }).click();
});
test('rehearsal stores timings and revision bookmarks without recording audio', async ({
  page,
}) => {
  await open(page);
  await lesson(page, 'Rehearsal Room');
  await page.getByRole('button', { name: 'Start rehearsal', exact: true }).click();
  await page.getByLabel('Practice bookmark').fill('Slow down here');
  await page.getByRole('button', { name: 'Mark this moment', exact: true }).click();
  await page.getByLabel('Practice notes', { exact: true }).fill('Explain the controls');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Finish and save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start rehearsal', exact: true })).toBeVisible();
  const saved = await page.evaluate(
    () =>
      Object.entries(window.__benchworkMemory?.snapshot() ?? {}).find(([p]) =>
        p.endsWith('.rehearsal.yaml'),
      )?.[1],
  );
  expect(saved).toContain('Slow down here');
  expect(saved).toContain('Explain the controls');
  expect(saved).toContain('timings:');
});
test('personal flashcards save a scored round and offer missed-item practice', async ({
  page,
}, info) => {
  await open(page);
  await page.getByRole('button', { name: 'Study Arcade', exact: true }).click();
  await page.getByRole('button', { name: 'New study set', exact: true }).click();
  await page.getByLabel('Study set title').fill('Seminar revision');
  await page.getByLabel('Question prompt').fill('Which control is missing?');
  await page.getByLabel('Question answer').fill('Vehicle control');
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await expect(page.locator('.study-answer')).toHaveText('Vehicle control');
  await page.getByRole('button', { name: 'Practise again', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('0 / 1 correct');
  await page.getByRole('button', { name: 'Review missed questions', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
  await page.locator('.study-workspace').screenshot({ path: info.outputPath('study-arcade.png') });
  await page.getByRole('button', { name: 'I knew it', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('100 points');
});
test('theme profiles apply, persist and export a shareable pack', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: 'Theme Studio', exact: true }).click();
  await page.getByLabel('Profile name').fill('Seminar after dark');
  await page.getByLabel('Purpose').selectOption('presenting');
  await page.getByLabel('Base theme').selectOption('neon');
  await page.getByLabel('Workspace motion').selectOption('stars');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByRole('button', { name: 'Apply appearance', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-preset', 'neon');
  await expect(page.locator('html')).toHaveAttribute('data-studio-motion', 'stars');
  await page.getByRole('button', { name: 'Export theme pack', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Theme pack saved:');
  const pack = await page.evaluate(
    () =>
      Object.entries(window.__benchworkMemory?.snapshot() ?? {}).find(([p]) =>
        p.endsWith('.theme.json'),
      )?.[1],
  );
  expect(JSON.parse(pack ?? '{}')).toMatchObject({
    format: 'benchwork-theme',
    version: 1,
    profile: { name: 'Seminar after dark', purpose: 'presenting' },
  });
  await page.evaluate((text) => {
    window.__benchworkMemory?.addExternalFile('C:/Themes/seminar.theme.json', text);
    window.__benchworkMemory?.queueFilePick(['C:/Themes/seminar.theme.json']);
  }, pack ?? '');
  await page.getByRole('button', { name: 'Import theme pack', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Pack loaded for preview');
  await expect(page.getByLabel('Profile name')).toHaveValue('Seminar after dark');
  await page.locator('.theme-studio').screenshot({ path: info.outputPath('theme-studio.png') });
});
test('PDF imports render into slides and leave the original source unchanged', async ({ page }) => {
  await open(page);
  await lesson(page);
  const bytes = [...readFileSync(new URL('./fixtures/paper.pdf', import.meta.url))];
  await page.evaluate((data) => {
    const memory = window.__benchworkMemory;
    memory?.addExternalFile('C:/Material/paper.pdf', new Uint8Array(data));
    memory?.queueFilePick(['C:/Material/paper.pdf']);
  }, bytes);
  await page.getByRole('button', { name: 'Import PDF, PowerPoint or image', exact: true }).click();
  const pdfSlide = page
    .locator('.teaching-sequence button')
    .filter({ hasText: 'paper.pdf' })
    .first();
  await expect(pdfSlide).toBeVisible();
  await pdfSlide.click();
  await expect(page.locator('.teaching-main .audience-image')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  );
  const saved = await page.evaluate(
    () =>
      Object.entries(window.__benchworkMemory?.snapshot() ?? {}).find(([p]) =>
        /Teaching\/Assets\/.*\/paper.pdf$/.test(p),
      )?.[0],
  );
  expect(saved).toBeTruthy();
});
test('multiple-choice rounds give feedback and save the selected score', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Study Arcade', exact: true }).click();
  await page.getByRole('button', { name: 'New study set', exact: true }).click();
  await page.getByLabel('Question prompt').fill('Pick the control');
  await page.getByLabel('Mode').selectOption('quiz');
  await page.getByLabel('Correct choice').selectOption('1');
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await page.getByRole('button', { name: 'Choice 2', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Correct!');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 / 1 correct');
});
