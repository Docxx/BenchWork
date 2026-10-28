import { expect, test, type Page } from '@playwright/test';

/**
 * The Analysis bridge: a script run on a dataset, with a stand-in for
 * Python that writes a result file as a real script would.
 */

const VAULT = {
  '.benchwork/config.json': JSON.stringify({
    version: 1,
    modules: { research: { enabled: true }, analysis: { enabled: true } },
  }),
  'Data/day7.dataset.yaml': 'id: d7\nfiles:\n  - path: Data/day7.csv\n',
  'Data/day7.csv': 'fly,height\n1,4\n',
};

async function snapshot(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => window.__benchworkMemory?.snapshot() ?? {});
}

test('a script is added, run on a dataset, and its results kept with the dataset', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate((files) => {
    const memory = window.__benchworkMemory;
    if (!memory) throw new Error('Run Playwright with VITE_PLATFORM=memory');
    memory.addFolder('C:/Vault', files);
    memory.usePrograms(async (run, vault) => {
      const output = run.args.at(-1)?.value ?? '';
      const inputs = run.args.filter((a) => a.kind === 'vault').map((a) => a.value);
      await vault.writeTextAtomic(`${output}/climbing.csv`, 'fly,mean\n1,4\n');
      return {
        code: 0,
        stdout: `read ${inputs.join(', ')}`,
        stderr: '',
        stopped: false,
      };
    });
    memory.queuePick('C:/Vault');
  }, VAULT);
  await page.getByRole('button', { name: 'Open vault' }).click();
  await expect(page.getByRole('tree', { name: 'Notebooks' })).toBeVisible();

  await page.keyboard.press('Control+k');
  const commands = page.getByRole('dialog', { name: 'Commands' });
  await commands.getByRole('textbox', { name: 'Find a command' }).fill('Run an analysis');
  await commands.getByRole('button', { name: 'Run an analysis' }).click();

  await page.getByRole('button', { name: 'Add a script' }).click();
  const form = page.getByRole('group', { name: 'New script' });
  await form.getByLabel('Name').fill('Buzzz');
  await form.getByLabel('Script file').fill('C:\\Scripts\\buzzz.py');
  await form.getByRole('button', { name: 'Save script' }).click();

  const run = page.getByRole('region', { name: 'Run a script' });
  await run.getByLabel('Dataset').selectOption({ label: 'day7' });
  await run.getByLabel('Script').selectOption({ label: 'Buzzz' });
  await run.getByRole('button', { name: 'Run' }).click();
  await expect(run.getByRole('status')).toContainText('Finished.');
  await expect(run.getByRole('list', { name: 'Results' })).toContainText('climbing.csv');

  const files = await snapshot(page);
  const folder = Object.keys(files).find(
    (p) => p.startsWith('Data/day7 Buzzz ') && !p.includes('/', 5),
  );
  expect(folder).toBeDefined();
  expect(files[`${folder ?? ''}/climbing.csv`]).toContain('fly,mean');
  expect(files[`${folder ?? ''}/run.log`]).toContain('read Data/day7.csv');
  expect(files['Data/day7.dataset.yaml']).toMatch(
    /analyses:\n\s+- script: Buzzz\n[\s\S]*result: done\n[\s\S]*outputs:\n\s+- climbing\.csv/,
  );
  // The dataset's own file is only read.
  expect(files['Data/day7.csv']).toBe('fly,height\n1,4\n');
});
