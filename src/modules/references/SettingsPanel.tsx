import { useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import type { LibraryState } from './state';

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
}: {
  ctx: ModuleContext;
  library: LibraryState;
}) {
  const snap = useSyncExternalStore(library.subscribe, library.current);

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
      <p>
        Library: <span className="path">{snap.path}</span>
      </p>
      <p role="status">
        {snap.status === 'loading' && 'Reading the library…'}
        {snap.status === 'ready' &&
          `${String(snap.count)} ${snap.count === 1 ? 'reference' : 'references'}, last changed ${when(snap.modified)}.`}
        {snap.status === 'missing' && 'No file there yet.'}
        {snap.status === 'error' && `This file could not be used. ${snap.error ?? ''}`}
      </p>
      <button type="button" onClick={() => void choose()}>
        Choose library file
      </button>
      <p className="hint">
        In Zotero with Better BibTeX: right-click your library, choose Export, pick Better CSL JSON,
        tick Keep updated, and save it in this vault. Citations are written as [@key].
      </p>
    </div>
  );
}
