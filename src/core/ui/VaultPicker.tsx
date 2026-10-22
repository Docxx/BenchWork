import { useApp } from './AppStoreContext';
import { vaultName } from './Sidebar';

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
