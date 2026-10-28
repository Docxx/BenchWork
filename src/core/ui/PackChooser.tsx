import { useState } from 'react';
import { PACKS, type ModulePack } from '../modules/packs';
import { useApp } from './AppStoreContext';

/**
 * Asked once, when a vault is set up: what it is for. The pack chosen
 * switches on the modules that suit; each can be switched off later in
 * Settings > Modules, where the packs are too.
 */
export function PackChooser() {
  const enablePack = useApp((s) => s.enablePack);
  const setChoosingPack = useApp((s) => s.setChoosingPack);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<string[] | null>(null);

  const choose = async (pack: ModulePack | null) => {
    if (pack === null) {
      setChoosingPack(false);
      return;
    }
    setBusy(true);
    const notHere = await enablePack(pack.modules);
    setBusy(false);
    if (notHere.length === 0) setChoosingPack(false);
    else setLeft(notHere);
  };

  return (
    <div className="pack-backdrop">
      <section
        className="floating-dialog confirm pack-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pack-title"
      >
        <h2 id="pack-title" className="dialog-title">
          What do you do?
        </h2>
        {left === null ? (
          <>
            <p className="hint">
              BenchWork switches on the tools that suit. You can change them at any time in Settings
              &gt; Modules.
            </p>
            <div className="pack-list">
              {PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  className="pack-card"
                  disabled={busy}
                  onClick={() => void choose(pack)}
                >
                  <strong>{pack.name}</strong>
                  <span>{pack.description}</span>
                </button>
              ))}
              <button
                type="button"
                className="pack-card"
                disabled={busy}
                onClick={() => void choose(null)}
              >
                <strong>Just notes</strong>
                <span>Notebooks, pages, drawings and search, with nothing more switched on.</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Switched on. Left off, as they do not run on this device: {left.join(', ')}.</p>
            <div className="actions">
              <button
                type="button"
                onClick={() => {
                  setChoosingPack(false);
                }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
