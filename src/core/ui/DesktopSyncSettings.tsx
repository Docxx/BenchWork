import { useState, useEffect } from 'react';
import { useApp } from './AppStoreContext';
import './desktop-sync.css';
export function DesktopSyncSettings() {
  const sync = useApp((s) => s.desktopSync);
  const desktop = useApp((s) => s.status.kind === 'open' && s.desktopSync.available);
  const start = useApp((s) => s.startDesktopSync);
  const stop = useApp((s) => s.stopDesktopSync);
  const invite = useApp((s) => s.createDesktopPairing);
  const exportPair = useApp((s) => s.exportDesktopPairing);
  const importPair = useApp((s) => s.importDesktopPairing);
  const pair = useApp((s) => s.pairDesktopSync);
  const now = useApp((s) => s.syncDesktopNow);
  const revoke = useApp((s) => s.revokeDesktopDevices);
  const confirm = useApp((s) => s.confirmOtherSyncStopped);
  const [ip, setIp] = useState<string | null>(null);
  const [name, setName] = useState('My tablet');
  const [text, setText] = useState('');
  const [remove, setRemove] = useState(false);
  const [time, setTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const expired = sync.pairing && sync.pairing.expires * 1000 < time;
  if (!desktop) return <p>Desktop Sync is available in the installed Windows and Android apps.</p>;
  return (
    <div className="desktop-sync-settings">
      <header>
        <h3>Desktop Sync</h3>
        <p>
          Keep saved notes, documents and teaching material together across your devices, through
          your own PC.
        </p>
      </header>
      {sync.error && (
        <p className="notice" role="alert">
          {sync.error}
        </p>
      )}
      {sync.message && <p role="status">{sync.message}</p>}
      {sync.needsConfirmation && (
        <label className="choice">
          <input
            type="checkbox"
            checked={sync.confirmed}
            onChange={(e) => {
              confirm(e.target.checked);
            }}
          />
          I paused Syncthing for this vault and will leave it paused while Desktop Sync is enabled
        </label>
      )}
      <div className="desktop-sync-grid">
        {sync.canHost && (
          <section className="desktop-sync-card">
            <span className="desktop-sync-step">01 · ON YOUR DESKTOP</span>
            <h3>Host this vault</h3>
            <p className="hint">
              Keep BenchWork open and the PC awake. Use the same local network as the tablet. If
              Windows asks, allow BenchWork on your trusted private network.
            </p>
            <label>
              Desktop local IPv4 address
              <input
                aria-label="Desktop server address"
                value={ip ?? sync.ip}
                disabled={sync.running || sync.busy}
                onChange={(e) => {
                  setIp(e.target.value);
                }}
                placeholder="192.168.1.10"
              />
            </label>
            <button
              disabled={sync.busy || sync.running || sync.mode === 'client'}
              onClick={() => {
                void start(ip ?? sync.ip);
              }}
            >
              Start desktop server
            </button>
            {sync.mode === 'host' && (
              <>
                <p className="desktop-sync-endpoint">
                  {sync.running ? 'Listening' : 'Stopped'} · {sync.endpoint || sync.ip}
                </p>
                <button
                  disabled={!sync.running || sync.busy}
                  onClick={() => {
                    void invite();
                  }}
                >
                  Pair another device
                </button>
                <h4>Paired devices</h4>
                {sync.devices.length ? (
                  <ul>
                    {sync.devices.map((device, i) => (
                      <li key={i}>{device}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">No devices paired yet.</p>
                )}
                {sync.devices.length > 0 && (
                  <>
                    <label className="choice">
                      <input
                        type="checkbox"
                        checked={remove}
                        onChange={(e) => {
                          setRemove(e.target.checked);
                        }}
                      />
                      Remove access for all paired devices
                    </label>
                    <button
                      disabled={sync.busy || !remove}
                      onClick={() => {
                        void revoke();
                        setRemove(false);
                      }}
                    >
                      Remove paired devices
                    </button>
                  </>
                )}
              </>
            )}
            {sync.pairing && (
              <div className="desktop-sync-pairing">
                <img
                  src={`data:image/svg+xml,${encodeURIComponent(sync.pairing.svg)}`}
                  alt="Short-lived BenchWork device pairing code"
                />
                <p>
                  {expired
                    ? 'Code expired. Generate a new one.'
                    : 'Single-use pairing details, valid for ten minutes.'}
                </p>
                <button
                  disabled={sync.busy || !!expired}
                  onClick={() => {
                    void exportPair();
                  }}
                >
                  Save pairing file to Downloads
                </button>
                <details>
                  <summary>Pairing details for copying</summary>
                  <textarea
                    aria-label="Desktop pairing details"
                    readOnly
                    value={sync.pairing.text}
                    rows={5}
                    onFocus={(e) => {
                      e.target.select();
                    }}
                  />
                </details>
              </div>
            )}
          </section>
        )}
        <section className="desktop-sync-card">
          <span className="desktop-sync-step">02 · ON YOUR TABLET</span>
          <h3>Connect to your desktop</h3>
          <p className="hint">
            Open a local vault here. Existing files are retained; conflicting versions get separate
            copies. Import the desktop's pairing file, or paste its pairing details.
          </p>
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
          <button
            disabled={sync.busy || sync.mode === 'host'}
            onClick={() => {
              void importPair(name);
            }}
          >
            Import pairing file
          </button>
          <details>
            <summary>Paste pairing details instead</summary>
            <textarea
              aria-label="Pairing details from desktop"
              value={text}
              rows={5}
              onChange={(e) => {
                setText(e.target.value);
              }}
            />
            <button
              disabled={sync.busy || !text.trim() || sync.mode === 'host'}
              onClick={() => {
                void pair(text, name);
              }}
            >
              Pair with desktop
            </button>
          </details>
          {sync.mode === 'client' && (
            <>
              <p className="desktop-sync-endpoint">Paired with {sync.endpoint}</p>
              <button
                disabled={sync.busy}
                onClick={() => {
                  void now();
                }}
              >
                {sync.busy ? 'Syncing…' : 'Sync now'}
              </button>
              <p className="hint">
                Automatically checks every 15 seconds while BenchWork is running. Offline edits stay
                here until the desktop is reachable.
              </p>
              {sync.lastSync && <p>Last sync: {new Date(sync.lastSync).toLocaleString()}</p>}
            </>
          )}
        </section>
      </div>
      {sync.mode !== 'off' && (
        <button
          disabled={sync.busy}
          onClick={() => {
            void stop();
          }}
        >
          Disable Desktop Sync on this device
        </button>
      )}
      {sync.report?.conflicts.length ? (
        <section>
          <h4>Versions kept for review</h4>
          <ul>
            {sync.report.conflicts.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {sync.report?.skipped.length ? (
        <details>
          <summary>{sync.report.skipped.length} large files left on their original devices</summary>
          <ul>
            {sync.report.skipped.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="hint">
        Encrypted device connection. Saved vault files up to 32 MB sync; large datasets, sign-ins,
        device settings and hidden folders stay local. Concurrent edits are preserved as separate
        versions. Empty folders are created when their first file arrives. Cloud hosting and live
        co-editing come later.
      </p>
    </div>
  );
}
