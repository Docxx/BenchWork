/**
 * An in-memory stand-in for relay/server.py's account and sync actions, for
 * tests. It follows the same rules (closed sign-up, compare-and-swap keyring,
 * session-linked device credentials) without TLS, hashing or limits.
 */
import type { AccountAdapter, RelayAdapter } from '../core/platform/types';
import type { MemoryAdapter } from '../core/platform/memory';
import { fromBase64, toBase64 } from '../core/sync/relayCrypto';

interface Account {
  id: string;
  login: string;
  salt: string;
  kdf: string;
  auth: string;
  recovery: string;
  keyring: string;
  rkeyring: string;
  version: number;
}
type Data = Record<string, unknown> & { action: string };

export function fakeAccountRelay() {
  let next = 0;
  const id = (prefix: string) => `${prefix}-${String(++next).padStart(20, '0')}`;
  const accounts: Account[] = [];
  const sessions = new Map<string, { id: string; account: string; name: string }>();
  const vaults = new Map<string, { account: string | null }>();
  const devices = new Map<string, { vault: string; owner: boolean; session: string | null }>();
  const events = new Map<string, { seq: number; id: string; payload: string }[]>();
  const blobs = new Map<string, string>();
  const signups = new Set<string>();
  let seq = 0;
  const fail = (message: string) => Promise.reject(new Error(message));

  function handle(data: Data): unknown {
    const s = (key: string) => {
      const value = data[key];
      return typeof value === 'string' ? value : '';
    };
    const login = s('login').trim().toLowerCase();
    if (data.action === 'create') {
      const vault = id('vault'),
        token = id('owner');
      vaults.set(vault, { account: null });
      devices.set(token, { vault, owner: true, session: null });
      return { vault, token };
    }
    if (data.action === 'prelogin') {
      const found = accounts.find((a) => a.login === login);
      return found
        ? { salt: found.salt, kdf: found.kdf }
        : { salt: toBase64(new Uint8Array(16)), kdf: '{"alg":"argon2id","m":65536,"t":3,"p":1}' };
    }
    const start = (account: string) => {
      const token = id('session'),
        device = id('device');
      sessions.set(token, { id: device, account, name: s('name') });
      return { session: token, device };
    };
    if (data.action === 'register') {
      let attach: string | null = null;
      if (s('signup')) {
        if (!signups.delete(s('signup'))) throw new Error('Sign-up code expired or already used');
      } else {
        const owner = devices.get(s('token'));
        if (!owner?.owner || owner.vault !== s('vault'))
          throw new Error("Use the vault's original device for this action");
        if (vaults.get(owner.vault)?.account)
          throw new Error('This vault already belongs to an account');
        attach = owner.vault;
      }
      if (accounts.some((a) => a.login === login)) throw new Error('That username is taken');
      const account: Account = {
        id: id('account'),
        login,
        salt: s('salt'),
        kdf: s('kdf'),
        auth: s('auth'),
        recovery: s('recovery'),
        keyring: s('keyring'),
        rkeyring: s('rkeyring'),
        version: 1,
      };
      accounts.push(account);
      if (attach) vaults.set(attach, { account: account.id });
      return { ...start(account.id), version: 1 };
    }
    if (data.action === 'login') {
      const found = accounts.find((a) => a.login === login);
      const recovering = 'recovery' in data;
      if (!found || (recovering ? found.recovery !== s('recovery') : found.auth !== s('auth')))
        throw new Error('Username or password is wrong.');
      return {
        ...start(found.id),
        keyring: recovering ? found.rkeyring : found.keyring,
        version: found.version,
      };
    }
    if ('session' in data) {
      const current = sessions.get(s('session'));
      if (!current) throw new Error('Signed out. Sign in again.');
      const account = accounts.find((a) => a.id === current.account);
      if (!account) throw new Error('Signed out. Sign in again.');
      switch (data.action) {
        case 'logout':
          for (const [token, d] of devices) if (d.session === current.id) devices.delete(token);
          sessions.delete(s('session'));
          return { signedOut: true };
        case 'keyring_get':
          return { keyring: account.keyring, version: account.version };
        case 'keyring_put':
        case 'change_password': {
          if (data['version'] !== account.version)
            throw new Error('Keyring changed on another device');
          if (data.action === 'change_password') {
            const proof = 'recovery' in data ? account.recovery : account.auth;
            if (s('recovery' in data ? 'recovery' : 'current') !== proof)
              throw new Error('Current password is wrong.');
            Object.assign(account, { salt: s('salt'), kdf: s('kdf'), auth: s('auth') });
          }
          Object.assign(account, { keyring: s('keyring'), rkeyring: s('rkeyring') });
          account.version += 1;
          return { version: account.version };
        }
        case 'account_devices':
          return {
            devices: [...sessions.values()]
              .filter((x) => x.account === account.id)
              .map((x) => ({ id: x.id, name: x.name, seen: 0, current: x.id === current.id })),
          };
        case 'remove_device':
          for (const [token, x] of sessions)
            if (x.id === s('device') && x.account === account.id) {
              sessions.delete(token);
              for (const [t, d] of devices) if (d.session === x.id) devices.delete(t);
            }
          return { removed: true };
        case 'vault_create': {
          const vault = id('vault'),
            token = id('owner');
          vaults.set(vault, { account: account.id });
          devices.set(token, { vault, owner: true, session: null });
          return { vault, token };
        }
        case 'vault_attach':
          vaults.set(s('vault'), { account: account.id });
          return { attached: true };
        case 'vault_join': {
          if (vaults.get(s('vault'))?.account !== account.id)
            throw new Error('Vault access unavailable');
          const token = id('device-token');
          devices.set(token, { vault: s('vault'), owner: false, session: current.id });
          return { token };
        }
      }
    }
    const device = devices.get(s('token'));
    if (!device || device.vault !== s('vault')) throw new Error('Device access removed');
    const list = events.get(device.vault) ?? [];
    events.set(device.vault, list);
    switch (data.action) {
      case 'devices':
        return { devices: ['Device'] };
      case 'events':
        return { events: list.filter((e) => e.seq > Number(data['after'])).slice(0, 32) };
      case 'append':
        if (!list.some((e) => e.id === s('id')))
          list.push({ seq: ++seq, id: s('id'), payload: s('payload') });
        return { stored: true };
      case 'put':
        blobs.set(`${device.vault}/${s('id')}`, s('payload'));
        return { stored: true };
      case 'get':
        return { payload: blobs.get(`${device.vault}/${s('id')}`) };
    }
    throw new Error('Unsupported relay action');
  }

  return {
    signups,
    accounts,
    devices,
    request(_endpoint: string, _certificate: string, body: string): Promise<string> {
      try {
        return Promise.resolve(JSON.stringify(handle(JSON.parse(body) as Data)));
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  };
}

/** Quick PBKDF2 in place of Argon2id, so tests stay fast. Same inputs, same output. */
export async function fakeDeriveKey(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: 10 },
    key,
    512,
  );
  return toBase64(new Uint8Array(bits));
}

/** Gives a memory platform the relay, account sign-in and file projection. */
export function connectDevice(
  platform: MemoryAdapter,
  relay: ReturnType<typeof fakeAccountRelay>,
  device: string,
): void {
  const account: AccountAdapter = {
    relay: () =>
      Promise.resolve({
        endpoint: 'https://178.62.50.124',
        certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
        device,
      }),
    deriveKey: (password, salt) => fakeDeriveKey(password, salt),
    prepareFolder: (name) => {
      const path = `C:/Users/Ray/Documents/BenchWork/${name}`;
      platform.addFolder(path, {});
      return Promise.resolve(path);
    },
  };
  const adapter: RelayAdapter = {
    request: (endpoint, certificate, body) => relay.request(endpoint, certificate, body),
    apply: async (path, expected, encoded) => {
      const actual = (await platform.exists(path)) ? await platform.hashFile(path) : null;
      if (actual !== expected) return false;
      if (encoded === null) {
        if (actual) await platform.trash(path);
      } else {
        await platform.ensureDir(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
        await platform.writeBytes(path, fromBase64(encoded));
      }
      return true;
    },
    account,
  };
  platform.relay = adapter;
}
