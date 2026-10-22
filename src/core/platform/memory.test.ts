// @vitest-environment node
import { PlatformError, type PlatformErrorKind } from './errors';
import { DEFAULT_MEMORY_FOLDER, MemoryAdapter } from './memory';

async function expectKind(promise: Promise<unknown>, kind: PlatformErrorKind): Promise<void> {
  const err: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(PlatformError);
  expect((err as PlatformError).kind).toBe(kind);
}

async function openVault(contents: Record<string, string | null> = {}): Promise<MemoryAdapter> {
  const adapter = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  await adapter.setVaultRoot('C:/Vault');
  return adapter;
}

describe('MemoryAdapter', () => {
  it('needs an open vault before file calls', async () => {
    const adapter = new MemoryAdapter();
    await expectKind(adapter.listDir(''), 'NoVault');
    await expectKind(adapter.readText('a.md'), 'NoVault');
  });

  it('only opens folders that exist', async () => {
    const adapter = new MemoryAdapter();
    await expectKind(adapter.setVaultRoot('C:/Missing'), 'NotFound');
  });

  it('returns queued picks, then the default folder', async () => {
    const adapter = new MemoryAdapter();
    adapter.queuePick('C:/Chosen', null);
    expect(await adapter.pickFolder()).toBe('C:/Chosen');
    expect(await adapter.pickFolder()).toBeNull();
    expect(await adapter.pickFolder()).toBe(DEFAULT_MEMORY_FOLDER);
    expect(await adapter.setVaultRoot(DEFAULT_MEMORY_FOLDER)).toBe(DEFAULT_MEMORY_FOLDER);
  });

  it('lists folders with relative paths in byte order', async () => {
    const adapter = await openVault({
      'Notes/b.md': '12345',
      'Notes/a.md': '',
      'Notes/Week 1': null,
      'top.md': 'x',
    });
    const entries = await adapter.listDir('Notes');
    expect(entries.map((e) => [e.name, e.path, e.isDir, e.size])).toEqual([
      ['Week 1', 'Notes/Week 1', true, 0],
      ['a.md', 'Notes/a.md', false, 0],
      ['b.md', 'Notes/b.md', false, 5],
    ]);
    expect((await adapter.listDir('')).map((e) => e.name)).toEqual(['Notes', 'top.md']);
  });

  it('counts size in UTF-8 bytes', async () => {
    const adapter = await openVault({ 'été.md': 'été' });
    const [entry] = await adapter.listDir('');
    expect(entry?.size).toBe(5);
  });

  it('writes and reads text, replacing existing files', async () => {
    const adapter = await openVault();
    await adapter.writeTextAtomic('page.md', 'one');
    await adapter.writeTextAtomic('page.md', 'two');
    expect(await adapter.readText('page.md')).toBe('two');
  });

  it('needs an existing parent folder to write', async () => {
    const adapter = await openVault({ 'file.md': 'x' });
    await expectKind(adapter.writeTextAtomic('missing/page.md', 'x'), 'NotFound');
    await expectKind(adapter.writeTextAtomic('file.md/page.md', 'x'), 'NotADirectory');
    await adapter.ensureDir('missing');
    await adapter.writeTextAtomic('missing/page.md', 'x');
    expect(await adapter.exists('missing/page.md')).toBe(true);
  });

  it('reports wrong types like the Rust backend', async () => {
    const adapter = await openVault({ 'page.md': 'x', Notes: null });
    await expectKind(adapter.listDir('page.md'), 'NotADirectory');
    await expectKind(adapter.listDir('missing'), 'NotFound');
    await expectKind(adapter.readText('Notes'), 'NotAFile');
    await expectKind(adapter.readText('missing.md'), 'NotFound');
    await expectKind(adapter.writeTextAtomic('Notes', 'x'), 'NotAFile');
    await expectKind(adapter.writeTextAtomic('', 'x'), 'NotAFile');
    await expectKind(adapter.ensureDir('page.md/sub'), 'NotADirectory');
  });

  it('creates nested folders and is happy if they exist', async () => {
    const adapter = await openVault();
    await adapter.ensureDir('a/b/c');
    await adapter.ensureDir('a/b');
    expect(adapter.snapshot()).toEqual({ a: null, 'a/b': null, 'a/b/c': null });
  });

  it('rejects paths that leave the vault or break the rules', async () => {
    const adapter = await openVault();
    await expectKind(adapter.readText('../secret.md'), 'OutsideVault');
    await expectKind(adapter.writeTextAtomic('a/../../x.md', 'x'), 'OutsideVault');
    await expectKind(adapter.ensureDir('C:/Windows'), 'InvalidPath');
    await expectKind(adapter.exists('Notes\\a.md'), 'InvalidPath');
  });

  it('keeps folders separate', async () => {
    const adapter = new MemoryAdapter({
      folders: { 'C:/One': { 'a.md': 'one' }, 'C:/Two': {} },
    });
    await adapter.setVaultRoot('C:/Two');
    await adapter.writeTextAtomic('b.md', 'two');
    expect(adapter.snapshot('C:/One')).toEqual({ 'a.md': 'one' });
    expect(adapter.snapshot()).toEqual({ 'b.md': 'two' });
  });

  it('finds the vault a folder belongs to', async () => {
    const adapter = new MemoryAdapter({
      folders: {
        'C:/Docs': {
          '.benchwork/config.json': '{}',
          '.benchwork/.benchwork/Test': null,
          'LPS model/Data': null,
          'LPS model/Inner/.benchwork': null,
          'LPS model/Inner/Data': null,
        },
        'C:/Plain': { Sub: null },
      },
    });
    expect(await adapter.findVaultRoot('C:/Docs')).toBe('C:/Docs');
    expect(await adapter.findVaultRoot('C:/Docs/.benchwork')).toBe('C:/Docs');
    expect(await adapter.findVaultRoot('C:/Docs/.benchwork/.benchwork/Test')).toBe('C:/Docs');
    expect(await adapter.findVaultRoot('C:/Docs/LPS model/Data')).toBe('C:/Docs');
    expect(await adapter.findVaultRoot('C:/Docs/LPS model/Inner/Data')).toBe(
      'C:/Docs/LPS model/Inner',
    );
    expect(await adapter.findVaultRoot('C:/Plain/Sub')).toBeNull();
    await expectKind(adapter.findVaultRoot('C:/Docs/missing'), 'NotFound');
    await expectKind(adapter.findVaultRoot('D:/Elsewhere'), 'NotFound');
  });

  it('stores app settings as a copy', async () => {
    const adapter = new MemoryAdapter();
    expect(await adapter.loadAppSettings()).toBeNull();
    const settings = { theme: 'dark' };
    await adapter.saveAppSettings(settings);
    settings.theme = 'light';
    expect(await adapter.loadAppSettings()).toEqual({ theme: 'dark' });
  });
});
