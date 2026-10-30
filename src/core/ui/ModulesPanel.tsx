import { useState } from 'react';
import { PACKS } from '../modules/packs';
import type { ModuleInfo } from '../modules/registry';
import { useApp } from './AppStoreContext';

function statusText(info: ModuleInfo): string {
  switch (info.status) {
    case 'on':
      return 'On';
    case 'failed':
      return `Failed to start: ${info.error ?? 'unknown error'}`;
    case 'unavailable':
      return 'Not available on this device';
    case 'off':
      return info.error ?? 'Off';
  }
}

export function ModulesPanel() {
  const { modules, broken } = useApp((s) => s.modules);
  const pending = useApp((s) => s.pendingModuleChange);
  const notice = useApp((s) => s.moduleNotice);
  const busy = useApp((s) => s.moduleBusy);
  const setModuleEnabled = useApp((s) => s.setModuleEnabled);
  const enablePack = useApp((s) => s.enablePack);
  const [packNote, setPackNote] = useState<string | null>(null);

  const nameOf = (id: string) => modules.find((m) => m.manifest.id === id)?.manifest.name ?? id;

  return (
    <div className="modules">
      <p className="hint">Switching a module off never deletes its files.</p>

      <fieldset className="field">
        <legend>Packs</legend>
        <p className="hint">Switch on the modules that suit a kind of work, all at once.</p>
        <div className="pack-row">
          {PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              title={pack.description}
              disabled={busy}
              onClick={() => {
                void enablePack(pack.modules).then((left) => {
                  setPackNote(
                    left.length === 0
                      ? `${pack.name} pack switched on.`
                      : `${pack.name} pack switched on. Left off, as they do not run on this device: ${left.join(', ')}.`,
                  );
                });
              }}
            >
              Switch on {pack.name}
            </button>
          ))}
        </div>
        {packNote !== null && (
          <p className="hint" role="status">
            {packNote}
          </p>
        )}
      </fieldset>

      {notice !== null && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}

      {pending !== null && <ConfirmChange names={pending.ids.map(nameOf)} {...pending} />}

      {modules.length === 0 ? (
        <p className="empty">No modules installed.</p>
      ) : (
        <ul className="module-list" aria-label="Modules">
          {modules.map((info) => {
            const { id, name, version, description, network } = info.manifest;
            const on = info.status === 'on' || info.status === 'failed';
            return (
              <li key={id} className={`module ${info.status}`}>
                <div className="module-text">
                  <span className="module-name" id={`module-${id}-name`}>
                    {name} <span className="version">{version}</span>
                  </span>
                  {description !== '' && <span className="hint">{description}</span>}
                  {network.length > 0 && (
                    <span className="hint module-network">
                      Uses the internet: {network.join(', ')}
                    </span>
                  )}
                  <span className="module-status" id={`module-${id}-status`}>
                    {statusText(info)}
                  </span>
                </div>
                {on && <ModuleSettings id={id} />}
                <button
                  type="button"
                  role="switch"
                  className="switch"
                  aria-checked={on}
                  aria-labelledby={`module-${id}-name`}
                  aria-describedby={`module-${id}-status`}
                  disabled={busy || info.status === 'unavailable' || pending !== null}
                  onClick={() => void setModuleEnabled(id, !on)}
                >
                  <span className="switch-knob" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {broken.length > 0 && (
        <section className="problems" aria-labelledby="module-problems">
          <h3 id="module-problems">Modules that could not load</h3>
          <ul>
            {broken.map((b) => (
              <li key={b.folder}>
                <strong>{b.folder}</strong>: {b.errors.join(' ')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A module's own options, under it while it is on. */
function ModuleSettings({ id }: { id: string }) {
  const panel = useApp((s) => s.settingsPanels.find((p) => p.moduleId === id));
  if (!panel) return null;
  return <div className="module-settings">{panel.render()}</div>;
}

function ConfirmChange({ id, enable, names }: { id: string; enable: boolean; names: string[] }) {
  const confirm = useApp((s) => s.confirmModuleChange);
  const cancel = useApp((s) => s.cancelModuleChange);
  const busy = useApp((s) => s.moduleBusy);
  const modules = useApp((s) => s.modules.modules);
  const name = modules.find((m) => m.manifest.id === id)?.manifest.name ?? id;
  const others = names.filter((n) => n !== name).join(', ');

  return (
    <div className="confirm" role="alertdialog" aria-labelledby="module-confirm-text">
      <p id="module-confirm-text">
        {enable
          ? `Switching on ${name} also switches on ${others}.`
          : `Switching off ${name} also switches off ${others}, which need it.`}
      </p>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => void confirm()}>
          Continue
        </button>
        <button type="button" disabled={busy} onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
