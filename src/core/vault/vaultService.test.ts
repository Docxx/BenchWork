// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { VAULT_CONFIG_PATH, VaultConfigError } from './vaultConfig';
import { checkFolder, initialiseVault, loadVaultConfig, saveVaultConfig } from './vaultService';

function adapterWith(folders: Record<string, Record<string, string | null>>): MemoryAdapter {
  return new MemoryAdapter({ folders });
}

describe('checkFolder', () => {
  it('tells vaults, empty folders and other folders apart', async () => {
    const platform = adapterWith({
      'C:/Vault': { '.benchwork': null },
      'C:/Empty': {},
      'C:/Thesis': { 'chapter 1.docx': 'x' },
    });
    expect(await checkFolder(platform, 'C:/Vault')).toEqual({ root: 'C:/Vault', kind: 'vault' });
    expect(await checkFolder(platform, 'C:/Empty')).toEqual({ root: 'C:/Empty', kind: 'empty' });
    expect(await checkFolder(platform, 'C:/Thesis')).toEqual({
      root: 'C:/Thesis',
      kind: 'folder',
    });
  });

  const docsVault = {
    '.benchwork/config.json': '{"version":1}',
    '.benchwork/.benchwork/Test': null,
    'LPS model/Data/run1.csv': 'a,b',
    'Test Vault': null,
  };

  it('resolves a .benchwork folder, or anything in it, to its vault', async () => {
    for (const picked of ['C:/Docs/.benchwork', 'C:/Docs/.benchwork/.benchwork/Test']) {
      const platform = adapterWith({ 'C:/Docs': docsVault });
      expect(await checkFolder(platform, picked)).toEqual({ root: 'C:/Docs', kind: 'vault' });
      expect(platform.snapshot('C:/Docs')).toEqual(
        adapterWith({ 'C:/Docs': docsVault }).snapshot('C:/Docs'),
      );
    }
  });

  it('reports an ordinary folder inside a vault, without changing anything', async () => {
    for (const picked of ['C:/Docs/Test Vault', 'C:/Docs/LPS model/Data']) {
      const platform = adapterWith({ 'C:/Docs': docsVault });
      expect(await checkFolder(platform, picked)).toEqual({
        kind: 'inside-vault',
        root: picked,
        owner: 'C:/Docs',
      });
      expect(platform.snapshot('C:/Docs')).toEqual(
        adapterWith({ 'C:/Docs': docsVault }).snapshot('C:/Docs'),
      );
    }
  });

  it('treats a separate vault inside another vault as its own vault', async () => {
    const platform = adapterWith({
      'C:/Docs': { ...docsVault, 'Test Vault/.benchwork/config.json': '{"version":1}' },
    });
    expect(await checkFolder(platform, 'C:/Docs/Test Vault')).toEqual({
      kind: 'vault',
      root: 'C:/Docs/Test Vault',
    });
  });

  it('fails for a folder that does not exist', async () => {
    await expect(checkFolder(new MemoryAdapter(), 'C:/Gone')).rejects.toMatchObject({
      kind: 'NotFound',
    });
  });
});

describe('initialiseVault', () => {
  it('adds only .benchwork/config.json and leaves existing files alone', async () => {
    const existing = {
      'chapter 1.docx': 'draft',
      'Data/run1.csv': 'a,b\n1,2',
      'Data/empty': null,
    };
    const platform = adapterWith({ 'C:/Thesis': existing });
    await checkFolder(platform, 'C:/Thesis');
    const before = platform.snapshot();

    await initialiseVault(platform);

    const after = platform.snapshot();
    const added = Object.keys(after).filter((k) => !(k in before));
    expect(added.sort()).toEqual(['.benchwork', VAULT_CONFIG_PATH]);
    for (const [path, content] of Object.entries(before)) expect(after[path]).toBe(content);
  });

  it('never overwrites an existing config', async () => {
    const custom = '{"version":1,"modules":{"hello":{"enabled":true}}}';
    const platform = adapterWith({ 'C:/Vault': { [VAULT_CONFIG_PATH]: custom } });
    await checkFolder(platform, 'C:/Vault');
    await initialiseVault(platform);
    expect(await platform.readText(VAULT_CONFIG_PATH)).toBe(custom);
  });

  it('recreates a missing config inside an existing .benchwork folder', async () => {
    const platform = adapterWith({ 'C:/Vault': { '.benchwork/modules': null } });
    await checkFolder(platform, 'C:/Vault');
    await initialiseVault(platform);
    expect((await loadVaultConfig(platform)).modules).toEqual({});
  });
});

describe('vault config on disk', () => {
  it('saves and loads', async () => {
    const platform = adapterWith({ 'C:/Vault': {} });
    await checkFolder(platform, 'C:/Vault');
    await initialiseVault(platform);
    const config = await loadVaultConfig(platform);
    config.modules['hello'] = { enabled: true };
    await saveVaultConfig(platform, config);
    expect((await loadVaultConfig(platform)).modules['hello']?.enabled).toBe(true);
  });

  it('reports a corrupt config', async () => {
    const platform = adapterWith({ 'C:/Vault': { [VAULT_CONFIG_PATH]: '{oops' } });
    await checkFolder(platform, 'C:/Vault');
    await expect(loadVaultConfig(platform)).rejects.toBeInstanceOf(VaultConfigError);
  });
});
