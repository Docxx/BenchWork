// @vitest-environment node
import { createContributions } from '../modules/contributions';
import { ModuleRegistry, type ModuleSource } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import { VAULT_CONFIG_PATH } from '../vault/vaultConfig';
import { createAppStore } from './appStore';

const CONFIG = JSON.stringify({
  version: 1,
  modules: { kept: { enabled: true, note: 'from a newer build' } },
  attachments: { linkThresholdMB: 50 },
  sync: { provider: 'syncthing' },
});

async function openVault(
  sources: ModuleSource[] = [],
  folders: Record<string, MemoryFolderContents> = {},
) {
  const platform = new MemoryAdapter({
    folders: { 'C:/Vault': { [VAULT_CONFIG_PATH]: CONFIG, 'notes.md': 'keep me' }, ...folders },
  });
  const registry = new ModuleRegistry(sources, [], {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  await store.getState().start();
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, registry, store, state: () => store.getState() };
}

function savedConfig(platform: MemoryAdapter, root = 'C:/Vault'): Record<string, unknown> {
  return JSON.parse(platform.snapshot(root)[VAULT_CONFIG_PATH] ?? '{}') as Record<string, unknown>;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('settings', () => {
  it('opens and closes the Settings view only while a vault is open', async () => {
    const { state } = await openVault();
    state().showView('settings');
    expect(state().view).toBe('settings');
    await state().closeVault();
    expect(state().view).toBe('files');
    state().showView('settings');
    expect(state().view).toBe('files');
  });

  it('saves the theme per device, not in the vault', async () => {
    const { platform, state } = await openVault();
    await state().setTheme('dark');
    expect(state().settings.theme).toBe('dark');
    expect(await platform.loadAppSettings()).toMatchObject({ theme: 'dark' });
    expect(platform.snapshot()[VAULT_CONFIG_PATH]).toBe(CONFIG);
  });

  it('saves the link threshold in the vault, keeping keys it does not know', async () => {
    const { platform, state } = await openVault();
    await state().setLinkThreshold(200);
    const status = state().status;
    expect(status.kind === 'open' && status.vault.config.attachments.linkThresholdMB).toBe(200);
    expect(savedConfig(platform)).toEqual({
      version: 1,
      modules: { kept: { enabled: true, note: 'from a newer build' } },
      attachments: { linkThresholdMB: 200 },
      sync: { provider: 'syncthing' },
    });
  });

  it.each([0, -5, 1.5, Number.NaN, 100_001])('refuses a link threshold of %s', async (mb) => {
    const { platform, state } = await openVault();
    await state().setLinkThreshold(mb);
    expect(state().settingsError).toContain('whole number');
    expect(platform.snapshot()[VAULT_CONFIG_PATH]).toBe(CONFIG);
  });

  it('finishes saving before the vault closes, and never writes into the next vault', async () => {
    const { platform, state } = await openVault([], { 'C:/Other': {} });
    const saving = state().setLinkThreshold(75);
    await state().closeVault();
    await saving;
    platform.queuePick('C:/Other');
    await state().chooseFolder('new');
    expect(savedConfig(platform, 'C:/Other')).toMatchObject({
      attachments: { linkThresholdMB: 50 },
    });
    expect(savedConfig(platform, 'C:/Vault')).toMatchObject({
      attachments: { linkThresholdMB: 75 },
    });
  });
});

describe('module switches', () => {
  it('switches a module on and off and saves it in config.json', async () => {
    const events: string[] = [];
    const { platform, registry, state } = await openVault([fakeModule('hello', events)]);

    await state().setModuleEnabled('hello', true);
    expect(registry.get('hello')?.status).toBe('on');
    expect(state().modules.modules[0]?.status).toBe('on');
    expect(savedConfig(platform)['modules']).toEqual({
      kept: { enabled: true, note: 'from a newer build' },
      hello: { enabled: true },
    });

    await state().setModuleEnabled('hello', false);
    expect(registry.get('hello')?.status).toBe('off');
    expect(savedConfig(platform)['modules']).toMatchObject({ hello: { enabled: false } });
    expect(platform.snapshot()['notes.md']).toBe('keep me');
  });

  it('remembers switches the next time the vault opens', async () => {
    const { platform, state } = await openVault([fakeModule('hello', [])]);
    await state().setModuleEnabled('hello', true);
    await state().closeVault();
    platform.queuePick('C:/Vault');
    await state().chooseFolder('open');
    expect(state().modules.modules[0]?.status).toBe('on');
  });

  it('asks before also switching on what a module needs', async () => {
    const { platform, registry, state } = await openVault([
      fakeModule('manuscript', [], { manifest: { dependsOn: ['references'] } }),
      fakeModule('references', []),
    ]);
    await state().setModuleEnabled('manuscript', true);
    expect(state().pendingModuleChange).toEqual({
      id: 'manuscript',
      enable: true,
      ids: ['references', 'manuscript'],
    });
    expect(registry.get('manuscript')?.status).toBe('off');

    await state().confirmModuleChange();
    expect(state().pendingModuleChange).toBeNull();
    expect(registry.get('references')?.status).toBe('on');
    expect(registry.get('manuscript')?.status).toBe('on');
    expect(savedConfig(platform)['modules']).toMatchObject({
      references: { enabled: true },
      manuscript: { enabled: true },
    });
  });

  it('asks before also switching off modules that need it, and cancel changes nothing', async () => {
    const { platform, registry, state } = await openVault([
      fakeModule('manuscript', [], { manifest: { dependsOn: ['references'] } }),
      fakeModule('references', []),
    ]);
    await state().setModuleEnabled('manuscript', true);
    await state().confirmModuleChange();
    const before = platform.snapshot()[VAULT_CONFIG_PATH];

    await state().setModuleEnabled('references', false);
    expect(state().pendingModuleChange?.ids).toEqual(['manuscript', 'references']);
    state().cancelModuleChange();
    expect(state().pendingModuleChange).toBeNull();
    expect(registry.get('references')?.status).toBe('on');
    expect(platform.snapshot()[VAULT_CONFIG_PATH]).toBe(before);
  });

  it('explains why a module cannot be switched on', async () => {
    const { state } = await openVault([
      fakeModule('manuscript', [], { manifest: { dependsOn: ['references'] } }),
    ]);
    await state().setModuleEnabled('manuscript', true);
    expect(state().moduleNotice).toContain('not installed');
    expect(state().pendingModuleChange).toBeNull();
  });

  it('keeps a module that fails to start switched on in the config, so it is retried', async () => {
    const { platform, state } = await openVault([
      fakeModule('flaky', [], {
        activate: () => {
          throw new Error('Zotero is not running');
        },
      }),
    ]);
    await state().setModuleEnabled('flaky', true);
    expect(state().modules.modules[0]).toMatchObject({
      status: 'failed',
      error: 'Zotero is not running',
    });
    expect(savedConfig(platform)['modules']).toMatchObject({ flaky: { enabled: true } });
  });
});
