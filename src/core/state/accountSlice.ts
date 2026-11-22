import {
  AccountClient,
  DEFAULT_KDF,
  checkLogin,
  checkNewPassword,
  newRecoveryKey,
  openKeyring,
  passwordKeys,
  recoveryKeys,
  sealKeyring,
  type AccountSession,
  type Keyring,
  type KeyringVault,
} from '../sync/account';
import { randomKey, toBase64 } from '../sync/relayCrypto';
import { describeError, type StoreContext } from './context';

const SECRET = 'account';

export interface AccountDevice {
  id: string;
  name: string;
  seen: number;
  current: boolean;
}
export interface AccountSlice {
  account: {
    /** False where the app cannot sign in (the web preview). */
    available: boolean;
    login: string | null;
    busy: boolean;
    error: string;
    /** What is happening now, such as "Setting up Lab notes". */
    progress: string;
    vaults: { id: string; name: string }[];
    devices: AccountDevice[];
    /** Shown once, after creating the account or a new key. */
    recoveryKey: string;
    /** Whether the open vault syncs with the account. */
    vaultLinked: boolean;
  };
  initAccount: () => Promise<void>;
  signIn: (login: string, password: string) => Promise<void>;
  createAccount: (login: string, password: string, again: string, signup: string) => Promise<void>;
  recoverAccount: (
    login: string,
    recovery: string,
    password: string,
    again: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  /** Opens a vault from the account, making its folder on this device. */
  openAccountVault: (id: string) => Promise<void>;
  /** Adds the open vault to the account and starts syncing it. */
  linkVaultToAccount: () => Promise<void>;
  loadAccountDevices: () => Promise<void>;
  removeAccountDevice: (id: string) => Promise<void>;
  changeAccountPassword: (current: string, password: string, again: string) => Promise<void>;
  dismissRecoveryKey: () => void;
}

export function createAccountSlice(ctx: StoreContext): AccountSlice {
  const { platform, get, set } = ctx;
  let session: AccountSession | null = null;
  const empty = (): AccountSlice['account'] => ({
    available: !!platform.relay?.account,
    login: null,
    busy: false,
    error: '',
    progress: '',
    vaults: [],
    devices: [],
    recoveryKey: '',
    vaultLinked: false,
  });
  const patch = (value: Partial<AccountSlice['account']>) => {
    set((s) => ({ account: { ...s.account, ...value } }));
  };
  function linked(): boolean {
    const connection = get().cloudConnection();
    return (
      !!session && !!connection && session.keyring.vaults.some((v) => v.id === connection.vault)
    );
  }
  async function keep(next: AccountSession | null): Promise<void> {
    session = next;
    await platform.secureWrite(SECRET, next ? JSON.stringify(next) : null);
    patch({
      login: next?.login ?? null,
      vaults: next?.keyring.vaults.map(({ id, name }) => ({ id, name })) ?? [],
      vaultLinked: linked(),
    });
  }
  async function busy(work: () => Promise<void>): Promise<void> {
    if (get().account.busy) return;
    patch({ busy: true, error: '' });
    try {
      await work();
    } catch (err) {
      patch({ error: describeError(err) });
    } finally {
      patch({ busy: false, progress: '' });
    }
  }
  function vaultName(): string {
    const status = get().status;
    if (status.kind !== 'open') return 'Vault';
    return status.vault.root.split(/[\\/]/).filter(Boolean).pop() ?? 'Vault';
  }
  async function openVault(client: AccountClient, vault: KeyringVault): Promise<void> {
    if (!session) return;
    patch({ progress: `Setting up ${vault.name}` });
    const adapter = platform.relay?.account;
    if (!adapter) throw new Error('Signing in needs the installed BenchWork app.');
    const folder = await adapter.prepareFolder(vault.name);
    await get().openArrivingVault(folder);
    patch({ progress: `Downloading ${vault.name}` });
    const connection = await client.join(session, vault);
    await get().adoptCloudSync(connection, true);
    patch({ vaultLinked: linked() });
  }
  /** After signing in with no vault open, the account's vault opens by itself. */
  async function arrive(client: AccountClient): Promise<void> {
    const [only, ...more] = session?.keyring.vaults ?? [];
    // With several vaults, the person chooses which to open from the list.
    if (get().status.kind === 'open' || !only || more.length) return;
    await openVault(client, only);
  }
  async function begin(
    login: string,
    wrap: string,
    result: { session: string; device: string; keyring: string; version: number },
  ): Promise<Keyring> {
    const keyring = await openKeyring(wrap, result.keyring, result.version);
    await keep({ login, session: result.session, device: result.device, wrap, keyring });
    return keyring;
  }

  ctx.onVault({
    opened: () => {
      patch({ vaultLinked: linked() });
    },
    closed: () => {
      patch({ vaultLinked: false });
    },
  });

  return {
    account: empty(),
    initAccount: async () => {
      if (!platform.relay?.account) return;
      const raw = await platform.secureRead(SECRET);
      if (!raw) return;
      try {
        await keep(JSON.parse(raw) as AccountSession);
      } catch {
        await keep(null);
      }
    },
    signIn: (loginText, password) =>
      busy(async () => {
        const login = checkLogin(loginText);
        if (!password) throw new Error('Enter your password.');
        const client = await AccountClient.open(platform);
        patch({ progress: 'Signing in' });
        const { salt, kdf } = await client.prelogin(login);
        const keys = await passwordKeys(platform, password, salt, kdf);
        const result = await client.call<{
          session: string;
          device: string;
          keyring: string;
          version: number;
        }>('login', { login, auth: keys.auth, name: client.device });
        await begin(login, keys.wrap, result);
        await arrive(client);
      }),
    createAccount: (loginText, password, again, signup) =>
      busy(async () => {
        const login = checkLogin(loginText);
        checkNewPassword(password, again);
        const client = await AccountClient.open(platform);
        const connection = get().cloudConnection();
        // A vault this device owns proves it may create an account, and joins it.
        const owned = connection?.owner ? connection : null;
        if (!owned && !signup.trim())
          throw new Error(
            'Open a vault this device set up for Cloud sync, or enter a sign-up code.',
          );
        patch({ progress: 'Creating your account' });
        const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
        const keys = await passwordKeys(platform, password, salt, DEFAULT_KDF);
        const recovery = newRecoveryKey();
        const rescue = await recoveryKeys(recovery);
        const keyring: Keyring = {
          revision: 1,
          recoveryWrap: rescue.wrap,
          vaults: owned
            ? [{ id: owned.vault, name: vaultName(), key: owned.key, owner: owned.token }]
            : [],
        };
        const result = await client.call<{ session: string; device: string }>('register', {
          login,
          salt,
          kdf: JSON.stringify(DEFAULT_KDF),
          auth: keys.auth,
          keyring: await sealKeyring(keys.wrap, keyring),
          recovery: rescue.auth,
          rkeyring: await sealKeyring(rescue.wrap, keyring),
          name: client.device,
          ...(owned ? { vault: owned.vault, token: owned.token } : { signup: signup.trim() }),
        });
        await keep({
          login,
          session: result.session,
          device: result.device,
          wrap: keys.wrap,
          keyring,
        });
        patch({ recoveryKey: recovery });
      }),
    recoverAccount: (loginText, recovery, password, again) =>
      busy(async () => {
        const login = checkLogin(loginText);
        checkNewPassword(password, again);
        const client = await AccountClient.open(platform);
        const rescue = await recoveryKeys(recovery);
        const result = await client.call<{
          session: string;
          device: string;
          keyring: string;
          version: number;
        }>('login', { login, recovery: rescue.auth, name: client.device });
        const keyring = await openKeyring(rescue.wrap, result.keyring, result.version);
        const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
        const keys = await passwordKeys(platform, password, salt, DEFAULT_KDF);
        const next: Keyring = { ...keyring, revision: keyring.revision + 1 };
        await client.call('change_password', {
          session: result.session,
          recovery: rescue.auth,
          salt,
          kdf: JSON.stringify(DEFAULT_KDF),
          auth: keys.auth,
          keyring: await sealKeyring(keys.wrap, next),
          rkeyring: await sealKeyring(rescue.wrap, next),
          version: keyring.revision,
        });
        await keep({
          login,
          session: result.session,
          device: result.device,
          wrap: keys.wrap,
          keyring: next,
        });
        await arrive(client);
      }),
    signOut: () =>
      busy(async () => {
        if (!session) return;
        // This device's sync credentials end with its sign-in. Files stay.
        if (linked()) await get().stopCloudSync();
        try {
          const client = await AccountClient.open(platform);
          await client.call('logout', { session: session.session });
        } catch {
          // Signed out on this device regardless; it can be removed from another.
        }
        await keep(null);
        patch({ devices: [] });
      }),
    openAccountVault: (id) =>
      busy(async () => {
        if (!session) throw new Error('Sign in first.');
        const client = await AccountClient.open(platform);
        await keep(await client.refresh(session));
        const vault = session.keyring.vaults.find((v) => v.id === id);
        if (!vault) throw new Error('That vault is no longer in your account.');
        await openVault(client, vault);
      }),
    linkVaultToAccount: () =>
      busy(async () => {
        if (!session) throw new Error('Sign in first.');
        if (get().status.kind !== 'open') throw new Error('Open a vault first.');
        if (linked()) return;
        // Check before changing the account, so a refusal leaves nothing half done.
        if (!get().relaySync.confirmed)
          throw new Error(
            'Confirm that Syncthing and other folder sync are stopped for this vault.',
          );
        if (get().desktopSync.mode !== 'off')
          throw new Error('Disable Desktop Sync before enabling Cloud sync.');
        const client = await AccountClient.open(platform);
        await keep(await client.refresh(session));
        const connection = get().cloudConnection();
        if (connection) {
          if (!connection.owner)
            throw new Error('Link this vault from the device that set up its Cloud sync.');
          await client.call('vault_attach', {
            session: session.session,
            vault: connection.vault,
            token: connection.token,
          });
          const vault = {
            id: connection.vault,
            name: vaultName(),
            key: connection.key,
            owner: connection.token,
          };
          await keep(await client.save(session, [...session.keyring.vaults, vault]));
        } else {
          const made = await client.call<{ vault: string; token: string }>('vault_create', {
            session: session.session,
            name: client.device,
          });
          const vault = { id: made.vault, name: vaultName(), key: randomKey(), owner: made.token };
          await keep(await client.save(session, [...session.keyring.vaults, vault]));
          await get().adoptCloudSync(await client.join(session, vault), false);
        }
        patch({ vaultLinked: linked() });
      }),
    loadAccountDevices: () =>
      busy(async () => {
        if (!session) return;
        const client = await AccountClient.open(platform);
        const result = await client.call<{ devices: AccountDevice[] }>('account_devices', {
          session: session.session,
        });
        patch({ devices: result.devices });
      }),
    removeAccountDevice: (id) =>
      busy(async () => {
        if (!session) return;
        const client = await AccountClient.open(platform);
        await client.call('remove_device', { session: session.session, device: id });
        const result = await client.call<{ devices: AccountDevice[] }>('account_devices', {
          session: session.session,
        });
        patch({ devices: result.devices });
      }),
    changeAccountPassword: (current, password, again) =>
      busy(async () => {
        if (!session) return;
        checkNewPassword(password, again);
        const client = await AccountClient.open(platform);
        const latest = await client.refresh(session);
        const before = await client.prelogin(latest.login);
        const old = await passwordKeys(platform, current, before.salt, before.kdf);
        const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
        const keys = await passwordKeys(platform, password, salt, DEFAULT_KDF);
        const next: Keyring = { ...latest.keyring, revision: latest.keyring.revision + 1 };
        await client.call('change_password', {
          session: latest.session,
          current: old.auth,
          salt,
          kdf: JSON.stringify(DEFAULT_KDF),
          auth: keys.auth,
          keyring: await sealKeyring(keys.wrap, next),
          rkeyring: await sealKeyring(next.recoveryWrap, next),
          version: latest.keyring.revision,
        });
        await keep({ ...latest, wrap: keys.wrap, keyring: next });
      }),
    dismissRecoveryKey: () => {
      patch({ recoveryKey: '' });
    },
  };
}
