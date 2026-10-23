import { clearMocks, mockConvertFileSrc, mockIPC } from '@tauri-apps/api/mocks';
import { PlatformError } from './errors';
import { fullPath, TauriAdapter } from './tauri';

describe('fullPath', () => {
  it('joins with the separator the vault path uses', () => {
    expect(fullPath('C:\\Vault', 'Notes/a.md')).toBe('C:\\Vault\\Notes\\a.md');
    expect(fullPath('C:\\', 'a.md')).toBe('C:\\a.md');
    expect(fullPath('/home/ray/Vault', 'Notes/a.md')).toBe('/home/ray/Vault/Notes/a.md');
    expect(fullPath('/home/ray/Vault', '')).toBe('/home/ray/Vault');
  });
});

interface Call {
  cmd: string;
  args: unknown;
}

function record(respond: (cmd: string, args: unknown) => unknown = () => null): Call[] {
  const calls: Call[] = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    return respond(cmd, args);
  });
  return calls;
}

afterEach(() => {
  clearMocks();
});

describe('TauriAdapter', () => {
  it('sends normalised paths to the Rust commands', async () => {
    const calls = record((cmd) => (cmd === 'exists' ? true : null));
    const adapter = new TauriAdapter();

    await adapter.setVaultRoot('C:\\Vault');
    await adapter.listDir('./Notes/');
    await adapter.readText('Notes//a.md');
    await adapter.writeTextAtomic('Notes/a.md', 'text');
    await adapter.ensureDir('Notes/Week 1');
    expect(await adapter.exists('.benchwork')).toBe(true);

    expect(calls).toEqual([
      { cmd: 'set_vault_root', args: { root: 'C:\\Vault' } },
      { cmd: 'list_dir', args: { path: 'Notes' } },
      { cmd: 'read_text', args: { path: 'Notes/a.md' } },
      { cmd: 'write_text_atomic', args: { path: 'Notes/a.md', text: 'text' } },
      { cmd: 'ensure_dir', args: { path: 'Notes/Week 1' } },
      { cmd: 'exists', args: { path: '.benchwork' } },
    ]);
  });

  it('asks Rust which vault a folder belongs to', async () => {
    const answer = { root: 'C:\\Docs', folder: 'C:\\Docs\\.benchwork', via: 'benchwork' };
    const calls = record((cmd) => (cmd === 'find_vault_root' ? answer : null));
    expect(await new TauriAdapter().findVaultRoot('C:\\Docs\\.benchwork')).toEqual(answer);
    expect(calls).toEqual([{ cmd: 'find_vault_root', args: { path: 'C:\\Docs\\.benchwork' } }]);
  });

  it('sends the Phase 1 file commands with normalised paths', async () => {
    const calls = record((cmd) => (cmd === 'copy_in' ? 7 : null));
    const adapter = new TauriAdapter();
    await adapter.createNew('./Notes//New.md', 'text');
    await adapter.rename('Notes/a.md', 'Archive/a.md');
    expect(await adapter.copyIn('D:\\Data\\run1.csv', 'attachments/run1.csv', 1024)).toBe(7);
    await adapter.trash('Notes/old.md');
    expect(calls).toEqual([
      { cmd: 'create_new', args: { path: 'Notes/New.md', text: 'text' } },
      { cmd: 'rename', args: { from: 'Notes/a.md', to: 'Archive/a.md' } },
      {
        cmd: 'copy_in',
        args: { external: 'D:\\Data\\run1.csv', to: 'attachments/run1.csv', maxBytes: 1024 },
      },
      { cmd: 'trash', args: { path: 'Notes/old.md' } },
    ]);
  });

  it('sends bytes as the raw body with the path in a header', async () => {
    record();
    // mockIPC does not pass request options on, so look one level lower.
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown, options: unknown) => unknown };
      }
    ).__TAURI_INTERNALS__;
    const original = internals.invoke.bind(internals);
    let seen: { cmd: string; args: unknown; options: unknown } | null = null;
    internals.invoke = (cmd, args, options) => {
      seen = { cmd, args, options };
      return original(cmd, args, options);
    };

    const data = new Uint8Array([1, 2, 3]);
    await new TauriAdapter().writeBytes('attachments/Pasted image été.png', data);
    expect(seen).toEqual({
      cmd: 'write_bytes',
      args: data,
      options: { headers: { 'x-vault-path': 'attachments%2FPasted%20image%20%C3%A9t%C3%A9.png' } },
    });
  });

  it('builds asset URLs from the vault path once a vault is open', async () => {
    record((cmd) => (cmd === 'set_vault_root' ? 'C:\\Labs\\Vault' : null));
    mockConvertFileSrc('windows');
    const adapter = new TauriAdapter();
    expect(adapter.assetUrl('a.png')).toBeNull();
    await adapter.setVaultRoot('C:\\Labs\\Vault');
    expect(decodeURIComponent(adapter.assetUrl('attachments/shot one.png') ?? '')).toContain(
      'C:\\Labs\\Vault\\attachments\\shot one.png',
    );
  });

  it('rejects bad paths before calling Rust', async () => {
    const calls = record();
    const adapter = new TauriAdapter();
    await expect(adapter.readText('../secret.md')).rejects.toMatchObject({ kind: 'OutsideVault' });
    expect(calls).toEqual([]);
  });

  it('turns backend errors into PlatformErrors', async () => {
    record(() => {
      // The Rust backend rejects with a plain { kind, message } object, not an Error.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw { kind: 'NotFound', message: 'Cannot read file' };
    });
    const err: unknown = await new TauriAdapter().readText('a.md').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlatformError);
    expect(err).toMatchObject({ kind: 'NotFound', message: 'Cannot read file' });
  });

  it('returns the picked folder, or null when cancelled', async () => {
    let answer: string | null = 'C:\\Vault';
    const calls = record((cmd) => (cmd === 'plugin:dialog|open' ? answer : null));
    const adapter = new TauriAdapter();

    expect(await adapter.pickFolder({ title: 'Open vault' })).toBe('C:\\Vault');
    answer = null;
    expect(await adapter.pickFolder({ title: 'Open vault' })).toBeNull();
    expect(calls[0]?.args).toMatchObject({
      options: { directory: true, multiple: false, title: 'Open vault' },
    });
  });

  it('returns picked files as a list, empty when cancelled', async () => {
    let answer: string | string[] | null = ['D:\\Raw\\a.tif', 'D:\\Raw\\b.tif'];
    const calls = record((cmd) => (cmd === 'plugin:dialog|open' ? answer : null));
    const adapter = new TauriAdapter();

    expect(await adapter.pickFiles({ title: 'Add files', multiple: true })).toEqual([
      'D:\\Raw\\a.tif',
      'D:\\Raw\\b.tif',
    ]);
    answer = 'D:\\Raw\\c.tif';
    expect(await adapter.pickFiles({ title: 'Add a file', multiple: false })).toEqual([
      'D:\\Raw\\c.tif',
    ]);
    answer = null;
    expect(await adapter.pickFiles({ title: 'Add a file', multiple: false })).toEqual([]);
    expect(calls[0]?.args).toMatchObject({ options: { multiple: true, title: 'Add files' } });
  });

  it('sends file detail commands, leaving external paths as they are', async () => {
    const calls = record((cmd) =>
      cmd === 'hash_file' ? 'abc123' : cmd === 'file_info' ? { size: 5, modified: 1 } : null,
    );
    const adapter = new TauriAdapter();
    expect(await adapter.hashFile('Data//day7.csv')).toBe('abc123');
    expect(await adapter.hashFile('D:\\Raw\\scan.tif', true)).toBe('abc123');
    expect(await adapter.fileInfo('D:\\Raw\\scan.tif', true)).toEqual({ size: 5, modified: 1 });
    expect(calls).toEqual([
      { cmd: 'hash_file', args: { path: 'Data/day7.csv', external: false } },
      { cmd: 'hash_file', args: { path: 'D:\\Raw\\scan.tif', external: true } },
      { cmd: 'file_info', args: { path: 'D:\\Raw\\scan.tif', external: true } },
    ]);
  });

  it('reads bytes sent back raw', async () => {
    const calls = record(() => new Uint8Array([1, 2, 3]).buffer);
    const bytes = await new TauriAdapter().readBytes('Data/a.xlsx', 100);
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(calls).toEqual([{ cmd: 'read_bytes', args: { path: 'Data/a.xlsx', maxBytes: 100 } }]);
  });

  it('passes app settings through', async () => {
    const calls = record((cmd) => (cmd === 'load_app_settings' ? { theme: 'dark' } : null));
    const adapter = new TauriAdapter();
    expect(await adapter.loadAppSettings()).toEqual({ theme: 'dark' });
    await adapter.saveAppSettings({ theme: 'light' });
    expect(calls[1]).toEqual({ cmd: 'save_app_settings', args: { settings: { theme: 'light' } } });
  });
});
