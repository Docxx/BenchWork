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

  const nameOf = (id: string) => modules.find((m) => m.manifest.id === id)?.manifest.name ?? id;

  return (
    <div className="modules">
      <p className="hint">Switching a module off never deletes its files.</p>

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
            const { id, name, version, description } = info.manifest;
            const on = info.status === 'on' || info.status === 'failed';
            return (
              <li key={id} className={`module ${info.status}`}>
                <div className="module-text">
                  <span className="module-name" id={`module-${id}-name`}>
                    {name} <span className="version">{version}</span>
                  </span>
                  {description !== '' && <span className="hint">{description}</span>}
                  <span className="module-status" id={`module-${id}-status`}>
                    {statusText(info)}
                  </span>
                </div>
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
