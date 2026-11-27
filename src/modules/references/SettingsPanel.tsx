import { useState, useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import type { LibraryState } from './state';
import type { ZoteroConnection } from './zoteroAccount';
import { ZOTERO_KEYS_PAGE } from './zoteroWeb';

function when(ms: number | null): string {
  if (ms === null) return '';
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Settings > Modules > References: which file is the library, and how it is. */
export function ReferencesSettings({
  ctx,
  library,
  zotero,
}: {
  ctx: ModuleContext;
  library: LibraryState;
  zotero: ZoteroConnection;
}) {
  const snap = useSyncExternalStore(library.subscribe, library.current);
  const account = useSyncExternalStore(zotero.subscribe, zotero.current);
  const [key, setKey] = useState('');
  const [connecting, setConnecting] = useState(false);

  const choose = async () => {
    const [picked] = await ctx.vault.pickFiles({
      title: 'Choose the library file Better BibTeX keeps up to date',
      multiple: false,
    });
    if (picked === undefined) return;
    const path = ctx.vault.vaultPathOf(picked);
    if (path === null) {
      ctx.app.notify('Choose a file inside the vault, so it syncs with your notes.');
      return;
    }
    await library.choose(path);
  };

  return (
    <div className="references-settings">
      <h3>Zotero account</h3>
      {account.account ? (
        <>
          <p>
            Connected{account.account.username ? ` as ${account.account.username}` : ''} on this
            device. {snap.zotero ? 'The library comes from your Zotero account.' : ''}
          </p>
          <div className="actions">
            <button type="button" disabled={account.syncing} onClick={() => void zotero.sync()}>
              {account.syncing ? 'Syncing…' : 'Sync now'}
            </button>
            {!snap.zotero && (
              <button type="button" onClick={() => void library.useZotero(true)}>
                Use Zotero account
              </button>
            )}
            <button type="button" onClick={() => void zotero.disconnect()}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint">
            Brings in your collections, tags and new papers. In Zotero, turn on sync, then make a
            key with library read access and paste it here. Each device keeps its own key; a device
            without one still sees the library another device fetched.
          </p>
          <form
            className="actions"
            onSubmit={(e) => {
              e.preventDefault();
              setConnecting(true);
              zotero
                .connect(key)
                .then(() => {
                  setKey('');
                })
                .catch(() => undefined)
                .finally(() => {
                  setConnecting(false);
                });
            }}
          >
            <input
              type="password"
              aria-label="Zotero key"
              placeholder="Zotero key"
              autoComplete="off"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
              }}
            />
            <button type="submit" disabled={connecting || key.trim() === ''}>
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
            <button type="button" onClick={() => void ctx.web.open(ZOTERO_KEYS_PAGE)}>
              Make a key
            </button>
          </form>
        </>
      )}
      {account.error && <p role="alert">{account.error}</p>}
      <h3>Library file</h3>
      <p>
        Library: <span className="path">{snap.path}</span>
      </p>
      <p role="status" aria-label="Reference library status">
        {snap.status === 'loading' && 'Reading the library…'}
        {snap.status === 'ready' &&
          `${String(snap.count)} ${snap.count === 1 ? 'reference' : 'references'}, last changed ${when(snap.modified)}.`}
        {snap.status === 'missing' && 'No file there yet.'}
        {snap.status === 'error' && `This file could not be used. ${snap.error ?? ''}`}
      </p>
      <button type="button" onClick={() => void choose()}>
        Choose Better BibTeX file
      </button>
      <p className="hint">
        In Zotero with Better BibTeX: right-click your library, choose Export, pick Better CSL JSON,
        tick Keep updated, and save it in this vault. Citations are written as [@key].
      </p>
    </div>
  );
}
