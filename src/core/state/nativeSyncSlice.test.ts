// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import type { NativeSyncAdapter, SyncInvitation } from '../platform/types';
import { createAppStore } from './appStore';
const connection = {
  endpoint: 'https://192.168.1.5:47831',
  certificate: 'certificate',
  vault: 'a'.repeat(64),
  token: 'b'.repeat(64),
};
function fake(): NativeSyncAdapter {
  return {
    localAddress: vi.fn(() => Promise.resolve('192.168.1.5')),
    start: vi.fn(() =>
      Promise.resolve({ running: true, endpoint: connection.endpoint, devices: [] }),
    ),
    stop: vi.fn(() => Promise.resolve()),
    status: vi.fn(() =>
      Promise.resolve({ running: true, endpoint: connection.endpoint, devices: [] }),
    ),
    invitation: vi.fn(() => Promise.resolve({ text: '{}', svg: '<svg/>', expires: 9999999999 })),
    exportInvitation: vi.fn(() => Promise.resolve('Downloads/pair.json')),
    readInvitation: vi.fn(() => Promise.resolve({} as SyncInvitation)),
    join: vi.fn(() => Promise.resolve(connection)),
    sync: vi.fn(() => Promise.resolve({ uploaded: 1, downloaded: 2, conflicts: [], skipped: [] })),
    revoke: vi.fn(() => Promise.resolve()),
  };
}
async function setup(syncthing = false) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': '{"version":1}',
        ...(syncthing ? { '.stfolder': null } : {}),
      },
      'C:/Other': { '.benchwork/config.json': '{"version":1}' },
    },
  });
  const native = fake();
  platform.nativeSync = native;
  const store = createAppStore(platform);
  await store.getState().start();
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, native, store, state: () => store.getState() };
}
it('requires explicit confirmation before starting in a Syncthing vault', async () => {
  const { native, state } = await setup(true);
  await state().startDesktopSync('192.168.1.5');
  expect(native.start).not.toHaveBeenCalled();
  expect(state().desktopSync.error).toContain('Pause Syncthing');
  state().confirmOtherSyncStopped(true);
  await state().startDesktopSync('192.168.1.5');
  expect(native.start).toHaveBeenCalledWith('192.168.1.5', true);
  await state().closeVault();
});
it('stores pairing outside the vault, syncs and waits for a pending transfer before switching vaults', async () => {
  const { native, platform, state } = await setup();
  await state().pairDesktopSync('{}', 'Tablet');
  expect(native.sync).toHaveBeenCalled();
  expect(state().desktopSync.report?.downloaded).toBe(2);
  expect(JSON.stringify(platform.snapshot())).not.toContain(connection.token);
  let release: (() => void) | undefined;
  vi.mocked(native.sync).mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { uploaded: 0, downloaded: 0, conflicts: [], skipped: [] };
  });
  const pending = state().syncDesktopNow();
  await vi.waitFor(() => {
    expect(release).toBeDefined();
  });
  const switching = state().switchToVault('C:/Other');
  await Promise.resolve();
  const before = state().status;
  expect(before.kind === 'open' && before.vault.root).toBe('C:/Vault');
  release?.();
  await pending;
  await switching;
  expect(native.stop).toHaveBeenCalled();
  const status = state().status;
  expect(status.kind === 'open' && status.vault.root).toBe('C:/Other');
  expect(state().desktopSync.mode).toBe('off');
  await state().closeVault();
});
