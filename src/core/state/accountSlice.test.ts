// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from './appStore';
import { connectDevice, fakeAccountRelay } from '../../test/fakeAccountRelay';

const setupDetails = JSON.stringify({
  endpoint: 'https://178.62.50.124',
  certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
  setup: 'private-one-use-setup',
});
const PASSWORD = 'a long pass phrase';

/** Ray's PC: an existing vault already set up for Cloud sync the old way. */
async function pc(relay: ReturnType<typeof fakeAccountRelay>) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Lab notes': {
        '.benchwork/config.json': '{"version":1}',
        'Experiments/Day 1.md': '# Day 1\n\nPCR worked.\n',
      },
    },
  });
  connectDevice(platform, relay, 'PC');
  const store = createAppStore(platform);
  await store.getState().start();
  platform.queuePick('C:/Lab notes');
  await store.getState().chooseFolder('open');
  const state = () => store.getState();
  state().confirmRelaySync(true);
  await state().createCloudSync(setupDetails, 'PC');
  await vi.waitFor(() => {
    expect(state().relaySync.lastSync).not.toBeNull();
  });
  return { platform, state };
}

async function freshDevice(relay: ReturnType<typeof fakeAccountRelay>, name = 'Tablet') {
  const platform = new MemoryAdapter();
  connectDevice(platform, relay, name);
  const store = createAppStore(platform);
  await store.getState().start();
  return { platform, state: () => store.getState() };
}

it('moves an existing vault into a new account, and a fresh device syncs it after signing in', async () => {
  const relay = fakeAccountRelay();
  const first = await pc(relay);
  await first.state().createAccount('Ray', PASSWORD, PASSWORD, '');
  expect(first.state().account.error).toBe('');
  expect(first.state().account.login).toBe('ray');
  expect(first.state().account.recoveryKey).toMatch(/^[0-9a-f-]{79}$/);
  expect(first.state().account.vaultLinked).toBe(true);
  // Neither the password nor any key reaches the relay or the vault files.
  const stored = JSON.stringify(relay.accounts);
  expect(stored).not.toContain(PASSWORD);
  expect(stored).not.toContain(first.state().cloudConnection()?.key ?? 'missing');
  expect(JSON.stringify(first.platform.snapshot())).not.toContain(PASSWORD);

  const second = await freshDevice(relay);
  expect(second.state().status.kind).toBe('no-vault');
  await second.state().signIn('ray', PASSWORD);
  expect(second.state().account.error).toBe('');
  const status = second.state().status;
  expect(status.kind === 'open' && status.vault.root).toBe(
    'C:/Users/Ray/Documents/BenchWork/Lab notes',
  );
  expect(second.state().relaySync.enabled).toBe(true);
  await vi.waitFor(async () => {
    expect(await second.platform.readText('Experiments/Day 1.md')).toContain('PCR worked.');
  });
  // No sample notebook was added to the shared vault.
  expect(await second.platform.exists('templates/Experiment.md')).toBe(false);
  expect(second.state().choosingPack).toBeFalsy();
  expect(second.state().account.vaultLinked).toBe(true);

  // Edits made on the new device reach the PC.
  await second.platform.writeTextAtomic('Experiments/Day 2.md', '# Day 2\n');
  await second.state().syncCloudNow();
  await first.state().syncCloudNow();
  expect(await first.platform.readText('Experiments/Day 2.md')).toBe('# Day 2\n');
});

it('keeps the sign-in after a restart and needs no network to reopen', async () => {
  const relay = fakeAccountRelay();
  const first = await pc(relay);
  await first.state().createAccount('ray', PASSWORD, PASSWORD, '');
  const second = await freshDevice(relay);
  await second.state().signIn('ray', PASSWORD);
  const restarted = createAppStore(second.platform);
  await restarted.getState().start();
  await vi.waitFor(() => {
    expect(restarted.getState().account.login).toBe('ray');
  });
  expect(restarted.getState().status.kind).toBe('open');
  expect(restarted.getState().relaySync.enabled).toBe(true);
});

it('refuses a wrong password, a public sign-up, and a short password', async () => {
  const relay = fakeAccountRelay();
  const first = await pc(relay);
  const stranger = await freshDevice(relay, 'Stranger');
  await stranger.state().createAccount('someone', PASSWORD, PASSWORD, '');
  expect(stranger.state().account.error).toContain('sign-up code');
  await first.state().createAccount('ray', 'short', 'short', '');
  expect(first.state().account.error).toContain('at least 12');
  await first.state().createAccount('ray', PASSWORD, PASSWORD, '');
  await stranger.state().signIn('ray', 'not the password');
  expect(stranger.state().account.error).toContain('Username or password is wrong');
  expect(stranger.state().account.login).toBeNull();
  expect(stranger.state().status.kind).toBe('no-vault');
});

it('removing a device ends its sync, signing out keeps its files', async () => {
  const relay = fakeAccountRelay();
  const first = await pc(relay);
  await first.state().createAccount('ray', PASSWORD, PASSWORD, '');
  const second = await freshDevice(relay);
  await second.state().signIn('ray', PASSWORD);
  await vi.waitFor(async () => {
    expect(await second.platform.exists('Experiments/Day 1.md')).toBe(true);
  });
  await first.state().loadAccountDevices();
  const tablet = first.state().account.devices.find((d) => d.name === 'Tablet');
  await first.state().removeAccountDevice(tablet?.id ?? '');
  expect(first.state().account.devices.map((d) => d.name)).toEqual(['PC']);
  await second.state().syncCloudNow();
  expect(second.state().relaySync.error).toContain('Device access removed');

  await second.state().signOut();
  expect(second.state().account.login).toBeNull();
  expect(second.state().relaySync.enabled).toBe(false);
  expect(await second.platform.exists('Experiments/Day 1.md')).toBe(true);
  expect(await second.platform.secureRead('account')).toBeNull();
});

it('changes the password, and the recovery key sets a new one when it is forgotten', async () => {
  const relay = fakeAccountRelay();
  const first = await pc(relay);
  await first.state().createAccount('ray', PASSWORD, PASSWORD, '');
  const recovery = first.state().account.recoveryKey;
  await first
    .state()
    .changeAccountPassword('wrong password!!', 'another long phrase', 'another long phrase');
  expect(first.state().account.error).toContain('wrong');
  await first.state().changeAccountPassword(PASSWORD, 'another long phrase', 'another long phrase');
  expect(first.state().account.error).toBe('');

  const second = await freshDevice(relay);
  await second.state().signIn('ray', PASSWORD);
  expect(second.state().account.error).toContain('wrong');
  await second.state().recoverAccount('ray', recovery, 'third long phrase!', 'third long phrase!');
  expect(second.state().account.error).toBe('');
  expect(second.state().status.kind).toBe('open');

  const third = await freshDevice(relay, 'Laptop');
  await third.state().signIn('ray', 'third long phrase!');
  expect(third.state().account.error).toBe('');
  expect(third.state().account.vaults.map((v) => v.name)).toEqual(['Lab notes']);
});

it('adds a vault with no Cloud sync to the account and syncs it', async () => {
  const relay = fakeAccountRelay();
  relay.signups.add('one-use-signup-code');
  const platform = new MemoryAdapter({
    folders: { 'C:/Thesis': { '.benchwork/config.json': '{"version":1}', 'Plan.md': 'Plan\n' } },
  });
  connectDevice(platform, relay, 'PC');
  const store = createAppStore(platform);
  const state = () => store.getState();
  await state().start();
  platform.queuePick('C:/Thesis');
  await state().chooseFolder('open');
  await state().createAccount('ray', PASSWORD, PASSWORD, 'one-use-signup-code');
  expect(state().account.error).toBe('');
  expect(state().account.vaultLinked).toBe(false);
  // An existing folder still needs the folder sync check before it joins.
  await state().linkVaultToAccount();
  expect(state().account.error).toContain('Syncthing');
  state().confirmRelaySync(true);
  await state().linkVaultToAccount();
  expect(state().account.error).toBe('');
  expect(state().account.vaultLinked).toBe(true);

  const second = await freshDevice(relay);
  await second.state().signIn('ray', PASSWORD);
  expect(second.state().account.error).toBe('');
  await vi.waitFor(async () => {
    expect(await second.platform.readText('Plan.md')).toBe('Plan\n');
  });
});
