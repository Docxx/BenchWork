import { CardStore } from '../sync/cards';
import {
  RelayClient,
  createRelay,
  joinRelay,
  type RelayAddress,
  type RelayConnection,
} from '../sync/relayClient';
import { RelayEngine, describeProgress, type RelayReport } from '../sync/relayEngine';
import { sha256 } from '../sync/relayCrypto';
import { allowed } from '../sync/relayModel';
import { describeError, type StoreContext } from './context';

export interface RelaySyncSlice {
  relaySync: {
    available: boolean;
    enabled: boolean;
    busy: boolean;
    owner: boolean;
    error: string;
    lastSync: string | null;
    report: RelayReport | null;
    pairing: string;
    recovery: string;
    devices: string[];
    confirmed: boolean;
    endpoint: string;
    message: string;
    /** What a running sync is doing, such as files read and pieces sent. */
    progress: string;
  };
  confirmRelaySync: (value: boolean) => void;
  createCloudSync: (setup: string, name: string) => Promise<void>;
  joinCloudSync: (invitation: string, name: string) => Promise<void>;
  syncCloudNow: () => Promise<void>;
  pairCloudDevice: () => Promise<void>;
  stopCloudSync: () => Promise<void>;
  closeCloudSharing: () => Promise<void>;
  restoreCloudSync: (recovery: string) => Promise<void>;
  saveCloudDetails: (kind: 'pairing' | 'recovery') => Promise<void>;
  /**
   * Starts Cloud sync with a connection from the account. `fresh` means
   * BenchWork made this folder itself, so no other folder sync can be on it.
   */
  adoptCloudSync: (connection: RelayConnection, fresh: boolean) => Promise<void>;
  /** The open vault's connection, for the account. Null when not set up. */
  cloudConnection: () => RelayConnection | null;
  /**
   * Readable cards on the relay: fly stocks a scanned vial shows on the phone,
   * and labels the phone keeps in step. Null until Cloud sync is set up.
   */
  cloudCards: () => CardStore | null;
}
export function createRelaySyncSlice(ctx: StoreContext): RelaySyncSlice {
  const { platform, get, set } = ctx;
  let engine: RelayEngine | null = null,
    connection: RelayConnection | null = null;
  let secretKey = '',
    timer: ReturnType<typeof setTimeout> | undefined;
  let watching: (() => void) | undefined,
    active: Promise<void> | null = null;
  let closing = false,
    failures = 0;
  let lastRoster = 0;
  const empty = (): RelaySyncSlice['relaySync'] => ({
    available: !!platform.relay,
    enabled: false,
    busy: false,
    owner: false,
    error: '',
    lastSync: null,
    report: null,
    pairing: '',
    recovery: '',
    devices: [],
    confirmed: false,
    endpoint: '',
    message: '',
    progress: '',
  });
  const patch = (value: Partial<RelaySyncSlice['relaySync']>) => {
    set((s) => ({ relaySync: { ...s.relaySync, ...value } }));
  };
  const consent = () => {
    if (!get().relaySync.confirmed)
      throw new Error('Confirm that Syncthing and other folder sync are stopped for this vault.');
    if (get().desktopSync.mode !== 'off')
      throw new Error('Disable Desktop Sync before enabling Cloud sync.');
  };
  function schedule(delay = 3000): void {
    if (timer) clearTimeout(timer);
    if (closing || !connection) return;
    timer = setTimeout(() => {
      void perform(run);
    }, delay);
  }
  async function perform(work: () => Promise<void>): Promise<void> {
    if (closing || active || !platform.relay) return;
    patch({ busy: true, error: '' });
    active = Promise.resolve()
      .then(work)
      .then(() => {
        failures = 0;
      })
      .catch((err: unknown) => {
        failures += 1;
        patch({ error: describeError(err) });
      })
      .finally(() => {
        active = null;
        patch({ busy: false, progress: '' });
        schedule(Math.min(60000, 3000 * 2 ** Math.min(failures, 5)));
      });
    await active;
  }
  async function run(): Promise<void> {
    if (!get().relaySync.confirmed) return;
    if (!engine) {
      if (get().relaySync.enabled)
        throw new Error(
          'Sync history is unavailable. Save recovery details, disconnect, and use explicit recovery.',
        );
      return;
    }
    consent();
    await get().savePageNow();
    if (get().saveState === 'error' || get().pageConflict)
      throw new Error('Save or resolve the open page before syncing.');
    const report = await engine.sync();
    patch({ report, lastSync: new Date().toISOString() });
    if (Date.now() - lastRoster > 60000) {
      const roster = await engine.client.call<{ devices: string[] }>('devices');
      patch({ devices: roster.devices });
      lastRoster = Date.now();
    }
  }
  async function connect(
    value: RelayConnection,
    initialise: boolean,
    rebuild = false,
  ): Promise<void> {
    engine?.destroy();
    engine = null;
    connection = value;
    patch({
      enabled: true,
      owner: value.owner,
      endpoint: value.endpoint,
      recovery: value.owner ? JSON.stringify({ recovery: 1, connection: value }) : '',
    });
    const next = await RelayEngine.open(platform, value, initialise, rebuild);
    next.onProgress = (progress) => {
      patch({ progress: describeProgress(progress) });
    };
    next.beforeProject = async () => {
      await get().savePageNow();
      if (get().saveState !== 'saved' || get().pageConflict)
        throw new Error('Waiting for the open page to finish saving.');
    };
    // Credentials are device-local and tied to the full vault path. A restored
    // backup has history but cannot silently reconnect to the active vault.
    await platform.secureWrite(secretKey, JSON.stringify(value));
    engine = next;
    connection = value;
    patch({
      enabled: true,
      owner: value.owner,
      endpoint: value.endpoint,
      recovery: value.owner ? JSON.stringify({ recovery: 1, connection: value }) : '',
    });
    // Reopening an offline vault never waits for the network. The retry loop
    // connects after the local workspace is available.
    if (!initialise) {
      schedule(100);
      return;
    }
    await run();
  }
  ctx.onVault({
    opened: async () => {
      closing = false;
      failures = 0;
      set({ relaySync: empty() });
      const status = get().status;
      if (!platform.relay || status.kind !== 'open') return;
      secretKey = `relay-${await sha256(new TextEncoder().encode(status.vault.root))}`;
      const raw = await platform.secureRead(secretKey);
      watching = platform.watch(({ paths }) => {
        if (paths.some(allowed) && !active) schedule(700);
      });
      if (typeof window !== 'undefined') {
        window.addEventListener('online', wake);
        document.addEventListener('visibilitychange', wake);
      }
      if (raw) {
        patch({ enabled: true });
        // Syncthing markers need confirmation again each launch, as with LAN sync.
        const confirmed = !(await platform.exists('.stfolder'));
        patch({ confirmed });
        await perform(async () => {
          await connect(JSON.parse(raw) as RelayConnection, false);
        });
      }
    },
    closing: async () => {
      closing = true;
      if (timer) clearTimeout(timer);
      watching?.();
      watching = undefined;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', wake);
        document.removeEventListener('visibilitychange', wake);
      }
      await active;
      engine?.destroy();
      engine = null;
      connection = null;
    },
    closed: () => {
      secretKey = '';
      set({ relaySync: empty() });
    },
  });
  function wake(): void {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') schedule(100);
  }
  return {
    relaySync: empty(),
    saveCloudDetails: (kind) =>
      perform(async () => {
        if (!platform.relay?.exportDetails)
          throw new Error('Copy these details into a private file.');
        const text = get().relaySync[kind];
        if (!text) return;
        patch({ message: `Saved to ${await platform.relay.exportDetails(text)}` });
      }),
    confirmRelaySync: (confirmed) => {
      patch({ confirmed });
      if (confirmed) schedule(100);
    },
    createCloudSync: (text, name) =>
      perform(async () => {
        consent();
        if (get().relaySync.enabled) throw new Error('Cloud sync is already configured.');
        const setup = JSON.parse(text) as RelayAddress & { setup: string };
        const value = await createRelay(platform, setup, setup.setup, name);
        // Secure enrolment is written before starting local history. On a local
        // disk error the credential survives and can be recovered explicitly.
        await platform.secureWrite(secretKey, JSON.stringify(value));
        await connect(value, true);
      }),
    joinCloudSync: (text, name) =>
      perform(async () => {
        consent();
        if (get().relaySync.enabled) throw new Error('Cloud sync is already configured.');
        const value = await joinRelay(platform, text, name);
        await platform.secureWrite(secretKey, JSON.stringify(value));
        await connect(value, true);
      }),
    restoreCloudSync: (text) =>
      perform(async () => {
        consent();
        if (get().relaySync.enabled)
          throw new Error('Disconnect this device before restoring sharing.');
        if (text.length > 16000) throw new Error('Recovery details are too large.');
        const recovery = JSON.parse(text) as { recovery: number; connection?: RelayConnection };
        if (
          recovery.recovery !== 1 ||
          recovery.connection?.protocol !== 1 ||
          !recovery.connection.owner
        )
          throw new Error('Invalid recovery details.');
        await connect(recovery.connection, true, true);
      }),
    adoptCloudSync: async (value, fresh) => {
      if (fresh && get().desktopSync.mode === 'off' && !(await platform.exists('.stfolder')))
        patch({ confirmed: true });
      let failure: unknown = null;
      // perform() skips work while a sync runs; this must not be skipped.
      while (active) await active;
      await perform(async () => {
        try {
          consent();
          if (get().relaySync.enabled) throw new Error('Cloud sync is already configured.');
          await platform.secureWrite(secretKey, JSON.stringify(value));
          await connect(value, true);
        } catch (err) {
          failure = err;
          throw err;
        }
      });
      if (failure) throw failure instanceof Error ? failure : new Error(describeError(failure));
    },
    cloudConnection: () => connection,
    cloudCards: () => (connection === null ? null : new CardStore(platform, connection)),
    syncCloudNow: () => perform(run),
    pairCloudDevice: () =>
      perform(async () => {
        consent();
        if (!connection) return;
        await run();
        patch({ pairing: await new RelayClient(platform, connection).invitation() });
      }),
    stopCloudSync: () =>
      perform(async () => {
        if (timer) clearTimeout(timer);
        await platform.secureWrite(secretKey, null);
        engine?.destroy();
        engine = null;
        connection = null;
        patch({ ...empty(), confirmed: get().relaySync.confirmed });
      }),
    closeCloudSharing: () =>
      perform(async () => {
        if (!connection?.owner) throw new Error('Use the original device to remove sharing.');
        await new RelayClient(platform, connection).call('close');
        await platform.secureWrite(secretKey, null);
        engine?.destroy();
        engine = null;
        connection = null;
        patch({ ...empty(), confirmed: get().relaySync.confirmed });
      }),
  };
}
