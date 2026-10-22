// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { createContributions } from './contributions';
import { findBuiltInModules } from './loader';
import { ModuleRegistry } from './registry';

async function helloRegistry() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': '{"version":1}',
        'notes.md': 'keep me',
        'Data/run1.csv': 'a,b\n1,2',
      },
    },
  });
  await platform.setVaultRoot('C:/Vault');
  const { sources, broken } = findBuiltInModules();
  const registry = new ModuleRegistry(sources, broken, {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  return { platform, registry };
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('built-in Hello module', () => {
  it('ships with a valid manifest and is off by default', async () => {
    const { registry } = await helloRegistry();
    expect(registry.store.getState().broken).toEqual([]);
    expect(registry.get('hello')).toMatchObject({
      status: 'off',
      manifest: { name: 'Hello', defaultEnabled: false },
    });
  });

  it('adds its panel when on and removes it when off', async () => {
    const { registry } = await helloRegistry();
    await registry.enable(['hello']);
    expect(registry.get('hello')?.status).toBe('on');
    const [panel] = registry.contributions.getState().panels;
    expect(panel).toMatchObject({ id: 'hello.panel', title: 'Hello', moduleId: 'hello' });
    expect(panel?.render()).toContain('switched on once');

    await registry.disable(['hello']);
    expect(registry.contributions.getState().panels).toEqual([]);
  });

  it('counts in its own folder only, and keeps that data when switched off', async () => {
    const { platform, registry } = await helloRegistry();
    for (let i = 0; i < 3; i += 1) {
      await registry.enable(['hello']);
      await registry.disable(['hello']);
    }
    await registry.enable(['hello']);
    expect(registry.contributions.getState().panels[0]?.render()).toContain('4 times');

    expect(platform.snapshot()).toEqual({
      '.benchwork': null,
      '.benchwork/config.json': '{"version":1}',
      '.benchwork/modules': null,
      '.benchwork/modules/hello': null,
      '.benchwork/modules/hello/state.json': '{\n  "timesSwitchedOn": 4\n}\n',
      Data: null,
      'Data/run1.csv': 'a,b\n1,2',
      'notes.md': 'keep me',
    });
  });
});
