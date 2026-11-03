// @vitest-environment node
import { MemoryAdapter } from '@core/platform/memory';
import { createContributions } from '@core/modules/contributions';
import { createModuleContext } from '@core/modules/context';
import { manifest, quietLogger } from '@core/modules/testModules';
import { AnalysisSession, runOnDataset } from './run';
import type { Script } from './scripts';

const script: Script = {
  id: 's',
  name: 'Count',
  program: 'Rscript',
  script: 'Scripts/count.R',
  args: '{script} {files} {output} --threshold {param:threshold}',
  parameters: { threshold: '2' },
};
async function setup() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        'Data/day7.dataset.yaml': 'id: d7\nfiles: [Data/day7.csv]\n',
        'Data/day7.csv': 'x,y\n1,2\n',
        'Scripts/count.R': 'print("count")\n',
      },
    },
  });
  await platform.setVaultRoot('C:/Vault');
  platform.usePrograms(async (run, vault) => {
    if (run.args[0]?.value === '--version')
      return { code: 0, stdout: 'Rscript 4.5', stderr: '', stopped: false };
    const output = run.args[2]?.value ?? '';
    await vault.ensureDir(`${output}/nested`);
    await vault.writeTextAtomic(`${output}/nested/count.csv`, 'count\n2\n');
    return { code: 0, stdout: 'done', stderr: '', stopped: false };
  });
  const { ctx } = createModuleContext(manifest('analysis'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
    logger: quietLogger,
  });
  return { ctx, platform };
}

it('captures script, parameters, runtime and hashes and never reuses a result folder', async () => {
  const { ctx, platform } = await setup();
  const first = await runOnDataset(ctx, script, 'Data/day7.dataset.yaml', 'first');
  const second = await runOnDataset(ctx, script, 'Data/day7.dataset.yaml', 'second');
  expect(first.folder).not.toBe(second.folder);
  expect(first.outputs).toEqual(['nested/count.csv']);
  expect(await ctx.vault.readText(`${first.folder}/script.R`)).toBe('print("count")\n');
  const { data } = await ctx.vault.readRecord(first.record);
  expect(data).toMatchObject({
    status: 'done',
    runtime: 'Rscript 4.5',
    parameters: { threshold: '2' },
    scriptChanged: false,
    inputsAfter: [{ path: 'Data/day7.csv', changed: false }],
  });
  expect(data['scriptSha256']).toMatch(/^[a-f0-9]{64}$/);
  expect(data['inputs']).toMatchObject([{ path: 'Data/day7.csv' }]);
  expect(platform.snapshot()['Data/day7.csv']).toBe('x,y\n1,2\n');
  expect((await ctx.vault.readRecord('Data/day7.dataset.yaml')).data['analyses']).toHaveLength(2);
});

it('leaves a failed run record and log when the executable cannot start', async () => {
  const { ctx, platform } = await setup();
  if (!platform.programs) throw new Error('Missing runner');
  vi.spyOn(platform.programs, 'run').mockRejectedValue(new Error('Rscript is not installed'));
  await expect(runOnDataset(ctx, script, 'Data/day7.dataset.yaml', 'missing')).rejects.toThrow(
    'not installed',
  );
  const record = Object.keys(platform.snapshot()).find((p) => p.endsWith('.analysis.yaml')) ?? '';
  expect((await ctx.vault.readRecord(record)).data).toMatchObject({
    status: 'failed',
    error: 'Rscript is not installed',
  });
  expect(platform.snapshot()[`${record.slice(0, record.lastIndexOf('/'))}/run.log`]).toContain(
    'not installed',
  );
});

it('records when a script changed and safely preserves a selected external script', async () => {
  const { ctx, platform } = await setup();
  platform.addExternalFile('C:/Scripts/test.py', 'before');
  if (!platform.programs) throw new Error('Missing runner');
  vi.spyOn(platform.programs, 'run').mockImplementation(() => {
    platform.addExternalFile('C:/Scripts/test.py', 'after');
    return Promise.resolve({ code: 1, stdout: '', stderr: 'failure', stopped: false });
  });
  const run = await runOnDataset(
    ctx,
    { ...script, program: 'custom', script: 'C:/Scripts/test.py', args: '{script}' },
    'Data/day7.dataset.yaml',
    'changed',
  );
  expect((await ctx.vault.readRecord(run.record)).data).toMatchObject({
    status: 'failed',
    scriptChanged: true,
  });
  expect(await ctx.vault.readText(`${run.folder}/script.py`)).toBe('before');
});

it('waits for a stopped process and final provenance before closing the session', async () => {
  const { ctx, platform } = await setup();
  let finish: (() => void) | null = null;
  platform.usePrograms(
    () =>
      new Promise((resolve) => {
        finish = () => {
          resolve({ code: null, stdout: '', stderr: '', stopped: true });
        };
      }),
  );
  if (!platform.programs) throw new Error('Missing runner');
  vi.spyOn(platform.programs, 'stop').mockImplementation(() => {
    finish?.();
    return Promise.resolve();
  });
  // The context retains its runner object, so use the newly configured adapter.
  const handle = createModuleContext(manifest('analysis'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
    logger: quietLogger,
  });
  const session = new AnalysisSession(handle.ctx);
  const pending = session.run(
    { ...script, program: 'custom' },
    'Data/day7.dataset.yaml',
    'stop',
    {},
  );
  await vi.waitFor(() => {
    expect(finish).not.toBeNull();
  });
  await session.close();
  const outcome = await pending;
  expect((await ctx.vault.readRecord(outcome.record)).data['status']).toBe('stopped');
  await expect(session.run(script, 'Data/day7.dataset.yaml', 'late', {})).rejects.toThrow('Wait');
});
