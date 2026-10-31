import { expect, test, type Page } from '@playwright/test';

const EXP = 'Research/Experiments/Pilot.md';
const SCOPE = 'Research/Equipment/Scope.equipment.yaml';
const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: Object.fromEntries(
      [
        'research',
        'protocol-runner',
        'sample-tracker',
        'equipment-planner',
        'research-questions',
        'meeting-organiser',
        'lab-notebook',
        'lab-tools',
        'tasks',
        'planner',
      ].map((id) => [id, { enabled: true }]),
    ),
  }),
  [EXP]:
    '---\nid: exp-pilot\ntype: experiment\nstatus: planned\naim: Compare experimental conditions\n---\n## Notes\n\n',
  [SCOPE]: 'id: scope-1\nstatus: ready\nlocation: Room 3\n',
  'Research/Bookings/Occupied.booking.yaml': `id: booked-1\nequipment: '[[${SCOPE}]]'\nstart: 2026-11-01T09:00\nend: 2026-11-01T10:00\nstatus: reserved\n`,
};
async function tool(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Vault' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function choose(page: Page, label: string, path: string) {
  await page.getByRole('combobox', { name: label, exact: true }).selectOption(path);
}
async function selectRecord(page: Page, name: string) {
  await page
    .locator('.workflow-list-item')
    .filter({ has: page.locator('strong', { hasText: name }) })
    .first()
    .click();
}
async function file(page: Page, path: string) {
  return page.evaluate((p) => window.__benchworkMemory?.snapshot()[p] ?? null, path);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((files) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Missing memory adapter');
    memory.addFolder('C:/Vault', files);
    memory.queuePick('C:/Vault');
  }, VAULT);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.locator('.splash')).toHaveCount(0);
});

test('an experiment hub brings samples, aliquots and notes together on desktop and tablet', async ({
  page,
}, testInfo) => {
  await tool(page, 'Experiment Hub');
  await page.getByRole('button', { name: 'New experiment', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Connected experiment');
  await page.getByLabel('Aim', { exact: true }).fill('Compare conditions and trace samples');
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(
    page.getByRole('heading', { name: 'Connected experiment', exact: true }),
  ).toBeVisible();
  const experiment = 'Research/Experiments/Connected experiment.md';
  await tool(page, 'Sample Tracker');
  await page.getByRole('button', { name: 'New sample', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Sample A');
  await choose(page, 'Experiment', experiment);
  await page.getByLabel('Storage location', { exact: true }).fill('Freezer A / box 2 / B4');
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('heading', { name: 'Sample A', exact: true })).toBeVisible();
  await page.getByLabel('Number of aliquots').fill('2');
  await page.getByRole('button', { name: 'Create aliquots' }).click();
  await expect
    .poll(async () => (await page.locator('.workflow-list-item strong').allTextContents()).sort())
    .toEqual(['Sample A', 'Sample A aliquot 1', 'Sample A aliquot 2']);
  await tool(page, 'Experiment Hub');
  await selectRecord(page, 'Connected experiment');
  await expect(page.getByRole('region', { name: 'Connected records' })).toContainText('Sample A');
  await page.screenshot({ path: testInfo.outputPath('experiment-hub-desktop.png') });
  await page.setViewportSize({ width: 800, height: 1100 });
  await expect(
    page.getByRole('heading', { name: 'Connected experiment', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('experiment-hub-tablet.png') });
});

test('protocols become timed runs with saved observations, repeats and approved date changes', async ({
  page,
}) => {
  await tool(page, 'Protocol Runner');
  await page.getByRole('button', { name: 'New protocol template', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Assay');
  await page
    .getByLabel('Instructions (one step per line)', { exact: true })
    .fill('Prepare samples\nCollect measurements');
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('heading', { name: 'Assay', exact: true })).toBeVisible();
  await page.getByLabel('Timer minutes', { exact: true }).first().fill('1');
  await page.getByRole('button', { name: 'Save steps', exact: true }).click();
  await page.getByRole('button', { name: 'Start a run from this protocol' }).click();
  await choose(page, 'Experiment', EXP);
  await page.getByLabel('Run name', { exact: true }).fill('Trial');
  await page.getByLabel('Start date', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: 'Create run' }).click();
  await expect(page.getByRole('heading', { name: 'Trial', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Complete Prepare samples' }).check();
  await page.getByLabel('Deviations and observations').first().fill('Used a fresh preparation');
  await page.getByRole('button', { name: 'Save steps', exact: true }).click();
  await expect
    .poll(() => file(page, 'Research/Runs/Trial.run.yaml'))
    .toContain('Used a fresh preparation');
  await page.getByRole('button', { name: 'Start 1 min timer' }).click();
  await tool(page, 'Home');
  await expect(page.getByRole('timer', { name: 'Prepare samples timer' })).toBeVisible();
  await tool(page, 'Protocol Runner');
  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  await selectRecord(page, 'Trial');
  await page.getByLabel('Proposed start', { exact: true }).fill('2026-11-04');
  await page.getByRole('button', { name: 'Review affected work' }).click();
  expect(await file(page, 'Research/Runs/Trial.run.yaml')).toContain('2026-11-01');
  await page.getByRole('button', { name: 'Apply reviewed changes' }).click();
  await expect.poll(() => file(page, 'Research/Runs/Trial.run.yaml')).toContain('2026-11-04');
  await page.getByRole('button', { name: 'Carry unfinished steps' }).click();
  await expect(page.getByRole('heading', { name: 'Trial repeat', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Complete Prepare samples' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare with Trial' }).click();
  await expect(page.getByLabel('Run comparison')).toContainText('Collect measurements');
});

test('equipment booking clashes are rejected and suggestions remain editable before saving', async ({
  page,
}) => {
  await tool(page, 'Equipment Planner');
  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  await page.getByRole('button', { name: 'New booking' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Imaging session');
  await choose(page, 'Equipment', SCOPE);
  await choose(page, 'Experiment', EXP);
  await page.getByLabel('Start', { exact: true }).fill('2026-11-01T09:30');
  await page.getByLabel('End', { exact: true }).fill('2026-11-01T10:30');
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('alert')).toContainText('Overlaps Occupied');
  await page.getByRole('button', { name: 'Suggest available time' }).click();
  await expect(page.getByLabel('Start', { exact: true })).toHaveValue('2026-11-01T10:00');
  expect(await file(page, 'Research/Bookings/Imaging session.booking.yaml')).toBeNull();
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('heading', { name: 'Imaging session', exact: true })).toBeVisible();
  expect(await file(page, 'Research/Bookings/Occupied.booking.yaml')).toContain('2026-11-01T09:00');
});

test('questions and meetings link evidence and produce follow-up tasks without duplicates', async ({
  page,
}) => {
  await tool(page, 'Research Questions');
  await page.getByRole('button', { name: 'New question', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Mechanism');
  await page.getByLabel('Question', { exact: true }).fill('What changes behaviour?');
  await choose(page, 'Experiments', EXP);
  await page.getByLabel('Next test', { exact: true }).fill('Repeat with controls');
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('heading', { name: 'Mechanism', exact: true })).toBeVisible();
  await tool(page, 'Meeting Organiser');
  await page.getByRole('button', { name: 'New meeting', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Supervisor review');
  await choose(page, 'Experiments', EXP);
  await choose(page, 'Questions', 'Research/Questions/Mechanism.question.yaml');
  await page.getByLabel('Decisions', { exact: true }).fill('Repeat using matched controls');
  await page
    .getByLabel('Follow-ups (one per line)', { exact: true })
    .fill('Order materials\nReview control data');
  await choose(page, 'Send follow-ups to', EXP);
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByRole('heading', { name: 'Supervisor review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare agenda from linked research' }).click();
  await expect
    .poll(() => file(page, 'Research/Meetings/Supervisor review.meeting.yaml'))
    .toContain('Mechanism');
  await page.getByRole('button', { name: 'Create follow-up tasks' }).click();
  await expect.poll(() => file(page, EXP)).toContain('Order materials');
  await page.getByRole('button', { name: 'Create follow-up tasks' }).click();
  expect((await file(page, EXP))?.match(/Order materials/g)).toHaveLength(1);
  await tool(page, 'Tasks');
  await expect(page.getByRole('main')).toContainText('Review control data');
  await tool(page, 'Experiment Hub');
  await selectRecord(page, 'Pilot');
  await expect(page.getByRole('region', { name: 'Connected records' })).toContainText(
    'Supervisor review',
  );
});
