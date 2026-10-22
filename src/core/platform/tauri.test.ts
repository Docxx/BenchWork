import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { PlatformError } from './errors';
import { TauriAdapter } from './tauri';

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

  it('passes app settings through', async () => {
    const calls = record((cmd) => (cmd === 'load_app_settings' ? { theme: 'dark' } : null));
    const adapter = new TauriAdapter();
    expect(await adapter.loadAppSettings()).toEqual({ theme: 'dark' });
    await adapter.saveAppSettings({ theme: 'light' });
    expect(calls[1]).toEqual({ cmd: 'save_app_settings', args: { settings: { theme: 'light' } } });
  });
});
