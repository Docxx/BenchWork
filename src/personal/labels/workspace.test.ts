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

it('sends labels the phone has not had, once each, and stops when there is no relay', async () => {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': {} } });
  await platform.setVaultRoot('C:/Vault');
  const sent: { id: string; name: string }[] = [];
  let available = false;
  const app = () =>
    ({
      cloudCards: () =>
        available
          ? {
              put: (_kind: string, id: string, value: { name: string }) => {
                sent.push({ id, name: value.name });
                return Promise.resolve();
              },
              get: () => Promise.resolve(null),
              list: () => Promise.resolve([]),
              remove: () => Promise.resolve(),
            }
          : null,
    }) as unknown as AppBridge;
  const handle = createModuleContext(manifest('labels'), {
    platform,
    device: 'desktop',
    contributions: createContributions(),
    app,
  });
  const library = labelWorkspace(handle.ctx);

  // Written straight into the vault, as Fly room's Make label does.
  const design = { ...newLabelDesign(), name: 'Vial label', savedAt: '2026-11-26T10:00:00.000Z' };
  await platform.ensureDir('Labels');
  await platform.writeTextAtomic(`Labels/${design.id}.label.json`, JSON.stringify(design));

  // No relay yet: reading the library sends nothing.
  await library.list();
  await vi.waitFor(() => {
    expect(sent).toEqual([]);
  });

  // Once the phone is connected, the label goes, and only once.
  available = true;
  await library.list();
  await vi.waitFor(() => {
    expect(sent.map((s) => s.name)).toEqual(['Vial label']);
  });
  await library.list();
  await library.list();
  await vi.waitFor(() => {
    expect(sent).toHaveLength(1);
  });

  // Changed on the desktop, so it goes again.
  await platform.writeTextAtomic(
    `Labels/${design.id}.label.json`,
    JSON.stringify({ ...design, name: 'Vial label, bigger', savedAt: '2026-11-26T11:00:00.000Z' }),
  );
  await library.list();
  await vi.waitFor(() => {
    expect(sent.map((s) => s.name)).toEqual(['Vial label', 'Vial label, bigger']);
  });
});
