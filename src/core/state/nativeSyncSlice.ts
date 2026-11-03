import type { SyncConnection, SyncPairing, SyncReport } from '../platform/types';
import { describeError, type StoreContext } from './context';
interface Saved {
  mode: 'host' | 'client';
  ip?: string;
  connection?: SyncConnection;
}
export interface NativeSyncSlice {
  desktopSync: {
    available: boolean;
    canHost: boolean;
    mode: 'off' | 'host' | 'client';
    running: boolean;
    busy: boolean;
    error: string;
    message: string;
    ip: string;
    endpoint: string;
    devices: string[];
    pairing: SyncPairing | null;
    lastSync: string | null;
    report: SyncReport | null;
    needsConfirmation: boolean;
    confirmed: boolean;
  };
  confirmOtherSyncStopped: (value: boolean) => void;
  startDesktopSync: (ip: string) => Promise<void>;
  stopDesktopSync: () => Promise<void>;
  createDesktopPairing: () => Promise<void>;
  exportDesktopPairing: () => Promise<void>;
  importDesktopPairing: (name: string) => Promise<void>;
  pairDesktopSync: (text: string, name: string) => Promise<void>;
  syncDesktopNow: () => Promise<void>;
  revokeDesktopDevices: () => Promise<void>;
}
export function createNativeSyncSlice(ctx: StoreContext): NativeSyncSlice {
  const { platform, get, set } = ctx;
  const native = platform.nativeSync;
  let connection: SyncConnection | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let active: Promise<void> | null = null;
  let closing = false;
  let key = '';
  const empty = () => ({
    available: !!native,
    canHost: platform.kind === 'desktop',
    mode: 'off' as const,
    running: false,
    busy: false,
    error: '',
    message: '',
    ip: '',
    endpoint: '',
    devices: [] as string[],
    pairing: null as SyncPairing | null,
    lastSync: null as string | null,
    report: null as SyncReport | null,
    needsConfirmation: false,
    confirmed: false,
  });
  const patch = (value: Partial<NativeSyncSlice['desktopSync']>) => {
    set((s) => ({ desktopSync: { ...s.desktopSync, ...value } }));
  };
  async function perform(task: () => Promise<void>) {
    if (!native || closing || active) return;
    patch({ busy: true, error: '' });
    const pending = task()
      .catch((e: unknown) => {
        patch({ error: describeError(e) });
      })
      .finally(() => {
        active = null;
        patch({ busy: false });
      });
    active = pending;
    await pending;
  }
  function consent() {
    if (get().desktopSync.needsConfirmation && !get().desktopSync.confirmed)
      throw new Error(
        'Pause Syncthing for this vault and confirm below before using Desktop Sync.',
      );
  }
  async function runSync() {
    consent();
    if (!native || !connection) return;
    await get().savePageNow();
    if (get().saveState === 'error' || get().pageConflict !== null)
      throw new Error('Save the open page successfully before syncing.');
    const report = await native.sync(connection, get().desktopSync.confirmed);
    patch({
      running: true,
      lastSync: new Date().toISOString(),
      report,
      message: `${String(report.uploaded)} uploaded, ${String(report.downloaded)} downloaded${report.conflicts.length ? `. ${String(report.conflicts.length)} conflicting versions kept separately` : ''}.`,
    });
  }
  async function remember(saved: Saved | null) {
    if (key) await platform.secureWrite(key, saved ? JSON.stringify(saved) : null);
  }
  function auto() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (get().desktopSync.mode === 'client') void perform(runSync);
      else if (native && get().desktopSync.running)
        void perform(async () => {
          const status = await native.status();
          patch({ devices: status.devices, running: status.running });
        });
    }, 15000);
  }
  async function pair(text: string, name: string) {
    consent();
    if (!native) return;
    if (text.length > 16000) throw new Error('Pairing details are too large.');
    if (!name.trim()) throw new Error('Give this device a name.');
    const invitation = JSON.parse(text) as Parameters<typeof native.join>[0];
    const paired = await native.join(invitation, name.trim());
    await remember({ mode: 'client', connection: paired });
    connection = paired;
    patch({
      mode: 'client',
      endpoint: paired.endpoint,
      running: true,
      message: 'Paired securely. Ready to sync saved vault files.',
    });
    auto();
    await runSync();
  }
  ctx.onVault({
    opened: async () => {
      closing = false;
      set({ desktopSync: empty() });
      connection = null;
      const token = ctx.session();
      if (!native) return;
      const root = get().status;
      if (root.kind !== 'open') return;
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(root.vault.root),
      );
      key = `native-sync-${Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('')}`;
      try {
        const needsConfirmation = await platform.exists('.stfolder');
        const ip = await native.localAddress();
        const raw = await platform.secureRead(key);
        if (token !== ctx.session()) return;
        patch({ ip, needsConfirmation });
        if (raw) {
          const saved = JSON.parse(raw) as Saved;
          if (saved.mode === 'client' && saved.connection) {
            connection = saved.connection;
            patch({ mode: 'client', endpoint: connection.endpoint });
            auto();
            if (!needsConfirmation) await perform(runSync);
          } else if (saved.mode === 'host' && saved.ip) {
            patch({ mode: 'host', ip: saved.ip });
            if (!needsConfirmation) {
              const status = await native.start(saved.ip, false);
              patch({
                running: status.running,
                endpoint: status.endpoint,
                devices: status.devices,
              });
              auto();
            }
          }
        }
      } catch (e) {
        if (token === ctx.session()) patch({ error: describeError(e) });
      }
    },
    closing: async () => {
      closing = true;
      if (timer) clearInterval(timer);
      timer = null;
      await active;
      await native?.stop();
    },
    closed: () => {
      connection = null;
      key = '';
      set({ desktopSync: empty() });
    },
  });
  return {
    desktopSync: empty(),
    confirmOtherSyncStopped(value) {
      patch({ confirmed: value });
    },
    startDesktopSync: (ip) =>
      perform(async () => {
        consent();
        if (!native) return;
        const status = await native.start(ip, get().desktopSync.confirmed);
        await remember({ mode: 'host', ip });
        patch({
          mode: 'host',
          running: status.running,
          ip,
          endpoint: status.endpoint,
          devices: status.devices,
          message: 'Desktop server is listening. Keep this PC awake with BenchWork open.',
        });
        auto();
      }),
    stopDesktopSync: () =>
      perform(async () => {
        if (timer) clearInterval(timer);
        timer = null;
        await native?.stop();
        await remember(null);
        connection = null;
        patch({
          mode: 'off',
          running: false,
          pairing: null,
          devices: [],
          endpoint: '',
          message: 'Desktop Sync is disabled on this device. Vault files are kept.',
        });
      }),
    createDesktopPairing: () =>
      perform(async () => {
        if (native) patch({ pairing: await native.invitation() });
      }),
    exportDesktopPairing: () =>
      perform(async () => {
        const pairing = get().desktopSync.pairing;
        if (!native || !pairing) return;
        patch({
          message: `Pairing file saved: ${await native.exportInvitation(pairing.text)}. Transfer it privately to the tablet and import it within ten minutes.`,
        });
      }),
    importDesktopPairing: (name) =>
      perform(async () => {
        if (!native) return;
        const [source] = await platform.pickFiles({
          title: 'Choose a BenchWork pairing file',
          multiple: false,
        });
        if (source) await pair(JSON.stringify(await native.readInvitation(source)), name);
      }),
    pairDesktopSync: (text, name) => perform(() => pair(text, name)),
    syncDesktopNow: () => perform(runSync),
    revokeDesktopDevices: () =>
      perform(async () => {
        await native?.revoke();
        patch({
          devices: [],
          pairing: null,
          message: 'All paired devices removed. Generate new pairing details to reconnect one.',
        });
      }),
  };
}
