import type { PlatformAdapter } from '../platform';
import {
  defaultVaultConfig,
  parseVaultConfig,
  serialiseVaultConfig,
  VAULT_CONFIG_PATH,
  VAULT_DIR,
  type VaultConfig,
} from './vaultConfig';

export interface OpenVault {
  /** Full path of the vault folder, as shown to the user. */
  root: string;
  config: VaultConfig;
}

/**
 * What a chosen folder is:
 * - `vault`: a vault, or a `.benchwork` folder whose vault is `root`
 * - `empty`: nothing in it, safe to set up straight away
 * - `folder`: has other files, so ask before adding `.benchwork`
 * - `awaiting-sync`: a folder a sync app syncs, with nothing in it yet but
 *   the app's own files; most likely a vault still on its way from
 *   another device, so wait rather than set up a new one
 * - `inside-vault`: an ordinary folder inside the vault `owner`, so ask
 *   whether to open that vault or make this folder a vault of its own
 */
export type FolderCheck =
  | { kind: 'vault' | 'empty' | 'folder' | 'awaiting-sync'; root: string }
  | { kind: 'inside-vault'; root: string; owner: string };

/**
 * Reports what a chosen folder is. For every kind except `inside-vault` it
 * also points the platform at the folder (or its vault), ready to open.
 */
export async function checkFolder(platform: PlatformAdapter, path: string): Promise<FolderCheck> {
  const owner = await platform.findVaultRoot(path);
  if (owner?.via === 'ancestor') {
    return { kind: 'inside-vault', root: owner.folder, owner: owner.root };
  }
  const root = await platform.setVaultRoot(owner?.root ?? path);
  if (owner !== null) return { root, kind: 'vault' };
  const entries = await platform.listDir('');
  if (entries.length === 0) return { root, kind: 'empty' };
  // Syncthing's own: .stfolder, .stignore, .stversions.
  const syncthing = entries.every((e) => e.name.startsWith('.st'));
  if (syncthing && entries.some((e) => e.name === '.stfolder'))
    return { root, kind: 'awaiting-sync' };
  return { root, kind: 'folder' };
}

/**
 * Adds `.benchwork/config.json` to the current folder if it is missing.
 * Writes nothing else, and never changes an existing config.
 */
export async function initialiseVault(platform: PlatformAdapter): Promise<void> {
  await platform.ensureDir(VAULT_DIR);
  if (!(await platform.exists(VAULT_CONFIG_PATH))) {
    await platform.writeTextAtomic(VAULT_CONFIG_PATH, serialiseVaultConfig(defaultVaultConfig()));
  }
}

/** Reads the current folder's config. Throws VaultConfigError if it is unreadable. */
export async function loadVaultConfig(platform: PlatformAdapter): Promise<VaultConfig> {
  return parseVaultConfig(await platform.readText(VAULT_CONFIG_PATH));
}

export function saveVaultConfig(platform: PlatformAdapter, config: VaultConfig): Promise<void> {
  return platform.writeTextAtomic(VAULT_CONFIG_PATH, serialiseVaultConfig(config));
}
