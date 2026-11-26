// @vitest-environment node
import { newLabelDesign } from '@core/api';
import { MemoryAdapter } from '@core/platform/memory';
import { createModuleContext, type AppBridge } from '@core/modules/context';
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

it('gives each fly stock a lasting short code and link for QR labels', async () => {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        'Fly room/Stocks/w1118.flystock.yaml': 'id: abc\ngenotype: w[1118]\n',
        'Fly room/Stocks/Old.flystock.yaml': 'genotype: y w\ncode: 0123ABCD\n',
      },
    },
  });
  await platform.setVaultRoot('C:/Vault');
  const items = [
    {
      path: 'Fly room/Stocks/w1118.flystock.yaml',
      title: 'w1118',
      type: 'flystock',
      changed: null,
    },
    { path: 'Fly room/Stocks/Old.flystock.yaml', title: 'Old', type: 'flystock', changed: null },
  ];
  const handle = createModuleContext(manifest('labels'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
    app: () => ({ items: () => Promise.resolve(items) }) as unknown as AppBridge,
  });
  const library = labelWorkspace(handle.ctx);
  const [fresh, old] = (await library.records?.()) ?? [];
  expect(fresh?.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  expect(fresh?.link).toBe(`benchwork://s/${fresh?.code ?? ''}`);
  expect(fresh?.id).toBe('abc');
  expect(platform.snapshot()['Fly room/Stocks/w1118.flystock.yaml']).toContain(
    `code: ${fresh?.code ?? ''}`,
  );
  expect(old).toMatchObject({ code: '0123ABCD', link: 'benchwork://s/0123ABCD' });
  // Loading again keeps the same code, so printed labels still work.
  const again = (await library.records?.()) ?? [];
  expect(again[0]?.code).toBe(fresh?.code);
  handle.dispose();
});
