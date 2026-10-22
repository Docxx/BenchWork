import type { StoreApi } from 'zustand/vanilla';
import type { ModuleRegistry } from '../modules/registry';
import { PlatformError, type PlatformAdapter } from '../platform';
import { VaultConfigError, type VaultConfig } from '../vault/vaultConfig';
import { saveVaultConfig } from '../vault/vaultService';
import type { AppState } from './appStore';

type SetState = StoreApi<AppState>['setState'];
type GetState = StoreApi<AppState>['getState'];

/** Hooks a slice can register to take part in a vault opening or closing. */
export interface VaultLifecycle {
  /** After the vault is open and its config is loaded. Runs in registration order. */
  opened?: (config: VaultConfig) => Promise<void> | void;
  /**
   * Before the vault closes, while the platform still points at it: finish
   * writing anything that belongs to this vault. Runs in reverse order.
   */
  closing?: () => Promise<void> | void;
  /** After the vault has closed: reset this slice's state. */
  closed?: () => void;
}

/** What every slice shares: services, the vault session, and config saving. */
export interface StoreContext {
  readonly platform: PlatformAdapter;
  readonly registry: ModuleRegistry;
  readonly set: SetState;
  readonly get: GetState;

  /**
   * Bumped whenever a vault opens or closes. Work that started in an older
   * session (a folder listing, a save) checks this and gives up, so it can
   * never land in a different vault.
   */
  session(): number;
  bumpSession(): void;

  onVault(hooks: VaultLifecycle): void;
  readonly lifecycle: readonly VaultLifecycle[];

  /**
   * Changes the open vault's config in memory and queues a save. Saves run
   * one at a time and write whatever is newest when their turn comes.
   */
  updateConfig(change: (config: VaultConfig) => VaultConfig): Promise<void>;
  /** Resolves when every queued config save has finished. */
  configSaved(): Promise<void>;
}

export function createStoreContext(
  platform: PlatformAdapter,
  registry: ModuleRegistry,
  set: SetState,
  get: GetState,
): StoreContext {
  let session = 0;
  let configSaves: Promise<void> = Promise.resolve();
  const lifecycle: VaultLifecycle[] = [];

  return {
    platform,
    registry,
    set,
    get,
    session: () => session,
    bumpSession: () => {
      session += 1;
    },
    onVault: (hooks) => {
      lifecycle.push(hooks);
    },
    lifecycle,
    updateConfig(change) {
      const status = get().status;
      if (status.kind !== 'open') return Promise.resolve();
      const config = change(status.vault.config);
      set({ status: { kind: 'open', vault: { ...status.vault, config } } });

      const token = session;
      const save = configSaves.then(async () => {
        const current = get().status;
        if (token !== session || current.kind !== 'open') return;
        await saveVaultConfig(platform, current.vault.config);
      });
      configSaves = save.catch(() => undefined);
      return save;
    },
    configSaved: () => configSaves,
  };
}

/** A short, plain message for an error, for showing in the UI. */
export function describeError(err: unknown): string {
  if (err instanceof VaultConfigError) {
    return `The vault settings could not be read. ${err.message}`;
  }
  const e = PlatformError.from(err);
  switch (e.kind) {
    case 'NotFound':
      return 'That folder could not be found.';
    case 'NotADirectory':
      return 'That is a file, not a folder.';
    default:
      return `Something went wrong: ${e.message}`;
  }
}
