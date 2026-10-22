// @vitest-environment node
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { MemoryAdapter } from '../platform/memory';
import { VAULT_CONFIG_PATH } from '../vault/vaultConfig';
import { createAppStore } from './appStore';

function setup(
  folders: Record<string, Record<string, string | null>> = {},
  appSettings: unknown = null,
) {
  const platform = new MemoryAdapter({ folders, appSettings });
  const store = createAppStore(platform);
  return { platform, store, state: () => store.getState() };
}

async function lastVaultSaved(platform: MemoryAdapter): Promise<unknown> {
  return ((await platform.loadAppSettings()) as { lastVault?: unknown } | null)?.lastVault;
}

describe('app store: start-up', () => {
  it('shows the picker when no vault was opened before', async () => {
    const { state } = setup();
    expect(state().status.kind).toBe('starting');
    await state().start();
    expect(state().status.kind).toBe('no-vault');
    expect(state().notice).toBeNull();
  });

  it('reopens the last vault', async () => {
    const { state } = setup(
      { 'C:/Vault': { '.benchwork/config.json': '{"version":1}' } },
      { lastVault: 'C:/Vault' },
    );
    await state().start();
    const status = state().status;
    expect(status.kind).toBe('open');
    if (status.kind === 'open') expect(status.vault.root).toBe('C:/Vault');
  });

  it('corrects a remembered .benchwork folder to the vault it belongs to', async () => {
    const { platform, state } = setup(
      { 'C:/Docs': { '.benchwork/config.json': '{"version":1}', '.benchwork/.benchwork': null } },
      { lastVault: 'C:/Docs/.benchwork' },
    );
    await state().start();
    const status = state().status;
    expect(status.kind === 'open' && status.vault.root).toBe('C:/Docs');
    expect(await lastVaultSaved(platform)).toBe('C:/Docs');
  });

  it('explains when the last vault has gone', async () => {
    const { state } = setup({}, { lastVault: 'D:/USB stick/Vault' });
    await state().start();
    expect(state().status.kind).toBe('no-vault');
    expect(state().notice).toContain('D:/USB stick/Vault');
  });

  it('does not set up a folder that is no longer a vault without asking', async () => {
    const { platform, state } = setup({ 'C:/Old': { 'a.md': 'x' } }, { lastVault: 'C:/Old' });
    await state().start();
    expect(state().status.kind).toBe('no-vault');
    expect(state().notice).toContain('no longer set up as a vault');
    expect(platform.snapshot('C:/Old')).toEqual({ 'a.md': 'x' });
  });

  it('shows a clear message for a corrupt config', async () => {
    const { state } = setup(
      { 'C:/Vault': { [VAULT_CONFIG_PATH]: '{broken' } },
      { lastVault: 'C:/Vault' },
    );
    await state().start();
    expect(state().status.kind).toBe('no-vault');
    expect(state().notice).toContain('vault settings could not be read');
  });
});

describe('app store: choosing a folder', () => {
  it('sets up an empty folder straight away and remembers it', async () => {
    const { platform, state } = setup({ 'C:/New': {} });
    await state().start();
    platform.queuePick('C:/New');
    await state().chooseFolder('new');

    expect(state().status.kind).toBe('open');
    expect(platform.snapshot('C:/New')).toHaveProperty([VAULT_CONFIG_PATH]);
    expect(await lastVaultSaved(platform)).toBe('C:/New');
  });

  it('opens an existing vault without asking', async () => {
    const { platform, state } = setup({ 'C:/Vault': { '.benchwork': null, 'a.md': 'x' } });
    await state().start();
    platform.queuePick('C:/Vault');
    await state().chooseFolder('open');
    expect(state().status.kind).toBe('open');
  });

  it('asks before using a folder that has files, then sets it up', async () => {
    const { platform, state } = setup({ 'C:/Thesis': { 'chapter 1.docx': 'draft' } });
    await state().start();
    platform.queuePick('C:/Thesis');
    await state().chooseFolder('open');

    expect(state().status).toEqual({ kind: 'confirm-folder', root: 'C:/Thesis' });
    expect(platform.snapshot('C:/Thesis')).toEqual({ 'chapter 1.docx': 'draft' });

    await state().confirmFolder();
    expect(state().status.kind).toBe('open');
    expect(platform.snapshot('C:/Thesis')['chapter 1.docx']).toBe('draft');
  });

  it('leaves the folder untouched when the user cancels', async () => {
    const { platform, state } = setup({ 'C:/Thesis': { 'chapter 1.docx': 'draft' } });
    await state().start();
    platform.queuePick('C:/Thesis');
    await state().chooseFolder('open');
    state().cancelFolder();

    expect(state().status.kind).toBe('no-vault');
    expect(platform.snapshot('C:/Thesis')).toEqual({ 'chapter 1.docx': 'draft' });
    expect(await lastVaultSaved(platform)).toBeUndefined();
  });

  describe('a folder inside another vault', () => {
    const docs = { '.benchwork/config.json': '{"version":1}', 'Test Vault/notes.md': 'x' };

    async function pickTestVault() {
      const ctx = setup({ 'C:/Docs': docs });
      await ctx.state().start();
      ctx.platform.queuePick('C:/Docs/Test Vault');
      await ctx.state().chooseFolder('new');
      return ctx;
    }

    it('asks which vault is meant, without changing anything yet', async () => {
      const { platform, state } = await pickTestVault();
      expect(state().status).toEqual({
        kind: 'confirm-nested',
        folder: 'C:/Docs/Test Vault',
        owner: 'C:/Docs',
      });
      expect(platform.snapshot('C:/Docs')).toEqual({
        '.benchwork': null,
        ...docs,
        'Test Vault': null,
      });
    });

    it('can open the vault around it', async () => {
      const { platform, state } = await pickTestVault();
      await state().openOwnerVault();
      const status = state().status;
      expect(status.kind === 'open' && status.vault.root).toBe('C:/Docs');
      expect(platform.snapshot('C:/Docs/Test Vault')).toEqual({ 'notes.md': 'x' });
    });

    it('can become a separate vault, which is then reopened at start-up', async () => {
      const { platform, state } = await pickTestVault();
      await state().makeSeparateVault();
      const status = state().status;
      expect(status.kind === 'open' && status.vault.root).toBe('C:/Docs/Test Vault');
      expect(Object.keys(platform.snapshot('C:/Docs/Test Vault'))).toEqual([
        '.benchwork',
        '.benchwork/config.json',
        'notes.md',
      ]);
      expect(await lastVaultSaved(platform)).toBe('C:/Docs/Test Vault');

      const again = createAppStore(platform);
      await again.getState().start();
      const reopened = again.getState().status;
      expect(reopened.kind === 'open' && reopened.vault.root).toBe('C:/Docs/Test Vault');
    });

    it('cancel leaves everything as it was', async () => {
      const { platform, state } = await pickTestVault();
      state().cancelFolder();
      expect(state().status.kind).toBe('no-vault');
      expect(platform.snapshot('C:/Docs/Test Vault')).toEqual({ 'notes.md': 'x' });
    });
  });

  it('does nothing when the picker is cancelled', async () => {
    const { platform, state } = setup();
    await state().start();
    platform.queuePick(null);
    await state().chooseFolder('open');
    expect(state().status.kind).toBe('no-vault');
    expect(state().notice).toBeNull();
  });

  it('ignores a second click while busy', async () => {
    const { platform, state } = setup({ 'C:/A': {}, 'C:/B': {} });
    await state().start();
    platform.queuePick('C:/A', 'C:/B');
    await Promise.all([state().chooseFolder('new'), state().chooseFolder('new')]);
    const status = state().status;
    expect(status.kind === 'open' && status.vault.root).toBe('C:/A');
    expect(platform.snapshot('C:/B')).toEqual({});
  });

  it('switching vault closes the current one but remembers it', async () => {
    const { platform, state } = setup({ 'C:/A': {} });
    await state().start();
    platform.queuePick('C:/A');
    await state().chooseFolder('new');
    await state().closeVault();
    expect(state().status.kind).toBe('no-vault');
    expect(state().settings.lastVault).toBe('C:/A');
  });
});

describe('app store: modules', () => {
  it('starts the modules a vault has on when it opens, and stops them on close', async () => {
    const events: string[] = [];
    const platform = new MemoryAdapter({
      folders: {
        'C:/Vault': {
          [VAULT_CONFIG_PATH]: JSON.stringify({
            version: 1,
            modules: { hello: { enabled: true } },
          }),
          'notes.md': 'keep me',
        },
      },
    });
    const registry = new ModuleRegistry([fakeModule('hello', events)], [], {
      platform,
      device: 'desktop',
      contributions: createContributions(),
    });
    const store = createAppStore(platform, registry);
    await store.getState().start();
    platform.queuePick('C:/Vault');
    await store.getState().chooseFolder('open');
    expect(registry.get('hello')?.status).toBe('on');

    await store.getState().closeVault();
    expect(registry.get('hello')?.status).toBe('off');
    expect(events).toEqual(['activate hello', 'deactivate hello', 'dispose hello']);
    expect(platform.snapshot('C:/Vault')['notes.md']).toBe('keep me');
  });
});
