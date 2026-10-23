// @vitest-environment node
import { PlatformError, type PlatformErrorKind } from './errors';
import { MemoryAdapter } from './memory';
import type { VaultChange } from './types';

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

/** Waits for the adapter's batched change events to be sent. */
const nextBatch = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('MemoryAdapter: Phase 1 file operations', () => {
  it('creates files without ever overwriting', async () => {
    const adapter = await openVault({ 'Page.md': 'first' });
    await expectKind(adapter.createNew('Page.md', 'second'), 'AlreadyExists');
    await expectKind(adapter.createNew('missing/Page.md', 'x'), 'NotFound');
    await adapter.createNew('New.md', 'hello');
    expect(adapter.snapshot()).toEqual({ 'New.md': 'hello', 'Page.md': 'first' });
  });

  it('renames files and folders, moving what is inside', async () => {
    const adapter = await openVault({ 'Notes/a.md': 'a', 'Notes/Week 1/b.md': 'b', Archive: null });
    await adapter.rename('Notes', 'Archive/Lab notes');
    expect(adapter.snapshot()).toEqual({
      Archive: null,
      'Archive/Lab notes': null,
      'Archive/Lab notes/Week 1': null,
      'Archive/Lab notes/Week 1/b.md': 'b',
      'Archive/Lab notes/a.md': 'a',
    });
  });

  it('refuses renames that would replace, nest or escape', async () => {
    const adapter = await openVault({ 'a.md': 'a', 'b.md': 'b', 'Notes/Inner': null });
    await expectKind(adapter.rename('a.md', 'b.md'), 'AlreadyExists');
    await expectKind(adapter.rename('Notes', 'Notes/Inner/x'), 'InvalidPath');
    await expectKind(adapter.rename('', 'x'), 'InvalidPath');
    await expectKind(adapter.rename('gone.md', 'x.md'), 'NotFound');
    await expectKind(adapter.rename('a.md', '../a.md'), 'OutsideVault');
    await expectKind(adapter.rename('a.md', 'missing/a.md'), 'NotFound');
    expect(adapter.snapshot()['b.md']).toBe('b');
  });

  it('writes and reads back binary data', async () => {
    const adapter = await openVault({ attachments: null });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255]);
    await adapter.writeBytes('attachments/shot.png', png);
    expect(adapter.bytesOf('attachments/shot.png')).toEqual(png);
    expect(adapter.snapshot()['attachments/shot.png']).toBe('[binary 6 bytes]');
    await expectKind(adapter.readText('attachments/shot.png'), 'Io');
  });

  it('copies files in from outside, with a size limit', async () => {
    const adapter = await openVault({ attachments: null });
    adapter.addExternalFile('D:/Data/run1.csv', 'a,b\n1,2');
    expect(await adapter.copyIn('D:/Data/run1.csv', 'attachments/run1.csv', 1024)).toBe(7);
    expect(adapter.snapshot()['attachments/run1.csv']).toBe('a,b\n1,2');
    await expectKind(
      adapter.copyIn('D:/Data/run1.csv', 'attachments/run1.csv', 1024),
      'AlreadyExists',
    );
    await expectKind(adapter.copyIn('D:/Data/run1.csv', 'attachments/big.csv', 3), 'TooLarge');
    await expectKind(adapter.copyIn('D:/Data/missing.csv', 'attachments/x.csv', 1024), 'NotFound');
  });

  it('sends things to the Recycle Bin rather than deleting', async () => {
    const adapter = await openVault({ 'Notes/a.md': 'a', 'keep.md': 'k' });
    await adapter.trash('Notes');
    expect(adapter.snapshot()).toEqual({ 'keep.md': 'k' });
    expect(adapter.trashed()).toEqual(['Notes']);
    await expectKind(adapter.trash(''), 'InvalidPath');
    await expectKind(adapter.trash('gone.md'), 'NotFound');
  });

  it('tells watchers about changes, batched, skipping BenchWork internals', async () => {
    const adapter = await openVault({ 'a.md': 'a', '.benchwork': null });
    const changes: VaultChange[] = [];
    const stop = adapter.watch((c) => changes.push(c));

    await adapter.writeTextAtomic('b.md', 'b');
    await adapter.rename('a.md', 'c.md');
    await adapter.ensureDir('.benchwork/modules');
    await adapter.writeTextAtomic('.benchwork/config.json', '{}');
    await nextBatch();
    expect(changes).toEqual([{ paths: ['.benchwork/config.json', 'a.md', 'b.md', 'c.md'] }]);

    stop();
    await adapter.externalWrite('d.md', 'd');
    await nextBatch();
    expect(changes).toHaveLength(1);
  });

  it('gives image URLs for files and none for folders or missing files', async () => {
    const adapter = await openVault({ attachments: null });
    await adapter.writeBytes('attachments/shot.png', new Uint8Array([1, 2, 3]));
    expect(adapter.assetUrl('attachments/shot.png')).toMatch(/^blob:/);
    expect(adapter.assetUrl('attachments')).toBeNull();
    expect(adapter.assetUrl('missing.png')).toBeNull();
  });
});

describe('MemoryAdapter: Phase 2 file details', () => {
  it('reads bytes up to a limit', async () => {
    const adapter = await openVault({ 'data.csv': 'x,y\n' });
    expect(new TextDecoder().decode(await adapter.readBytes('data.csv', 10))).toBe('x,y\n');
    await expectKind(adapter.readBytes('data.csv', 3), 'TooLarge');
    await expectKind(adapter.readBytes('missing.csv', 10), 'NotFound');
  });

  it('gives sizes and SHA-256 checksums, inside the vault or outside it', async () => {
    const adapter = await openVault({ 'abc.txt': 'abc' });
    adapter.addExternalFile('D:/Raw/empty.bin', new Uint8Array());
    const abc = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(await adapter.hashFile('abc.txt')).toBe(abc);
    expect(await adapter.hashFile('C:/Vault/abc.txt', true)).toBe(abc);
    expect(await adapter.hashFile('D:/Raw/empty.bin', true)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect((await adapter.fileInfo('abc.txt')).size).toBe(3);
    expect((await adapter.fileInfo('D:/Raw/empty.bin', true)).size).toBe(0);
    await expectKind(adapter.fileInfo('D:/Raw/missing.bin', true), 'NotFound');
  });

  it('returns queued file picks, then nothing', async () => {
    const adapter = await openVault();
    adapter.queueFilePick(['D:/Raw/a.tif', 'D:/Raw/b.tif']);
    expect(await adapter.pickFiles()).toEqual(['D:/Raw/a.tif', 'D:/Raw/b.tif']);
    expect(await adapter.pickFiles()).toEqual([]);
  });
});
