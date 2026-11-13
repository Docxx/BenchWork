import { useApp } from './AppStoreContext';

export function AppUpdates({ compact = false }: { compact?: boolean }) {
  const update = useApp((s) => s.appUpdate);
  const supported = useApp((s) => s.canUpdateApp);
  const automatic = useApp((s) => s.settings.checkUpdatesOnStart);
  const setAutomatic = useApp((s) => s.setUpdateChecks);
  const check = useApp((s) => s.checkAppUpdates);
  const download = useApp((s) => s.downloadAppUpdate);
  const install = useApp((s) => s.installAppUpdate);
  const dismiss = useApp((s) => s.dismissAppUpdate);
  const busy = ['checking', 'downloading', 'installing'].includes(update.phase);
  if (compact && (!update.available || update.dismissed)) return null;
  if (!supported)
    return compact ? null : (
      <p className="hint">
        In-app installation is available in the installed Windows and Android apps.
      </p>
    );
  return (
    <div className={compact ? 'app-update-banner' : 'app-update-controls'} aria-label="App updates">
      {!compact && (
        <>
          <label className="choice">
            <input
              type="checkbox"
              checked={automatic}
              onChange={(e) => {
                void setAutomatic(e.target.checked);
              }}
            />
            Check for updates when BenchWork starts
          </label>
          <button
            disabled={busy}
            onClick={() => {
              void check();
            }}
          >
            {update.phase === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        </>
      )}
      {update.available ? (
        <>
          <p>
            <strong>BenchWork {update.available.version} is available</strong>
          </p>
          {!compact && update.available.notes && (
            <details>
              <summary>What changed</summary>
              <p style={{ whiteSpace: 'pre-wrap' }}>{update.available.notes}</p>
            </details>
          )}
          {update.phase === 'downloading' ? (
            <p role="status">Downloading update… {update.progress}%</p>
          ) : update.phase === 'ready' || update.phase === 'installing' ? (
            <button
              disabled={busy}
              onClick={() => {
                void install();
              }}
            >
              {update.phase === 'installing' ? 'Saving work…' : 'Install update'}
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => {
                void download();
              }}
            >
              Download update
            </button>
          )}
          {compact && (
            <button disabled={busy} aria-label="Dismiss update notification" onClick={dismiss}>
              Later
            </button>
          )}
        </>
      ) : (
        update.checked && <p role="status">You’re up to date.</p>
      )}
      {update.message && <p role="status">{update.message}</p>}
      {update.error && <p role="alert">{update.error}</p>}
      {!compact && (
        <p className="hint">
          Updates come from your BenchWork server. Downloads are checked before installation. You
          choose when to install.
        </p>
      )}
    </div>
  );
}
