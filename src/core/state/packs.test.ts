// @vitest-environment node
import { createContributions } from '../modules/contributions';
import { PACKS } from '../modules/packs';
import { ModuleRegistry } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from './appStore';

async function vault(contents: Record<string, string | null>) {
  const events: string[] = [];
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  const registry = new ModuleRegistry(
    [
      fakeModule('notes', events),
      fakeModule('plans', events, { manifest: { dependsOn: ['notes'] } }),
      fakeModule('desk', events, { manifest: { platforms: ['tablet'], name: 'Desk only' } }),
    ],
    [],
    { platform, device: 'desktop', contributions: createContributions() },
  );
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('new');
  return { platform, state: () => store.getState(), events };
}

describe('module packs', () => {
  it('are offered when a vault is set up, not when one is opened', async () => {
    expect((await vault({})).state().choosingPack).toBe(true);
    expect((await vault({ '.benchwork/config.json': '{"version":1}' })).state().choosingPack).toBe(
      false,
    );
  });

  it('switch on their modules and what those need, leaving out what the device cannot run', async () => {
    const { state, platform } = await vault({});
    const left = await state().enablePack(['plans', 'desk']);
    expect(left).toEqual(['Desk only']);
    const on = state()
      .modules.modules.filter((m) => m.status === 'on')
      .map((m) => m.manifest.id);
    expect(on.sort()).toEqual(['notes', 'plans']);
    const config = JSON.parse(platform.snapshot()['.benchwork/config.json'] ?? '{}') as {
      modules: Record<string, { enabled: boolean }>;
    };
    expect(config.modules['plans']?.enabled).toBe(true);
    expect(config.modules['notes']?.enabled).toBe(true);
  });

  it('name only modules that exist in BenchWork', () => {
    const ids = PACKS.flatMap((p) => p.modules);
    const manifests = import.meta.glob<{ id: string }>('../../modules/*/manifest.json', {
      eager: true,
      import: 'default',
    });
    const known = new Set(Object.values(manifests).map((m) => m.id));
    expect(ids.filter((id) => !known.has(id))).toEqual([]);
  });
});
