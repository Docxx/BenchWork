/**
 * The phone's link to BenchWork. The label app signs in to the same account
 * as the desktop, keeps the device credential it is given, and uses it to
 * fetch labels and the stock behind a scanned vial. The password is typed on
 * the phone and never kept.
 */
import {
  AccountClient,
  checkLogin,
  openKeyring,
  passwordKeys,
  type AccountSession,
  type Keyring,
} from '../core/sync/account';
import { CardStore } from '../core/sync/cards';
import type { RelayConnection } from '../core/sync/relayClient';
import type { PlatformAdapter } from '../core/platform';

const KEY = 'benchwork.label-studio.connection';

/** The connection this phone was given, or null until it signs in. */
export function savedConnection(): RelayConnection | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as RelayConnection;
    return typeof value.vault === 'string' && typeof value.token === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function forgetConnection(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* A phone with storage off simply signs in again. */
  }
}

/** Which vaults the account holds, for a phone that must choose one. */
export interface SignedIn {
  session: AccountSession;
  client: AccountClient;
  vaults: Keyring['vaults'];
}

export async function signIn(
  platform: PlatformAdapter,
  loginText: string,
  password: string,
): Promise<SignedIn> {
  const login = checkLogin(loginText);
  if (!password) throw new Error('Enter your password.');
  const client = await AccountClient.open(platform);
  const { salt, kdf } = await client.prelogin(login);
  const keys = await passwordKeys(platform, password, salt, kdf);
  const result = await client.call<{ session: string; keyring: string; version: number }>('login', {
    login,
    auth: keys.auth,
    name: client.device,
  });
  const keyring = await openKeyring(keys.wrap, result.keyring, result.version, 0);
  const session: AccountSession = {
    session: result.session,
    wrap: keys.wrap,
    keyring,
    login,
    device: client.device,
  };
  return { session, client, vaults: keyring.vaults };
}

/** Joins one vault and keeps its credential on this phone. */
export async function keepVault(signedIn: SignedIn, vaultId: string): Promise<RelayConnection> {
  const vault = signedIn.vaults.find((v) => v.id === vaultId);
  if (!vault) throw new Error('That vault is not on this account.');
  const connection = await signedIn.client.join(signedIn.session, vault);
  localStorage.setItem(KEY, JSON.stringify(connection));
  return connection;
}

export function cardStore(platform: PlatformAdapter): CardStore | null {
  const connection = savedConnection();
  return connection ? new CardStore(platform, connection) : null;
}
