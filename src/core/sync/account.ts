/**
 * Account sign-in for Cloud sync. The password never leaves the device: Argon2id
 * turns it into a sign-in key (sent, stored by the relay only as a hash) and a
 * wrapping key (never sent) that seals the keyring. The keyring lists the
 * account's vaults with their content keys, so a new device that signs in can
 * join them with no other steps.
 */
import type { AccountKdf, PlatformAdapter } from '../platform/types';
import { request, type RelayAddress, type RelayConnection } from './relayClient';
import { fromBase64, seal, toBase64, unseal } from './relayCrypto';

export const DEFAULT_KDF: AccountKdf = { alg: 'argon2id', m: 65536, t: 3, p: 1 };
export const MIN_PASSWORD = 12;

/** One vault the account can sync. Only ever stored sealed. */
export interface KeyringVault {
  /** The relay's routing id for the vault. */
  id: string;
  name: string;
  /** The vault's AES-256-GCM content key, base64. */
  key: string;
  /** The account's owner credential for the vault, for owner-only actions. */
  owner: string;
}
export interface Keyring {
  /** Equal to the relay's version for this keyring; never goes backwards. */
  revision: number;
  /** Wrapping key for the recovery copy, so any device can keep it current. */
  recoveryWrap: string;
  vaults: KeyringVault[];
}
/** What a signed-in device keeps in secure storage. */
export interface AccountSession {
  login: string;
  session: string;
  device: string;
  wrap: string;
  keyring: Keyring;
}
export interface AccountKeys {
  /** Sent to the relay to sign in. */
  auth: string;
  /** Seals the keyring. Never sent. */
  wrap: string;
}

const encoder = new TextEncoder(),
  decoder = new TextDecoder();

function base64url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function expand(secret: Uint8Array<ArrayBuffer>, info: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: encoder.encode(info) },
      key,
      256,
    ),
  );
}

/** Splits one secret into the sign-in key and the wrapping key. */
export async function splitKeys(secret: Uint8Array<ArrayBuffer>): Promise<AccountKeys> {
  return {
    auth: base64url(await expand(secret, 'benchwork account auth v1')),
    wrap: toBase64(await expand(secret, 'benchwork account wrap v1')),
  };
}

export function normaliseLogin(login: string): string {
  return login.trim().toLowerCase();
}
export function checkLogin(login: string): string {
  const value = normaliseLogin(login);
  if (!/^[a-z0-9._@+-]{3,80}$/.test(value))
    throw new Error('Use 3 to 80 letters, numbers or . _ @ + - in the username.');
  return value;
}
export function checkNewPassword(password: string, again: string): void {
  if (password.length < MIN_PASSWORD)
    throw new Error(
      `Use at least ${String(MIN_PASSWORD)} characters. A short sentence works well.`,
    );
  if (password !== again) throw new Error('The two passwords are different.');
}

function account(platform: PlatformAdapter) {
  const adapter = platform.relay?.account;
  if (!adapter) throw new Error('Signing in needs the installed BenchWork app.');
  return adapter;
}

export async function passwordKeys(
  platform: PlatformAdapter,
  password: string,
  salt: string,
  kdf: AccountKdf,
): Promise<AccountKeys> {
  // The relay supplies these settings, so never accept weaker ones from it.
  if ((kdf.alg as string) !== 'argon2id' || kdf.m < DEFAULT_KDF.m || kdf.t < DEFAULT_KDF.t)
    throw new Error('The sync server asked for unsafe password settings.');
  return splitKeys(fromBase64(await account(platform).deriveKey(password, salt, kdf)));
}

/** A recovery key: 32 random bytes in hex, shown in groups so it can be copied by hand. */
export function newRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const text = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return (text.match(/.{4}/g) ?? []).join('-');
}
export function recoveryKeys(recovery: string): Promise<AccountKeys> {
  const text = recovery.replace(/[\s-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text))
    return Promise.reject(new Error('That recovery key is not complete.'));
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return splitKeys(bytes);
}

/** Seals the keyring. The revision is bound inside, so the relay cannot replay an old one. */
export function sealKeyring(wrap: string, keyring: Keyring): Promise<string> {
  return seal(wrap, 'account', 'keyring', 'keyring', encoder.encode(JSON.stringify(keyring)));
}

export async function openKeyring(
  wrap: string,
  payload: string,
  version: number,
  seen = 0,
): Promise<Keyring> {
  let keyring: Keyring;
  try {
    keyring = JSON.parse(
      decoder.decode(await unseal(wrap, 'account', 'keyring', 'keyring', payload)),
    ) as Keyring;
  } catch {
    throw new Error('Username or password is wrong.');
  }
  if (
    keyring.revision !== version ||
    version < seen ||
    !Array.isArray(keyring.vaults) ||
    typeof keyring.recoveryWrap !== 'string'
  )
    throw new Error('The sync server sent an out-of-date keyring. Try again later.');
  for (const vault of keyring.vaults)
    if (fromBase64(vault.key).length !== 32) throw new Error('The keyring is damaged.');
  return keyring;
}

/** Talks to the built-in relay for account actions. */
export class AccountClient {
  private constructor(
    readonly platform: PlatformAdapter,
    readonly address: RelayAddress,
    readonly device: string,
  ) {}
  static async open(platform: PlatformAdapter): Promise<AccountClient> {
    const relay = await account(platform).relay();
    return new AccountClient(
      platform,
      { endpoint: relay.endpoint, certificate: relay.certificate },
      relay.device,
    );
  }
  call<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
    return request<T>(this.platform, this.address, { action, ...data });
  }
  async prelogin(login: string): Promise<{ salt: string; kdf: AccountKdf }> {
    const value = await this.call<{ salt: string; kdf: string }>('prelogin', { login });
    return { salt: value.salt, kdf: JSON.parse(value.kdf) as AccountKdf };
  }
  /** Seals both keyring copies and stores them, if no other device changed it first. */
  async save(session: AccountSession, vaults: KeyringVault[]): Promise<AccountSession> {
    const revision = session.keyring.revision + 1;
    const keyring: Keyring = { ...session.keyring, revision, vaults };
    const result = await this.call<{ version: number }>('keyring_put', {
      session: session.session,
      version: session.keyring.revision,
      keyring: await sealKeyring(session.wrap, keyring),
      rkeyring: await sealKeyring(session.keyring.recoveryWrap, keyring),
    });
    if (result.version !== revision) throw new Error('Keyring changed on another device.');
    return { ...session, keyring };
  }
  async refresh(session: AccountSession): Promise<AccountSession> {
    const value = await this.call<{ keyring: string; version: number }>('keyring_get', {
      session: session.session,
    });
    const keyring = await openKeyring(
      session.wrap,
      value.keyring,
      value.version,
      session.keyring.revision,
    );
    return { ...session, keyring };
  }
  /** A connection for one vault, with a credential for this device. */
  async join(session: AccountSession, vault: KeyringVault): Promise<RelayConnection> {
    const result = await this.call<{ token: string }>('vault_join', {
      session: session.session,
      vault: vault.id,
      name: this.device,
    });
    return {
      ...this.address,
      protocol: 1,
      vault: vault.id,
      token: result.token,
      key: vault.key,
      owner: false,
      name: this.device,
    };
  }
}
