import { useState } from 'react';
import { useApp } from './AppStoreContext';
import './desktop-sync.css';

export function RelaySyncSettings() {
  const sync = useApp((s) => s.relaySync);
  const opened = useApp((s) => s.status.kind === 'open');
  const confirm = useApp((s) => s.confirmRelaySync);
  const create = useApp((s) => s.createCloudSync);
  const join = useApp((s) => s.joinCloudSync);
  const restore = useApp((s) => s.restoreCloudSync);
  const pair = useApp((s) => s.pairCloudDevice);
  const now = useApp((s) => s.syncCloudNow);
  const stop = useApp((s) => s.stopCloudSync);
  const close = useApp((s) => s.closeCloudSharing);
  const save = useApp((s) => s.saveCloudDetails);
  const [name, setName] = useState('My device');
  const [details, setDetails] = useState('');
  const [remove, setRemove] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [fileError, setFileError] = useState('');
  if (!opened || !sync.available)
    return (
      <p>Cloud sync is available with an open vault in the installed Windows and Android apps.</p>
    );
  const busy = sync.busy;
  return (
    <div className="desktop-sync-settings" aria-label="Cloud sync">
      <header>
        <h3>Cloud sync</h3>
        <p>
          Keep your devices together through your private relay. Notes merge automatically,
          including offline changes. Your PC can be switched off.
        </p>
        <p className="hint">
          Content is encrypted on your devices. The relay stores encrypted changes and attachments.
          Sync runs while BenchWork is open and reconnects when you return.
        </p>
      </header>
      {sync.error && (
        <p className="notice" role="alert">
          {sync.error}
        </p>
      )}
      {fileError && (
        <p className="notice" role="alert">
          {fileError}
        </p>
      )}
      {sync.message && <p role="status">{sync.message}</p>}
      <label className="choice">
        <input
          type="checkbox"
          checked={sync.confirmed}
          onChange={(e) => {
            confirm(e.target.checked);
          }}
        />
        I stopped Syncthing and other folder sync for this vault
      </label>
      {sync.enabled ? (
        <section className="desktop-sync-card">
          <h4>{busy ? 'Syncing…' : sync.lastSync ? 'Connected' : 'Waiting to sync'}</h4>
          <p className="hint">{sync.endpoint}</p>
          {sync.lastSync && (
            <p>Last synced {new Date(sync.lastSync).toLocaleTimeString('en-GB')}</p>
          )}
          {sync.report?.conflicts.length ? (
            <p role="status">Competing versions were kept: {sync.report.conflicts.join('; ')}</p>
          ) : null}
          {sync.report?.skipped.length ? (
            <p>Files over 32 MB were skipped: {sync.report.skipped.join(', ')}</p>
          ) : null}
          <button disabled={busy || !sync.confirmed} onClick={() => void now()}>
            Sync now
          </button>
          {sync.devices.length > 0 && <p>Devices: {sync.devices.join(', ')}</p>}
          {sync.owner && (
            <>
              <button disabled={busy || !sync.confirmed} onClick={() => void pair()}>
                Pair another device
              </button>
              {sync.pairing && (
                <label>
                  Single-use pairing details, valid for ten minutes
                  <textarea
                    aria-label="Cloud pairing details"
                    readOnly
                    value={sync.pairing}
                    rows={5}
                    onFocus={(e) => {
                      e.target.select();
                    }}
                  />
                  <span className="hint">
                    Transfer privately, then paste into Cloud sync on the other device.
                  </span>
                </label>
              )}
              {sync.pairing && (
                <button
                  disabled={busy}
                  onClick={() => {
                    void save('pairing');
                  }}
                >
                  Save pairing file to Downloads
                </button>
              )}
              <button
                onClick={() => {
                  setShowRecovery(!showRecovery);
                }}
              >
                {showRecovery ? 'Hide recovery details' : 'Show recovery details'}
              </button>
              {showRecovery && (
                <label>
                  Recovery details
                  <textarea
                    aria-label="Cloud recovery details"
                    readOnly
                    value={sync.recovery}
                    rows={5}
                    onFocus={(e) => {
                      e.target.select();
                    }}
                  />
                  <span className="hint">
                    Keep these privately outside this vault. They contain your encryption key and
                    owner access. Losing every device and these details makes the encrypted relay
                    data unreadable.
                  </span>
                </label>
              )}
              {showRecovery && (
                <button
                  disabled={busy}
                  onClick={() => {
                    void save('recovery');
                  }}
                >
                  Save recovery file to Downloads
                </button>
              )}
            </>
          )}
          <button disabled={busy} onClick={() => void stop()}>
            Disconnect this device
          </button>
          {sync.owner && (
            <details>
              <summary>Remove device access</summary>
              <p>
                Close this sharing group to remove every device and unused invitation. Files stay on
                each device. Future sharing needs a new server setup code and a new encryption key;
                pair trusted devices again.
              </p>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={remove}
                  onChange={(e) => {
                    setRemove(e.target.checked);
                  }}
                />
                Close sharing for every device
              </label>
              <button
                disabled={busy || !remove}
                onClick={() => {
                  void close();
                  setRemove(false);
                }}
              >
                Close sharing group
              </button>
            </details>
          )}
        </section>
      ) : (
        <section className="desktop-sync-card">
          <label>
            Import connection file
            <input
              aria-label="Import cloud connection file"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setFileError('');
                if (file.size > 16000) {
                  setFileError('Choose a connection file smaller than 16 KB.');
                  return;
                }
                void file
                  .text()
                  .then(setDetails)
                  .catch(() => {
                    setFileError('This connection file could not be read.');
                  });
              }}
            />
          </label>
          <label>
            Device name
            <input
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </label>
          <label>
            Setup, pairing or recovery details
            <textarea
              aria-label="Cloud connection details"
              rows={5}
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
              }}
            />
          </label>
          <button
            disabled={busy || !sync.confirmed || !details.trim() || !name.trim()}
            onClick={() => void join(details, name)}
          >
            Connect this device
          </button>
          <details>
            <summary>First device or recovery</summary>
            <p>
              On the first device, paste the private server setup details to start sharing this
              vault. On other devices, use pairing details instead. Existing divergent files are
              kept separately.
            </p>
            <button
              disabled={busy || !sync.confirmed || !details.trim() || !name.trim()}
              onClick={() => void create(details, name)}
            >
              Set up this vault
            </button>
            <button
              disabled={busy || !sync.confirmed || !details.trim()}
              onClick={() => void restore(details)}
            >
              Restore with recovery details
            </button>
          </details>
        </section>
      )}
    </div>
  );
}
