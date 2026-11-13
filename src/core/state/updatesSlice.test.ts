// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import type { AppUpdates } from '../platform/types';
import { createAppStore } from './appStore';

async function setup() {
  const platform = new MemoryAdapter({
    folders: { 'C:/Vault': { '.benchwork/config.json': '{"version":1}' } },
  });
  const updates: AppUpdates = {
    check: vi.fn(() => Promise.resolve({ version: '99.0.0', notes: 'New features', size: 1000 })),
    download: vi.fn((_version: string, progress: (downloaded: number, total: number) => void) => {
      progress(1000, 1000);
      return Promise.resolve();
    }),
    prepareInstall: vi.fn(() => Promise.resolve(true)),
    install: vi.fn(() => Promise.resolve()),
  };
  platform.updates = updates;
  const store = createAppStore(platform);
  await store.getState().start();
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, updates, store, state: () => store.getState() };
}
it('checks only when requested, downloads with progress and installs after the vault has saved and closed', async () => {
  const { updates, state } = await setup();
  expect(updates.check).not.toHaveBeenCalled();
  await state().checkAppUpdates();
  expect(state().appUpdate.available?.version).toBe('99.0.0');
  await state().downloadAppUpdate();
  expect(state().appUpdate.phase).toBe('ready');
  expect(state().appUpdate.progress).toBe(100);
  vi.mocked(updates.install).mockImplementation(() => {
    expect(state().status.kind).toBe('no-vault');
    return Promise.resolve();
  });
  await state().installAppUpdate();
  expect(updates.install).toHaveBeenCalledOnce();
});
it('keeps unsaved work open and never starts the installer if closing fails', async () => {
  const { updates, store, state } = await setup();
  await state().checkAppUpdates();
  await state().downloadAppUpdate();
  store.setState({ closeVault: () => Promise.resolve(false) });
  await state().installAppUpdate();
  expect(updates.install).not.toHaveBeenCalled();
  expect(state().status.kind).toBe('open');
  expect(state().appUpdate.error).toContain('could not be saved');
});
it('handles download failure and Android approval without closing the workspace', async () => {
  const { updates, state } = await setup();
  await state().checkAppUpdates();
  vi.mocked(updates.download).mockRejectedValueOnce(new Error('Checksum mismatch'));
  await state().downloadAppUpdate();
  expect(state().appUpdate.phase).toBe('available');
  expect(state().appUpdate.error).toContain('Checksum');
  await state().downloadAppUpdate();
  vi.mocked(updates.prepareInstall).mockResolvedValueOnce(false);
  await state().installAppUpdate();
  expect(state().status.kind).toBe('open');
  expect(updates.install).not.toHaveBeenCalled();
  expect(state().appUpdate.message).toContain('Android settings');
  await state().closeVault();
});
it('remembers the startup check preference on this device without installing automatically', async () => {
  const { updates, platform, state } = await setup();
  await state().setUpdateChecks(true);
  expect(state().settings.checkUpdatesOnStart).toBe(true);
  const stored = (await platform.loadAppSettings()) as Record<string, unknown>;
  expect(stored['checkUpdatesOnStart']).toBe(true);
  expect(updates.install).not.toHaveBeenCalled();
  await state().closeVault();
});
