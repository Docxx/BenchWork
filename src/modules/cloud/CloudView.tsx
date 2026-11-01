import { useEffect, useState } from 'react';
import type { ModuleContext, VaultItem, VerifiedCopy } from '@core/api';
import {
  CloudSession,
  copyFile,
  parseConnections,
  PROVIDERS,
  sizeLabel,
  type Connection,
  type Provider,
} from './storage';
import './cloud.css';

export function CloudView({ ctx, session }: { ctx: ModuleContext; session: CloudSession }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [provider, setProvider] = useState<Provider>('OneDrive');
  const [name, setName] = useState('');
  const [connection, setConnection] = useState('');
  const [source, setSource] = useState('');
  const [dataset, setDataset] = useState('');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [records, setRecords] = useState<{ path: string; data: Record<string, unknown> }[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(session.current() !== null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    void ctx.deviceStorage
      .read('connections')
      .then((saved) => {
        const all = parseConnections(saved);
        setConnections(all);
        setConnection(all[0]?.id ?? '');
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
    const pending = session.current();
    if (pending)
      void pending.pending
        .finally(() => {
          setBusy(false);
          setRevision((n) => n + 1);
        })
        .catch(() => undefined);
  }, [ctx, session]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const all = await ctx.app.items();
        const saved = await Promise.all(
          all
            .filter((i) => i.type === 'cloud')
            .map(async (i) => ({ path: i.path, ...(await ctx.vault.readRecord(i.path)) })),
        );
        if (live) {
          setItems(all);
          setRecords(
            saved.filter((r) => r.error === null).map((r) => ({ path: r.path, data: r.data })),
          );
        }
      } catch (err) {
        if (live) setError(String(err));
      }
    };
    const watching = ctx.vault.watch(() => {
      void load();
    });
    void load();
    return () => {
      live = false;
      watching.dispose();
    };
  }, [ctx, revision]);
  const action = async (run: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await run();
      setRevision((n) => n + 1);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };
  const connect = () =>
    action(async () => {
      const folder = await ctx.fileTransfers?.pickFolder();
      if (!folder) return;
      if (ctx.vault.vaultPathOf(folder) !== null)
        throw new Error('Choose a provider folder outside this vault.');
      const next = [
        ...connections,
        { id: crypto.randomUUID(), provider, name: name.trim() || provider, folder },
      ];
      await ctx.deviceStorage.write('connections', next);
      setConnections(next);
      setConnection(next.at(-1)?.id ?? '');
      setName('');
    });
  const chosen = connections.find((c) => c.id === connection);
  return (
    <div className="cloud-workspace">
      <div className="cloud-intro">
        <h2>Large data, lighter notebooks</h2>
        <p>
          Copy images and datasets to a folder managed by your cloud sync app. BenchWork keeps a
          small linked record and checks that the copied bytes match.
        </p>
        <p className="hint">
          Your provider’s desktop app handles uploading and online-only files. A verified local copy
          does not confirm that an upload has finished.
        </p>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {ctx.fileTransfers ? (
        <>
          <details open={connections.length === 0}>
            <summary>Storage connections</summary>
            <div className="cloud-form">
              <label>
                Provider
                <select
                  aria-label="Cloud provider"
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value as Provider);
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Account label
                <input
                  value={name}
                  placeholder="Personal or university"
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                />
              </label>
              <button type="button" disabled={busy} onClick={() => void connect()}>
                Choose provider folder
              </button>
            </div>
            {connections.map((c) => (
              <div key={c.id} className="cloud-connection">
                <strong>{c.name}</strong>
                <span>{c.folder}</span>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const next = connections.filter((x) => x.id !== c.id);
                      await ctx.deviceStorage.write('connections', next);
                      setConnections(next);
                      if (connection === c.id) setConnection(next[0]?.id ?? '');
                    })
                  }
                >
                  Disconnect {c.name}
                </button>
              </div>
            ))}
          </details>
          <section aria-label="Copy to cloud storage" className="cloud-form">
            <label>
              Storage destination
              <select
                aria-label="Storage destination"
                value={connection}
                onChange={(e) => {
                  setConnection(e.target.value);
                }}
              >
                <option value="">Choose a connection</option>
                {connections.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name} · {c.provider}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const [file] = await ctx.vault.pickFiles({
                      title: 'Choose a large data file',
                      multiple: false,
                    });
                    if (file) setSource(file);
                  })
                }
              >
                Choose data file
              </button>
              <p className="hint">
                {source || 'Your source stays in place until you explicitly remove it.'}
              </p>
            </div>
            <label>
              Link to dataset
              <select
                aria-label="Link to dataset"
                value={dataset}
                onChange={(e) => {
                  setDataset(e.target.value);
                }}
              >
                <option value="">No dataset link</option>
                {items
                  .filter((i) => i.type === 'dataset')
                  .map((i) => (
                    <option key={i.path} value={i.path}>
                      {i.title}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !source || !chosen}
              onClick={() =>
                void action(async () => {
                  if (chosen) {
                    const path = await session.perform(
                      (id) => copyFile(ctx, chosen, source, dataset, id),
                      true,
                    );
                    setSelected(path);
                    setSource('');
                  }
                })
              }
            >
              Copy and verify
            </button>
          </section>
        </>
      ) : (
        <p className="notice">
          Connect provider folders and transfer files on a computer. Your storage records can be
          reviewed on this tablet.
        </p>
      )}
      {busy && session.current() !== null && (
        <div role="status" className="cloud-progress">
          Working on your file. Large files are copied and checked without loading them into memory.{' '}
          {session.current()?.cancellable && (
            <button type="button" className="quiet" onClick={() => void session.cancel()}>
              Cancel transfer
            </button>
          )}
        </div>
      )}
      <section aria-label="Stored datasets">
        <h2>Stored files</h2>
        {records.length === 0 && (
          <p className="hint">Your verified cloud-storage records will appear here.</p>
        )}
        <div className="cloud-records">
          {records.map((record) => (
            <button
              key={record.path}
              type="button"
              className="cloud-record quiet"
              aria-pressed={selected === record.path}
              onClick={() => {
                setSelected(record.path);
              }}
            >
              <strong>
                {record.path
                  .split('/')
                  .at(-1)
                  ?.replace(/\.cloud\.yaml$/, '')}
              </strong>
              <span>
                {text(record.data['account'])} · {text(record.data['status'])}
              </span>
              <small>
                {typeof record.data['size'] === 'number' ? sizeLabel(record.data['size']) : ''}
              </small>
            </button>
          ))}
        </div>
      </section>
      {records.find((r) => r.path === selected) && (
        <StorageDetails
          key={selected}
          ctx={ctx}
          session={session}
          path={selected}
          data={records.find((r) => r.path === selected)?.data ?? {}}
          busy={busy}
          action={action}
          connections={connections}
        />
      )}
    </div>
  );
}
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function StorageDetails({
  ctx,
  session,
  path,
  data,
  busy,
  action,
  connections,
}: {
  ctx: ModuleContext;
  session: CloudSession;
  path: string;
  data: Record<string, unknown>;
  busy: boolean;
  action: (run: () => Promise<void>) => Promise<void>;
  connections: Connection[];
}) {
  const [copy, setCopy] = useState<VerifiedCopy | null>(null);
  const [manage, setManage] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    void ctx.deviceStorage
      .read<Record<string, VerifiedCopy>>('receipts')
      .then((all) => {
        setCopy(all?.[path] ?? null);
      })
      .catch(() => {
        setNotice('This device could not read the file location.');
      });
  }, [ctx, path]);
  const sourceInCloud =
    copy !== null &&
    connections.some((c) =>
      copy.source
        .replaceAll('\\', '/')
        .toLowerCase()
        .startsWith(`${c.folder.replaceAll('\\', '/').toLowerCase()}/`),
    );
  return (
    <section className="cloud-details" aria-label="Storage file details">
      <h2>{text(data['provider'])} copy</h2>
      <p>{text(data['storagePath'])}</p>
      <p className="hint">SHA-256: {text(data['sha256']) || 'Not verified'}</p>
      {notice && <p role="status">{notice}</p>}
      {copy && ctx.fileTransfers && (
        <div className="actions">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await ctx.fileTransfers?.reveal(copy);
              })
            }
          >
            Open provider folder
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await session.perform(async () => {
                  await ctx.fileTransfers?.verify(copy);
                });
                setNotice(
                  'Stored copy verified on this device. Provider upload status is not checked.',
                );
              })
            }
          >
            Verify stored copy
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setManage(!manage);
            }}
          >
            Manage local space
          </button>
        </div>
      )}
      {!copy && (
        <p className="hint">
          Copy-location controls are available on the computer that made this transfer.
        </p>
      )}
      {manage && copy && (
        <div className="cloud-space">
          <h3>Free space after upload</h3>
          <p>
            Check that your provider has finished uploading, then use its “Free up space” or
            “Online-only” action in the provider folder. BenchWork does not change your provider’s
            offline availability.
          </p>
          <p>
            You can also move the separate original source to the Recycle Bin. Existing links and
            scripts may need a new file path. Emptying the Recycle Bin is a separate step. Removing
            a source from a synced folder could also delete its cloud copy.
          </p>
          <p className="hint">Original: {copy.source}</p>
          {data['sourceRemoved'] === true ? (
            <p>Original source moved to the Recycle Bin.</p>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={uploaded}
                  onChange={(e) => {
                    setUploaded(e.target.checked);
                  }}
                />
                I checked that the provider has finished uploading this file
              </label>
              <button
                type="button"
                disabled={busy || !uploaded || sourceInCloud}
                onClick={() =>
                  void action(async () => {
                    await session.perform(async () => {
                      await ctx.fileTransfers?.recycleSource(copy);
                      await ctx.vault.updateRecord(path, {
                        sourceRemoved: true,
                        cloudSync: 'confirmed-by-user',
                      });
                    });
                  })
                }
              >
                Move original to Recycle Bin
              </button>
              {sourceInCloud && (
                <p className="hint">
                  This source is inside a connected provider folder. Manage it with that provider’s
                  app.
                </p>
              )}
            </>
          )}
        </div>
      )}
      <button type="button" className="quiet" onClick={() => void ctx.app.open(path)}>
        Open storage record
      </button>
    </section>
  );
}
