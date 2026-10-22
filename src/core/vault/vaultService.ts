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
 * - `vault`: already has a `.benchwork` folder
 * - `empty`: nothing in it, safe to set up straight away
 * - `folder`: has other files, so ask before adding `.benchwork`
 */
export type FolderKind = 'vault' | 'empty' | 'folder';

export interface FolderCheck {
  root: string;
  kind: FolderKind;
}

/** Points the platform at a folder and reports what is in it. */
export async function checkFolder(platform: PlatformAdapter, path: string): Promise<FolderCheck> {
  const root = await platform.setVaultRoot(path);
  if (await platform.exists(VAULT_DIR)) return { root, kind: 'vault' };
  const entries = await platform.listDir('');
  return { root, kind: entries.length === 0 ? 'empty' : 'folder' };
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
