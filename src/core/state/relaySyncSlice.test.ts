// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from './appStore';
import type { RelayAdapter } from '../platform/types';

async function setup() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': { '.benchwork/config.json': '{"version":1}', 'Notes.md': 'Original\n' },
      'C:/Restored': { '.benchwork/config.json': '{"version":1}', 'Notes.md': 'Original\n' },
    },
  });
  const request: RelayAdapter['request'] = vi.fn(
    (_endpoint: string, _cert: string, body: string) => {
      const data = JSON.parse(body) as { action: string };
      if (data.action === 'create')
        return Promise.resolve(
          JSON.stringify({ vault: 'test-vault-identity', token: 'private-owner-token' }),
        );
      if (data.action === 'devices') return Promise.resolve(JSON.stringify({ devices: ['PC'] }));
      if (data.action === 'events') return Promise.resolve('{"events":[]}');
      return Promise.resolve('{}');
    },
  );
  platform.relay = { request, apply: () => Promise.resolve(true) };
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, request, store, state: () => store.getState() };
}
const details = JSON.stringify({
  endpoint: 'https://178.62.50.124',
  certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
  setup: 'private-one-use-setup',
});

it('requires one sync engine and keeps encryption keys outside vault content and backups', async () => {
  const { platform, state, request } = await setup();
  await state().createCloudSync(details, 'PC');
  expect(state().relaySync.error).toContain('Confirm');
  expect(request).not.toHaveBeenCalled();
  state().confirmRelaySync(true);
  await state().createCloudSync(details, 'PC');
  expect(state().relaySync.enabled).toBe(true);
  await vi.waitFor(() => {
    expect(state().relaySync.lastSync).not.toBeNull();
  });
  const recovery = JSON.parse(state().relaySync.recovery) as { connection: { key: string } };
  const vault = JSON.stringify(platform.snapshot());
  expect(vault).not.toContain(recovery.connection.key);
  expect(vault).not.toContain('private-owner-token');
  await state().closeVault();
  await state().switchToVault('C:/Restored');
  expect(state().relaySync.enabled).toBe(false);
  await state().closeVault();
});

it('waits for an in-flight cloud transfer before changing vault roots and reconnects after restart', async () => {
  const { platform, store, state, request } = await setup();
  state().confirmRelaySync(true);
  await state().createCloudSync(details, 'PC');
  await platform.writeTextAtomic('Notes.md', 'Original with changes\n');
  let release: (() => void) | undefined;
  vi.mocked(request).mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        release = () => {
          resolve('{}');
        };
      }),
  );
  const sync = state().syncCloudNow();
  await vi.waitFor(() => {
    expect(release).toBeDefined();
  });
  let closed = false;
  const close = state()
    .closeVault()
    .then(() => {
      closed = true;
    });
  await Promise.resolve();
  expect(closed).toBe(false);
  release?.();
  await sync;
  await close;
  expect(closed).toBe(true);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  expect(state().relaySync.enabled).toBe(true);
  expect(state().relaySync.lastSync).toBeNull();
  await state().syncCloudNow();
  expect(state().relaySync.lastSync).not.toBeNull();
  await state().closeVault();
});
