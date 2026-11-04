// @vitest-environment node
import { newLabelDesign } from '@core/api';
import { MemoryAdapter } from '@core/platform/memory';
import { createModuleContext } from '@core/modules/context';
import { createContributions } from '@core/modules/contributions';
import { manifest } from '@core/modules/testModules';
import { labelWorkspace } from './workspace';
it('keeps templates in ordinary vault files, preserves snapshots on replacement and survives module disposal', async () => {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': {} } });
  await platform.setVaultRoot('C:/Vault');
  const handle = createModuleContext(manifest('labels'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const library = labelWorkspace(handle.ctx),
    design = newLabelDesign();
  expect(await library.list()).toEqual([]);
  await library.createFolder?.('Fly stocks');
  expect(await library.folders?.()).toEqual(['Fly stocks']);
  await library.save(design);
  expect((await library.list())[0]?.name).toBe('Sample label');
  await library.save({
    ...design,
    name: 'Updated',
    folder: 'Fly stocks',
    data: { name: 'DrsGFP' },
  });
  expect((await library.list())[0]).toMatchObject({
    folder: 'Fly stocks',
    data: { name: 'DrsGFP' },
  });
  handle.dispose();
  expect(platform.snapshot()[`Labels/${design.id}.label.json`]).toContain('Updated');
  expect(
    Object.keys(platform.snapshot()).some((path) => path.startsWith('.benchwork/snapshots/')),
  ).toBe(true);
});
