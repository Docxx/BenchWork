// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { createContributions } from './contributions';
import { findBuiltInModules } from './loader';
import { ModuleRegistry } from './registry';

async function builtInRegistry() {
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

describe('built-in modules', () => {
  it('all ship with valid manifests, and are off by default', async () => {
    const { registry } = await builtInRegistry();
    expect(registry.store.getState().broken).toEqual([]);
    const all = registry.store.getState().modules;
    expect(all.length).toBeGreaterThan(5);
    expect(all.every((m) => m.status === 'off')).toBe(true);
  });

  it('add what they show when on, take it away when off, and leave files alone', async () => {
    const { platform, registry } = await builtInRegistry();
    const before = platform.snapshot();
    await registry.enable(['mind-maps']);
    expect(registry.get('mind-maps')?.status).toBe('on');
    expect(registry.contributions.getState().pageViews.map((v) => v.id)).toContain(
      'mind-maps.canvases',
    );

    await registry.disable(['mind-maps']);
    expect(registry.contributions.getState().pageViews).toEqual([]);
    expect(platform.snapshot()).toEqual(before);
  });
});
