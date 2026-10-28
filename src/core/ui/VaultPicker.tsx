import { useEffect, useState } from 'react';
import { describeError, type PickMode } from '../state/appStore';
import { useApp } from './AppStoreContext';
import { vaultName } from './Sidebar';

/** The folder above a full path, or null at the top. */
function parentOf(path: string): string | null {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? null : path.slice(0, cut);
}

/**
 * Choosing the vault folder inside the app, on a tablet, where the system's
 * own picker gives no folder paths. Asks for access to the tablet's folders
 * first, so a vault that Syncthing keeps in step can be opened.
 */
export function ChooseFolder({ mode }: { mode: PickMode }) {
  const browser = useApp((s) => s.folderBrowser);
  const chooseBrowsedFolder = useApp((s) => s.chooseBrowsedFolder);
  const cancelFolder = useApp((s) => s.cancelFolder);
  const busy = useApp((s) => s.busy);
  const [access, setAccess] = useState(() => browser?.hasAccess() ?? false);
  const [path, setPath] = useState(browser?.start ?? '');
  const [folders, setFolders] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);

  // Coming back from the system screen, see whether access was allowed.
  useEffect(() => {
    if (!browser || access) return;
    const check = () => {
      setAccess(browser.hasAccess());
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [browser, access]);

  useEffect(() => {
    if (!browser || !access) return;
    let live = true;
    browser.folders(path).then(
      (names) => {
        if (!live) return;
        setFolders(names);
        setError(null);
      },
      (err: unknown) => {
        if (!live) return;
        setFolders([]);
        setError(describeError(err));
      },
    );
    return () => {
      live = false;
    };
  }, [browser, access, path]);

  if (!browser) return null;

  if (!access) {
    return (
      <main className="app picker">
        <section aria-labelledby="access-title">
          <h1 id="access-title">Allow BenchWork to use your folders</h1>
          <p>
            Your vault is an ordinary folder on this tablet, so a sync app such as Syncthing can
            keep it in step with your computer. BenchWork needs permission to open it.
          </p>
          <p>In the screen that opens, turn on Allow access to manage all files, then come back.</p>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                browser.askAccess();
              }}
            >
              Allow access
            </button>
            <button type="button" onClick={cancelFolder}>
              Cancel
            </button>
          </div>
        </section>
      </main>
    );
  }

  const up = path === browser.start ? null : parentOf(path);
  const makeFolder = async (name: string) => {
    const clean = name.trim();
    if (clean === '' || clean.includes('/')) return;
    const full = `${path}/${clean}`;
    try {
      await browser.makeFolder(full);
      setNewName(null);
      setPath(full);
    } catch (err) {
      setError(describeError(err));
    }
  };

  return (
    <main className="app picker">
      <section className="choose-folder" aria-labelledby="choose-title">
        <h1 id="choose-title">
          {mode === 'new' ? 'Choose a folder for the new vault' : 'Open a vault folder'}
        </h1>
        <p className="path">{path}</p>
        {error !== null && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <ul className="folder-list" aria-label="Folders">
          {up !== null && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setPath(up);
                }}
              >
                Up a level
              </button>
            </li>
          )}
          {folders?.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => {
                  setPath(`${path}/${name}`);
                }}
              >
                {name}
              </button>
            </li>
          ))}
          {folders?.length === 0 && <li className="hint">No folders here.</li>}
        </ul>
        {newName === null ? (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setNewName('');
            }}
          >
            New folder
          </button>
        ) : (
          <form
            className="new-folder"
            onSubmit={(e) => {
              e.preventDefault();
              void makeFolder(newName);
            }}
          >
            <input
              aria-label="New folder name"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
              }}
            />
            <button type="submit">Make folder</button>
          </form>
        )}
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => void chooseBrowsedFolder(path)}>
            {mode === 'new' ? 'Make the vault here' : 'Open this folder'}
          </button>
          <button type="button" disabled={busy} onClick={cancelFolder}>
            Cancel
          </button>
        </div>
      </section>
    </main>
  );
}

export function VaultPicker() {
  const chooseFolder = useApp((s) => s.chooseFolder);
  const busy = useApp((s) => s.busy);
  const notice = useApp((s) => s.notice);

  return (
    <main className="app picker">
      <h1>BenchWork</h1>
      <p>Choose a folder to keep your notebooks in.</p>
      {notice !== null && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => void chooseFolder('new')}>
          New vault
        </button>
        <button type="button" disabled={busy} onClick={() => void chooseFolder('open')}>
          Open vault
        </button>
      </div>
    </main>
  );
}

export function ConfirmFolder({ root }: { root: string }) {
  const confirmFolder = useApp((s) => s.confirmFolder);
  const cancelFolder = useApp((s) => s.cancelFolder);
  const busy = useApp((s) => s.busy);

  return (
    <main className="app picker">
      <section role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h1 id="confirm-title">Use this folder as a vault?</h1>
        <p className="path">{root}</p>
        <p>
          This folder already has files in it. BenchWork will add a hidden .benchwork folder and
          will not change your files.
        </p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => void confirmFolder()}>
            Use folder
          </button>
          <button type="button" disabled={busy} onClick={cancelFolder}>
            Cancel
          </button>
        </div>
      </section>
    </main>
  );
}

/** A synced folder with nothing in it yet: most likely a vault still on its way. */
export function ConfirmSyncing({ root }: { root: string }) {
  const confirmFolder = useApp((s) => s.confirmFolder);
  const cancelFolder = useApp((s) => s.cancelFolder);
  const busy = useApp((s) => s.busy);

  return (
    <main className="app picker">
      <section role="dialog" aria-modal="true" aria-labelledby="syncing-title">
        <h1 id="syncing-title">Nothing has synced here yet</h1>
        <p className="path">{root}</p>
        <p>
          A sync app is syncing this folder, but none of your notebooks have arrived. If your vault
          is on its way from another device, wait until the sync app shows it is up to date, then
          open the folder again.
        </p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={cancelFolder}>
            Wait for the sync
          </button>
          <button type="button" disabled={busy} onClick={() => void confirmFolder()}>
            Start a new vault here
          </button>
        </div>
      </section>
    </main>
  );
}

export function ConfirmNested({ folder, owner }: { folder: string; owner: string }) {
  const openOwnerVault = useApp((s) => s.openOwnerVault);
  const makeSeparateVault = useApp((s) => s.makeSeparateVault);
  const cancelFolder = useApp((s) => s.cancelFolder);
  const busy = useApp((s) => s.busy);
  const folderName = vaultName(folder);
  const ownerName = vaultName(owner);

  return (
    <main className="app picker">
      <section role="dialog" aria-modal="true" aria-labelledby="nested-title">
        <h1 id="nested-title">This folder is inside another vault</h1>
        <p className="path">{folder}</p>
        <p>
          {folderName} is inside the vault {ownerName}. You can open {ownerName}, or set up{' '}
          {folderName} as a separate vault. Your files are not changed either way.
        </p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => void openOwnerVault()}>
            Open {ownerName}
          </button>
          <button type="button" disabled={busy} onClick={() => void makeSeparateVault()}>
            Make {folderName} a separate vault
          </button>
          <button type="button" disabled={busy} onClick={cancelFolder}>
            Cancel
          </button>
        </div>
      </section>
    </main>
  );
}
