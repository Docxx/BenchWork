import { useEffect, useState } from 'react';
import { formatSize } from '../files/fileKinds';
import { BACKUP_KEEP_RANGE, defaultBackupPlan, type BackupEvery } from '../settings/appSettings';
import { useApp } from './AppStoreContext';

const EVERY: { value: BackupEvery; label: string }[] = [
  { value: 'day', label: 'Every day' },
  { value: 'week', label: 'Every week' },
  { value: 'off', label: 'Only when I choose' },
];

function when(iso: string | null): string {
  if (iso === null) return 'Not yet backed up.';
  return `Last backed up ${new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}.`;
}

/**
 * Backups of the whole vault: a dated copy in a folder outside it, made on
 * a schedule or on request, and restored into a new folder to open.
 */
export function BackupSettings({ root }: { root: string }) {
  const available = useApp((s) => s.backupsAvailable);
  const stored = useApp((s) => s.settings.backups[root]);
  const plan = stored ?? defaultBackupPlan();
  const list = useApp((s) => s.backupList);
  const busy = useApp((s) => s.backupBusy);
  const message = useApp((s) => s.backupMessage);
  const setBackupPlan = useApp((s) => s.setBackupPlan);
  const chooseBackupFolder = useApp((s) => s.chooseBackupFolder);
  const backUpNow = useApp((s) => s.backUpNow);
  const refreshBackups = useApp((s) => s.refreshBackups);
  const restoreBackup = useApp((s) => s.restoreBackup);
  const switchToVault = useApp((s) => s.switchToVault);
  const [keep, setKeep] = useState(String(plan.keep));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

  if (!available) {
    return (
      <fieldset className="field">
        <legend>Backups</legend>
        <p className="hint">Backups are made from your computer.</p>
      </fieldset>
    );
  }

  const commitKeep = () => {
    const n = Number(keep);
    if (Number.isInteger(n) && n !== plan.keep) void setBackupPlan({ keep: n });
  };

  return (
    <fieldset className="field backups">
      <legend>Backups</legend>
      <p className="hint">
        A dated copy of the whole vault, kept in a folder outside it, ideally on another drive.
      </p>
      <div className="backup-folder">
        <p className="path">{plan.folder ?? 'No folder chosen yet.'}</p>
        <button type="button" onClick={() => void chooseBackupFolder()}>
          {plan.folder === null ? 'Choose a folder' : 'Change folder'}
        </button>
      </div>

      {plan.folder !== null && (
        <>
          <div className="choice-row" role="radiogroup" aria-label="How often">
            {EVERY.map((o) => (
              <label key={o.value} className="choice">
                <input
                  type="radio"
                  name="backup-every"
                  checked={plan.every === o.value}
                  onChange={() => void setBackupPlan({ every: o.value })}
                />
                {o.label}
              </label>
            ))}
          </div>
          <div className="with-unit">
            <label className="label" htmlFor="backup-keep">
              Keep the last
            </label>
            <input
              id="backup-keep"
              type="number"
              inputMode="numeric"
              min={BACKUP_KEEP_RANGE.min}
              max={BACKUP_KEEP_RANGE.max}
              value={keep}
              onChange={(e) => {
                setKeep(e.target.value);
              }}
              onBlur={commitKeep}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitKeep();
              }}
            />
            <span>backups</span>
          </div>
          <p className="hint">Older ones go to the Recycle Bin.</p>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => void backUpNow()}>
              {busy ? 'Backing up…' : 'Back up now'}
            </button>
            <span className="hint">{when(plan.last)}</span>
          </div>
        </>
      )}

      {message !== null && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      {restored !== null && (
        <div className="notice" role="status">
          <p>Restored into {restored}. Your vault was not changed.</p>
          <div className="actions">
            <button type="button" onClick={() => void switchToVault(restored)}>
              Open the restored copy
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setRestored(null);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {list !== null && list.length > 0 && (
        <ul className="backup-list" aria-label="Backups">
          {[...list].reverse().map((b) => (
            <li key={b.path}>
              <span className="backup-name">{b.name}</span>
              <span className="hint">{formatSize(b.size)}</span>
              {confirming === b.path ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      void restoreBackup(b.path).then((folder) => {
                        setRestored(folder);
                      });
                    }}
                  >
                    Restore a copy
                  </button>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      setConfirming(null);
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="quiet"
                  aria-label={`Restore ${b.name}`}
                  onClick={() => {
                    setConfirming(b.path);
                  }}
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirming !== null && (
        <p className="hint">
          The backup is unpacked into a new folder beside it. Your vault is left as it is.
        </p>
      )}
    </fieldset>
  );
}
